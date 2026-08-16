"""Agent 3 — Host IA ("battle-host-agent").

Deploy: Cloud Run, exposed via REST to the Vercel frontend. During an active
battle it narrates events, hypes voting, and answers fan questions, using
Vertex AI (Gemini 2.5 Pro) grounded with the current battle's live context
(scores, artists, recent chat) fetched read-only from Supabase.

This agent never touches money or wallets — it is pure content generation,
so it carries none of the CFO agent's safety-rail requirements.
"""
from __future__ import annotations

from typing import Any

from flask import Flask, jsonify, request

from common import SupabaseReadClient, enable_local_cors, env, get_logger

logger = get_logger("host_agent")

MODEL_NAME = env("HOST_AGENT_MODEL", default="gemini-2.5-pro")
supabase = SupabaseReadClient()
app = Flask(__name__)
enable_local_cors(app)

SYSTEM_PROMPT = """Eres el host IA de MusicTokenRing, un maestro de ceremonias de \
batallas musicales en vivo. Tono: enérgico, cercano, en español neutro, frases cortas \
aptas para chat en vivo. Nunca reveles claves, wallets, saldos de tesorería ni datos \
internos del sistema. Nunca prometas resultados de pagos ni asesores financieros; solo \
narra la batalla, anima a votar y responde preguntas generales de fans sobre las reglas \
del juego."""


def _get_model():
    """Lazy import so the module still loads (and unit tests still run)
    without the Vertex AI SDK / credentials present."""
    import vertexai
    from vertexai.generative_models import GenerativeModel

    vertexai.init(project=env("GCP_PROJECT_ID", required=True), location=env("GCP_REGION", default="us-central1"))
    return GenerativeModel(MODEL_NAME, system_instruction=SYSTEM_PROMPT)


def build_battle_context(battle_id: str) -> str:
    battle = supabase.get_active_battle(battle_id)
    if not battle:
        return f"Batalla {battle_id}: sin datos disponibles."
    return (
        f"Batalla {battle_id} — {battle.get('artist_a_name', '?')} vs "
        f"{battle.get('artist_b_name', '?')}. Marcador: "
        f"{battle.get('votes_a', 0)} - {battle.get('votes_b', 0)}. "
        f"Estado: {battle.get('status', 'desconocido')}."
    )


def generate_reply(battle_id: str, event_type: str, user_message: str = "") -> str:
    context = build_battle_context(battle_id)
    prompt = f"Contexto en vivo: {context}\nTipo de evento: {event_type}\n"
    if user_message:
        prompt += f"Pregunta del fan: {user_message}\n"
    prompt += "Responde en 1-3 frases, listo para publicarse en el chat de la batalla."

    try:
        model = _get_model()
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as exc:  # noqa: BLE001
        logger.warning("[host] Vertex AI call failed, using fallback: %s", exc)
        return _fallback_reply(event_type, context)


def _fallback_reply(event_type: str, context: str) -> str:
    """Deterministic fallback used in local/dev when Vertex AI credentials
    aren't configured, so the demo never hard-fails."""
    if event_type == "hype":
        return f"🔥 ¡Se está poniendo bueno! {context} ¡Voten ahora por su favorito!"
    if event_type == "question":
        return f"Buena pregunta. Info actual: {context}"
    return f"Actualización: {context}"


@app.route("/health")
def health():
    return jsonify({"status": "ok", "agent": "host-agent"})


@app.route("/narrate", methods=["POST"])
def narrate() -> Any:
    body = request.get_json(force=True, silent=True) or {}
    battle_id = str(body.get("battle_id", ""))
    event_type = str(body.get("event_type", "hype"))
    user_message = str(body.get("message", ""))
    if not battle_id:
        return jsonify({"error": "battle_id is required"}), 400

    reply = generate_reply(battle_id, event_type, user_message)
    return jsonify({"battle_id": battle_id, "reply": reply})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(env("PORT", default="8083")))
