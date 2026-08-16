"""Shared helpers for the MTR AI-native ops agents (scout, cfo, host).

Design principle: agents NEVER hold blockchain private keys and NEVER trust
wallet addresses from an inbound request payload. Payouts are always executed
by calling back into the existing, already-hardened Node backend
(server-auto.js / prize-service.js), which is the only component that signs
on-chain transactions. This mirrors the fix already applied to `/api/claim`
in ANALISIS-VULNERABILIDAD-CONFIRMADA.md: the wallet of record always comes
from Supabase, never from caller input.

All secrets are read from environment variables (populated locally via
docker-compose/.env, and in GCP via Secret Manager -> env at deploy time).
Nothing here should ever hardcode a credential.
"""
from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Optional

import requests

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def enable_local_cors(app) -> None:
    """Dev/demo convenience only: lets a static dashboard page (opened as a
    local file or from a simple static server) call these agents directly
    from the browser. Never used against a production origin allowlist —
    for that, put a real gateway (e.g. Cloud Run's built-in auth or an API
    Gateway CORS policy) in front instead of relying on this."""

    @app.after_request
    def _add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Agent-Secret, X-Internal-Secret"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return response


def env(name: str, default: Optional[str] = None, required: bool = False) -> str:
    value = os.environ.get(name, default)
    # Defensive: secrets piped into `gcloud secrets versions add` from
    # PowerShell (e.g. `$v | gcloud secrets ...`) commonly pick up a
    # trailing \r\n from the pipeline, which then breaks anything that uses
    # the value as an HTTP header (Supabase/NOWPayments auth, etc.) with a
    # cryptic "Invalid leading whitespace... in header value" error. Env
    # vars/secrets have no legitimate reason to carry leading/trailing
    # whitespace, so strip it here once instead of at every call site.
    if value is not None:
        value = value.strip()
    if required and not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


# --------------------------------------------------------------------------
# Secret Manager (GCP). Falls back to plain env vars for local dev, so the
# same code path runs identically under `docker-compose up` and Cloud Run.
# --------------------------------------------------------------------------
def get_secret(secret_id: str, fallback_env: Optional[str] = None) -> Optional[str]:
    fallback_env = fallback_env or secret_id
    local_value = os.environ.get(fallback_env)
    if os.environ.get("USE_SECRET_MANAGER", "false").lower() != "true":
        return local_value

    try:
        from google.cloud import secretmanager  # type: ignore

        project_id = env("GCP_PROJECT_ID", required=True)
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
        response = client.access_secret_version(request={"name": name})
        return response.payload.data.decode("UTF-8")
    except Exception as exc:  # noqa: BLE001 - degrade gracefully in local/dev
        get_logger("common").warning(
            "Secret Manager lookup failed for %s (%s); falling back to env var",
            secret_id,
            exc,
        )
        return local_value


# --------------------------------------------------------------------------
# Firestore: agent state, dedupe/idempotency, scout detections, circuit breaker
# --------------------------------------------------------------------------
class FirestoreStore:
    """Thin wrapper so agents/tests can run without a real Firestore instance
    (USE_FIRESTORE_EMULATOR=true or FIRESTORE_DISABLED=true -> in-memory dict)."""

    def __init__(self):
        self._memory: dict[str, dict[str, Any]] = {}
        self._client = None
        if os.environ.get("FIRESTORE_DISABLED", "false").lower() != "true":
            try:
                from google.cloud import firestore  # type: ignore

                self._client = firestore.Client(project=os.environ.get("GCP_PROJECT_ID"))
            except Exception as exc:  # noqa: BLE001
                get_logger("common").warning(
                    "Firestore unavailable (%s); using in-memory store (local/dev only)", exc
                )

    def get(self, collection: str, doc_id: str) -> Optional[dict[str, Any]]:
        if self._client:
            doc = self._client.collection(collection).document(doc_id).get()
            return doc.to_dict() if doc.exists else None
        stored = self._memory.get(f"{collection}/{doc_id}")
        # Return a shallow copy, never the live dict — callers (e.g. scout_agent
        # comparing "previous" vs a just-written new snapshot) must not see
        # their earlier read silently mutate under them via a later set().
        return dict(stored) if stored is not None else None

    def set(self, collection: str, doc_id: str, data: dict[str, Any], merge: bool = True) -> None:
        data = {**data, "_updated_at": time.time()}
        if self._client:
            self._client.collection(collection).document(doc_id).set(data, merge=merge)
            return
        key = f"{collection}/{doc_id}"
        if merge and key in self._memory:
            self._memory[key] = {**self._memory[key], **data}
        else:
            self._memory[key] = data

    def add(self, collection: str, data: dict[str, Any]) -> str:
        doc_id = data.get("id") or str(time.time_ns())
        self.set(collection, doc_id, data, merge=False)
        return doc_id


