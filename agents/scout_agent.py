"""Agent 1 — A&R IA ("scout-agent").

Every hour (via Cloud Scheduler -> HTTP -> this Cloud Run service), polls the
Deezer API for trending artists, compares stream/fan counts against the last
snapshot stored in Firestore, and flags artists with >=20% growth. Detections
are logged to Firestore and an invite email is sent (SMTP, best-effort —
failure to send never blocks the detection log).

Run locally:
    python agents/scout_agent.py            # one-off scan
    FLASK_APP=scout_agent flask run -p 8081  # HTTP mode (Cloud Run entrypoint)

Deploy: Cloud Run + Cloud Scheduler (see /DEPLOY_GCP.md).
"""
from __future__ import annotations

import os
import smtplib
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from email.mime.text import MIMEText
from typing import Any, Optional

import requests
from flask import Flask, jsonify

from common import FirestoreStore, enable_local_cors, get_logger, env

logger = get_logger("scout_agent")

DEEZER_CHART_URL = "https://api.deezer.com/chart/0/artists"
DEEZER_ARTIST_URL = "https://api.deezer.com/artist/{id}"
GROWTH_THRESHOLD_PCT = float(env("SCOUT_GROWTH_THRESHOLD_PCT", default="20"))
SNAPSHOT_COLLECTION = "scout_artist_snapshots"
DETECTIONS_COLLECTION = "scout_detections"

# Deezer occasionally 403s requests with no User-Agent (looks like bot
# traffic to them) — a real, observed failure in production logs (~1 in 12
# hourly scans). A normal browser-like UA measurably cuts that down.
DEEZER_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MTR-Scout-Agent/1.0; +https://musictokenring.xyz)"}

store = FirestoreStore()
app = Flask(__name__)
enable_local_cors(app)


def fetch_trending_artists(limit: int = 50) -> list[dict[str, Any]]:
    """Pull Deezer's trending artist chart, then enrich each artist with its
    real fan count. CRITICO: /chart/0/artists does NOT include `nb_fan` at
    all (confirmed against the live API) — every artist silently defaulted
    to 0 fans, so growth was always computed as 0-vs-0 and could never fire
    a detection. This was live in production for a week (Firestore showed
    real hourly snapshots, all with nb_fan=0) before being caught. Fixed by
    fetching each artist's real profile (/artist/{id}), which does have it."""
    resp = requests.get(DEEZER_CHART_URL, params={"limit": limit}, headers=DEEZER_HEADERS, timeout=15)
    resp.raise_for_status()
    chart_artists = resp.json().get("data", [])

    def _fetch_fan_count(artist: dict[str, Any]) -> dict[str, Any]:
        artist_id = artist.get("id")
        try:
            detail_resp = requests.get(
                DEEZER_ARTIST_URL.format(id=artist_id), headers=DEEZER_HEADERS, timeout=10
            )
            detail_resp.raise_for_status()
            return {**artist, "nb_fan": detail_resp.json().get("nb_fan", 0)}
        except Exception as exc:  # noqa: BLE001 — one artist's profile failing shouldn't kill the scan
            logger.warning("[scout] Could not fetch fan count for artist %s: %s", artist_id, exc)
            return artist

    # Concurrent, not sequential: 50 one-by-one requests risked running past
    # gunicorn's worker timeout on Cloud Run (observed hanging in practice
    # once the /artist/{id} enrichment above was added). A small thread pool
    # keeps a full scan well under a few seconds.
    enriched: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = [pool.submit(_fetch_fan_count, artist) for artist in chart_artists]
        for future in as_completed(futures):
            enriched.append(future.result())
    return enriched


