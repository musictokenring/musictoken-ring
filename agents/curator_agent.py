"""Agent 4 — Curator IA ("genre-curator-agent").

Deploy: Cloud Run, called directly by the frontend (and, authoritatively, by
the Node backend at tournament-join time) when a player picks a song to
compete with in a genre-scoped tournament. Classifies whether the chosen
artist/song plausibly belongs to the tournament's established genre, using
Vertex AI Gemini's general music knowledge — this app has no local genre
database for songs (Deezer search results carry no reliable per-track genre
field, confirmed by direct investigation of the search pipeline).

This agent never touches money or wallets directly — it is pure content
classification. But unlike Host (cosmetic narration), its verdict IS used
downstream to gate real tournament entries and, if a disqualified genre
mismatch is later found on a WINNING entry, to void the pot and refund both
players (see backend/tournament-service.js and backend/tournament-battle.js).
So unlike Host, a wrong/overconfident answer here has real consequences —
every response carries an explicit confidence score instead of a bare yes/no,
and the caller (not this agent) decides the pass/warn/block thresholds, so
those can be tuned without a redeploy of the model logic.
"""
from __future__ import annotations

import json
import re
from typing import Any

from flask import Flask, jsonify, request

from common import enable_local_cors, env, get_logger

logger = get_logger("curator_agent")

# Mismo criterio que host_agent.py: Flash en vez de Pro por latencia — esto
# corre en el camino crítico de que un usuario elija su canción y se
# inscriba a un torneo, no puede tardar varios segundos por llamada.
MODEL_NAME = env("CURATOR_AGENT_MODEL", default="gemini-2.5-flash")
app = Flask(__name__)
enable_local_cors(app)

SYSTEM_PROMPT = """Eres un curador musical experto en géneros musicales de todo el \
mundo, especializado en música latinoamericana (vallenato, salsa, cumbia, bachata, \
merengue, regional mexicano/corridos, reggaeton, trap latino, pop latino) y géneros \
anglosajones (rock, pop, hip hop/R&B, electrónica/EDM). Tu trabajo es evaluar si una \
canción o artista dado pertenece razonablemente al género musical establecido para \
una competencia, usando tu conocimiento general de música — no tienes acceso a \
ninguna base de datos externa ni a internet.

Responde SIEMPRE en JSON estricto con esta forma exacta, sin texto adicional antes o \
después:
{"confidence": <entero 0-100>, "reason": "<una frase corta en español explicando por qué>"}

La confianza (confidence) representa qué tan seguro estás de que la canción/artista \
pertenece al género de la competencia:
- 90-100: pertenece claramente al género (ej. un vallenato de Diomedes Díaz en una \
  competencia de Vallenato).
- 50-89: hay cierta ambigüedad o el artista cruza géneros, pero tiene una conexión \
  real y defendible con el género (ej. una canción de fusión, un artista que a veces \
  incursiona en el género establecido).
- 0-49: no pertenece al género en absoluto (ej. una canción de Michael Jackson en \
  una competencia de Rock en español, o un vallenato en una competencia de \
  Electrónica/EDM).

Si no reconoces la canción o el artista con certeza, usa tu mejor estimación basada \
en el nombre del artista/canción y sé conservador (confianza más baja) en vez de \
asumir que encaja."""


_model_cache = None  # cached GenerativeModel — ver nota en host_agent.py sobre por
# qué esto se cachea a nivel de módulo en vez de reconstruirse en cada request.


def _get_model():
    """Lazy import, igual que host_agent.py — el módulo debe poder cargar
    (y correr bajo pytest) sin el SDK de Vertex AI / credenciales presentes."""
    global _model_cache
    if _model_cache is not None:
        return _model_cache

    import vertexai
    from vertexai.generative_models import GenerationConfig, GenerativeModel

    vertexai.init(project=env("GCP_PROJECT_ID", required=True), location=env("GCP_REGION", default="us-central1"))
    _model_cache = GenerativeModel(
        MODEL_NAME,
        system_instruction=SYSTEM_PROMPT,
        generation_config=GenerationConfig(response_mime_type="application/json"),
    )
    return _model_cache


def _parse_json_response(text: str) -> dict:
    """response_mime_type=application/json casi siempre devuelve JSON limpio,
    pero por las dudas se extrae el primer objeto {...} del texto en vez de
    confiar ciegamente en json.loads(text) sobre la respuesta completa."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    raw = match.group(0) if match else text
    data = json.loads(raw)
    confidence = int(data.get("confidence", 0))
    confidence = max(0, min(100, confidence))
    reason = str(data.get("reason", "")).strip() or "Sin motivo especificado."
    return {"confidence": confidence, "reason": reason}


def classify_genre_fit(artist: str, title: str, genre_label: str) -> dict:
    prompt = (
        f'Canción: "{title}"\n'
        f'Artista: "{artist}"\n'
        f'Género establecido para la competencia: "{genre_label}"\n\n'
        "¿Esta canción/artista pertenece razonablemente a ese género?"
    )
    try:
        model = _get_model()
        response = model.generate_content(prompt)
        result = _parse_json_response(response.text)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[curator] Vertex AI call failed, usando fallback conservador: %s", exc)
        # CRÍTICO: si Gemini falla, el fallback NO puede ser "aprobar todo" —
        # eso anularía el filtro completo en cualquier corte/timeout de
        # Vertex AI. Tampoco puede bloquear todo — tumbaría inscripciones
        # legítimas por un problema de infraestructura ajeno al usuario.
        # Confianza intermedia fija (zona "warn"): dejar avanzar con aviso,
        # nunca bloquear ni aprobar en silencio por una falla de la IA.
        return {
            "confidence": 50,
            "reason": "No se pudo verificar automáticamente (servicio de IA no disponible) — requiere revisión.",
            "verdict": "warn",
        }

    verdict = "match" if result["confidence"] >= 80 else ("warn" if result["confidence"] >= 50 else "block")
    return {**result, "verdict": verdict}


@app.route("/health")
def health():
    return jsonify({"status": "ok", "agent": "curator-agent"})


@app.route("/curate", methods=["POST"])
def curate() -> Any:
    body = request.get_json(force=True, silent=True) or {}
    artist = str(body.get("artist", "")).strip()
    title = str(body.get("title", "")).strip()
    genre_label = str(body.get("genreLabel", "")).strip()

    if not artist or not title or not genre_label:
        return jsonify({"error": "artist, title y genreLabel son requeridos"}), 400

    result = classify_genre_fit(artist, title, genre_label)
    return jsonify(result)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(env("PORT", default="8084")))