# --------------------------------------------------------------------------
# BigQuery: revenue analytics / P&L ledger
# --------------------------------------------------------------------------
class BigQuerySink:
    """Writes payment/revenue rows to BigQuery. Falls back to a local JSONL
    file (bigquery_local.jsonl) so `docker-compose up` and tests work without
    real GCP credentials."""

    def __init__(self, dataset: str = "mtr_analytics", table: str = "payments_ledger"):
        self.dataset = dataset
        self.table = table
        self._client = None
        self._local_path = os.environ.get("BQ_LOCAL_FALLBACK_PATH", "/tmp/bigquery_local.jsonl")
        if os.environ.get("BIGQUERY_DISABLED", "false").lower() != "true":
            try:
                from google.cloud import bigquery  # type: ignore

                self._client = bigquery.Client(project=os.environ.get("GCP_PROJECT_ID"))
            except Exception as exc:  # noqa: BLE001
                get_logger("common").warning(
                    "BigQuery unavailable (%s); writing to local fallback %s",
                    exc,
                    self._local_path,
                )

    def insert_row(self, row: dict[str, Any]) -> None:
        if self._client:
            table_ref = f"{self._client.project}.{self.dataset}.{self.table}"
            errors = self._client.insert_rows_json(table_ref, [row])
            if errors:
                raise RuntimeError(f"BigQuery insert failed: {errors}")
            return
        with open(self._local_path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, default=str) + "\n")


# --------------------------------------------------------------------------
# Supabase: read-only lookups (artist wallet of record, battle state).
# Agents NEVER write balances/credits directly — that stays owned by the
# Node backend (server-auto.js) to avoid a second source of truth for money.
# --------------------------------------------------------------------------
class SupabaseReadClient:
    def __init__(self):
        self.url = env("SUPABASE_URL", default="")
        self.key = env("SUPABASE_SERVICE_ROLE_KEY", default="")

    def _headers(self) -> dict[str, str]:
        return {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }

    def get_artist_wallet(self, artist_user_id: str) -> Optional[str]:
        """Returns the wallet address on file for a user, or None. This is the
        ONLY source of truth for "where does this artist get paid" — never the
        webhook payload, never a request body field."""
        if not self.url or not self.key:
            return None
        resp = requests.get(
            f"{self.url}/rest/v1/users",
            params={"id": f"eq.{artist_user_id}", "select": "id,wallet_address"},
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        rows = resp.json()
        return rows[0]["wallet_address"] if rows else None

    def get_active_battle(self, battle_id: str) -> Optional[dict[str, Any]]:
        if not self.url or not self.key:
            return None
        resp = requests.get(
            f"{self.url}/rest/v1/battles",
            params={"id": f"eq.{battle_id}", "select": "*"},
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        rows = resp.json()
        return rows[0] if rows else None


@dataclass
class InternalBackendClient:
    """Server-to-server client for the existing Render/Node backend. Used by
    the CFO agent to trigger the actual on-chain payout via the backend's
    already-audited prize-service.js (sendPrize), instead of the Python agent
    holding its own private key. Auth: BACKEND_INTERNAL_SECRET header, same
    mechanism the existing admin routes already use."""

    base_url: str = env("BACKEND_URL", default="https://musictoken-ring.onrender.com")
    internal_secret: str = env("BACKEND_INTERNAL_SECRET", default="")

    def trigger_artist_payout(
        self, artist_user_id: str, amount_usd: float, reason: str, idempotency_key: str
    ) -> dict[str, Any]:
        resp = requests.post(
            f"{self.base_url}/api/internal/agent-payout",
            json={
                "userId": artist_user_id,
                "amountUsd": amount_usd,
                "reason": reason,
                "idempotencyKey": idempotency_key,
            },
            headers={
                "X-Internal-Secret": self.internal_secret,
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