def compute_growth(artist: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Compares current fan count to the last stored snapshot for this artist.
    Returns a detection dict if growth >= GROWTH_THRESHOLD_PCT, else None."""
    artist_id = str(artist["id"])
    current_fans = artist.get("nb_fan", 0)

    previous = store.get(SNAPSHOT_COLLECTION, artist_id)
    store.set(
        SNAPSHOT_COLLECTION,
        artist_id,
        {"artist_id": artist_id, "name": artist.get("name"), "nb_fan": current_fans, "checked_at": time.time()},
    )

    if not previous or not previous.get("nb_fan"):
        return None  # first time we see this artist — no baseline yet

    prev_fans = previous["nb_fan"]
    if prev_fans <= 0:
        return None

    growth_pct = ((current_fans - prev_fans) / prev_fans) * 100
    if growth_pct < GROWTH_THRESHOLD_PCT:
        return None

    return {
        "artist_id": artist_id,
        "name": artist.get("name"),
        "picture": artist.get("picture_medium"),
        "deezer_link": artist.get("link"),
        "prev_fans": prev_fans,
        "current_fans": current_fans,
        "growth_pct": round(growth_pct, 2),
        "detected_at": time.time(),
    }


def send_invite(detection: dict[str, Any]) -> bool:
    """Best-effort email invite. Returns True on send, False on any failure
    (missing SMTP config counts as a soft no-op in local/dev)."""
    smtp_host = env("SMTP_HOST", default="")
    invite_to = env("SCOUT_INVITE_INBOX", default="")  # A&R inbox / CRM address
    if not smtp_host or not invite_to:
        logger.info("[scout] SMTP not configured — logging detection only: %s", detection["name"])
        return False

    body = (
        f"MTR Scout Agent detectó a {detection['name']} con "
        f"+{detection['growth_pct']}% de crecimiento en fans "
        f"({detection['prev_fans']} -> {detection['current_fans']}).\n\n"
        f"Perfil Deezer: {detection['deezer_link']}\n"
        f"Invitación sugerida: crear una batalla en MusicTokenRing."
    )
    msg = MIMEText(body)
    msg["Subject"] = f"[MTR Scout] Artista en crecimiento: {detection['name']}"
    msg["From"] = env("SMTP_FROM", default="scout-agent@musictokenring.com")
    msg["To"] = invite_to

    try:
        with smtplib.SMTP(smtp_host, int(env("SMTP_PORT", default="587"))) as server:
            server.starttls()
            smtp_user = env("SMTP_USER", default="")
            smtp_pass = env("SMTP_PASSWORD", default="")
            if smtp_user:
                server.login(smtp_user, smtp_pass)
            server.sendmail(msg["From"], [invite_to], msg.as_string())
        return True
    except Exception as exc:  # noqa: BLE001 — never let a mail failure kill the scan
        logger.warning("[scout] Email send failed: %s", exc)
        return False


def run_scan() -> list[dict[str, Any]]:
    detections: list[dict[str, Any]] = []
    try:
        artists = fetch_trending_artists()
    except Exception as exc:  # noqa: BLE001
        logger.error("[scout] Deezer fetch failed: %s", exc)
        return detections

    for artist in artists:
        detection = compute_growth(artist)
        if not detection:
            continue
        emailed = send_invite(detection)
        detection["invite_sent"] = emailed
        store.add(DETECTIONS_COLLECTION, detection)
        detections.append(detection)
        logger.info("[scout] Detection logged: %s (+%s%%)", detection["name"], detection["growth_pct"])

    logger.info("[scout] Scan complete: %d artists checked, %d detections", len(artists), len(detections))
    return detections


@app.route("/health")
def health():
    return jsonify({"status": "ok", "agent": "scout-agent"})


@app.route("/run", methods=["POST", "GET"])
def run_endpoint():
    """Cloud Scheduler hits this hourly via an OIDC-authenticated HTTP call."""
    detections = run_scan()
    return jsonify({"detections": len(detections), "artists": detections})


if __name__ == "__main__":
    if env("RUN_MODE", default="cli") == "http":
        app.run(host="0.0.0.0", port=int(env("PORT", default="8081")))
    else:
        run_scan()
