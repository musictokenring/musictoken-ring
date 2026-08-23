/**
 * REST connector the existing Node backend (backend/server-auto.js) uses to
 * call the 3 GCP agents. Twin of integrations/gcp_connector.py — same
 * endpoints/contracts, JS runtime to match the backend's actual language.
 *
 * Usage from server-auto.js, e.g. after the NOWPayments webhook confirms a
 * battle-vote payment:
 *
 *   const { requestArtistPayout } = require('../integrations/gcpConnector');
 *   await requestArtistPayout({ paymentId, artistUserId, battleId, amountUsd });
 */

const SCOUT_AGENT_URL = process.env.SCOUT_AGENT_URL || 'http://localhost:8081';
const CFO_AGENT_URL = process.env.CFO_AGENT_URL || 'http://localhost:8082';
const HOST_AGENT_URL = process.env.HOST_AGENT_URL || 'http://localhost:8083';
const CURATOR_AGENT_URL = process.env.CURATOR_AGENT_URL || 'https://curator-agent-287417719690.us-central1.run.app';
const CFO_AGENT_SHARED_SECRET = process.env.CFO_AGENT_SHARED_SECRET || '';

async function triggerScoutScan() {
    const resp = await fetch(`${SCOUT_AGENT_URL}/run`, { method: 'POST' });
    if (!resp.ok) throw new Error(`scout-agent /run failed: ${resp.status}`);
    return resp.json();
}

async function requestArtistPayout({ paymentId, artistUserId, battleId, amountUsd }) {
    const resp = await fetch(`${CFO_AGENT_URL}/payout`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Agent-Secret': CFO_AGENT_SHARED_SECRET
        },
        body: JSON.stringify({
            payment_id: paymentId,
            artist_user_id: artistUserId,
            battle_id: battleId,
            amount_usd: amountUsd
        })
    });
    return resp.json();
}

async function requestHostNarration({ battleId, eventType = 'hype', message = '' }) {
    const resp = await fetch(`${HOST_AGENT_URL}/narrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ battle_id: battleId, event_type: eventType, message })
    });
    if (!resp.ok) throw new Error(`host-agent /narrate failed: ${resp.status}`);
    return resp.json();
}

/**
 * Curador de género (agents/curator_agent.py): clasifica si una canción/
 * artista pertenece al género establecido de un torneo. AUTORITATIVO —
 * llamado desde el backend en tournament-service.js::joinTournament(),
 * nunca confía en un veredicto que el cliente diga tener (un cliente
 * modificado podría mentir sobre eso). El front también llama a este mismo
 * agente directo por su cuenta (ver game-engine.js) solo para dar feedback
 * inmediato mientras el usuario elige canción — esa llamada es puramente
 * de UX, esta es la que de verdad cuenta.
 * @returns {Promise<{confidence:number, verdict:'match'|'warn'|'block', reason:string}>}
 */
async function requestGenreCuration({ artist, title, genreLabel }) {
    try {
        const resp = await fetch(`${CURATOR_AGENT_URL}/curate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ artist, title, genreLabel }),
            signal: AbortSignal.timeout(8000)
        });
        if (!resp.ok) throw new Error(`curator-agent /curate failed: ${resp.status}`);
        return await resp.json();
    } catch (err) {
        // Mismo criterio que el fallback interno del propio agente: si el
        // agente no responde (red, timeout, GCP caído), NO se puede ni
        // bloquear todo ni aprobar todo — se deja pasar con advertencia
        // (zona "warn") para no tumbar inscripciones legítimas por una
        // falla de infraestructura ajena al usuario.
        console.warn('[gcpConnector] requestGenreCuration falló, usando fallback conservador:', err.message);
        return {
            confidence: 50,
            verdict: 'warn',
            reason: 'No se pudo verificar automáticamente (curador de género no disponible) — requiere revisión.'
        };
    }
}

async function healthCheckAll() {
    const targets = { scout: SCOUT_AGENT_URL, cfo: CFO_AGENT_URL, host: HOST_AGENT_URL, curator: CURATOR_AGENT_URL };
    const results = {};
    await Promise.all(
        Object.entries(targets).map(async ([name, url]) => {
            try {
                const resp = await fetch(`${url}/health`);
                results[name] = resp.ok;
            } catch {
                results[name] = false;
            }
        })
    );
    return results;
}

module.exports = { triggerScoutScan, requestArtistPayout, requestHostNarration, requestGenreCuration, healthCheckAll };
