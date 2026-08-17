/**
 * Registro de rutas de premios on-chain (agnóstico al framework).
 *
 * Uso recomendado en backend Express/Fastify-like:
 *   const { registerPrizeRoutes } = require('./backend/prize-api')
 *   registerPrizeRoutes(app, supabase)
 *
 * SEGURIDAD (2026-08-16): esta ruta la llama el frontend directamente
 * (game-engine.js::sendPrizeToWinner) para pagar premios reales en vivo, así
 * que no se puede cerrar detrás de un secreto interno sin romper pagos
 * legítimos. Hasta hoy, ejecutaba sendPrize() con la wallet de destino tal
 * cual venía en el body, sin validar nada — cualquiera podía llamar a esta
 * ruta con su propia wallet y matchId cualquiera y cobrar un premio real. Es
 * el mismo patrón que causó el robo confirmado de marzo 2026
 * (ver ANALISIS-VULNERABILIDAD-CONFIRMADA.md), aplicado sin ni siquiera el
 * chequeo roto que tenía /api/claim entonces.
 *
 * Fix aplicado: la wallet de destino ahora se valida contra los
 * participantes reales (player1_id/player2_id) del matchId indicado,
 * usando su wallet_address registrada en Supabase — nunca la del payload.
 * Esto impide que una wallet externa arbitraria cobre el premio.
 *
 * Limitación conocida, pendiente de un fix posterior con más tiempo: esto
 * valida que la wallet pertenezca a UN participante del match, pero no
 * repite aquí la lógica completa de "quién ganó realmente" — eso sigue
 * decidiéndose donde ya se decidía antes. No dejar este comentario
 * desactualizado si se cierra esa brecha.
 */
const { sendPrize } = require('./prize-service')

function makePrizeRouteHandler(supabase) {
  return async function prizeRouteHandler(req, res) {
  try {
    const body = req?.body || {}
    const { winner, amount, matchId, network, token, tokenAddress } = body

    if (network && network !== 'base') {
      return res.status(400).json({ ok: false, error: 'Unsupported network, use base' })
    }

    if (!supabase) {
      console.error('[prize-api] Supabase client not available on app; refusing unvalidated payout')
      return res.status(503).json({ ok: false, error: 'Payout validation unavailable' })
    }
    if (!matchId) {
      return res.status(400).json({ ok: false, error: 'matchId is required' })
    }
    if (!winner || typeof winner !== 'string') {
      return res.status(400).json({ ok: false, error: 'winner wallet is required' })
    }

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('id, player1_id, player2_id')
      .eq('id', matchId)
      .maybeSingle()

    if (matchError || !match) {
      return res.status(404).json({ ok: false, error: 'Match not found' })
    }

    const { data: participants, error: participantsError } = await supabase
      .from('users')
      .select('id, wallet_address')
      .in('id', [match.player1_id, match.player2_id].filter(Boolean))

    if (participantsError) {
      console.error('[prize-api] Failed to load match participants:', participantsError)
      return res.status(500).json({ ok: false, error: 'Failed to validate winner wallet' })
    }

    const winnerIsParticipant = (participants || []).some(
      (p) => p.wallet_address && p.wallet_address.toLowerCase() === winner.toLowerCase()
    )

    if (!winnerIsParticipant) {
      console.warn('[prize-api] Rejected payout: wallet is not a registered participant of this match', {
        matchId,
        claimedWallet: winner
      })
      return res.status(403).json({ ok: false, error: 'Wallet does not belong to a participant of this match' })
    }

    const result = await sendPrize(winner, amount)

    return res.status(200).json({
      ok: true,
      method: result.method || null,
      payoutId: result.payoutId || null,
      txHash: result.txHash || null,
      status: result.status || null,
      matchId: matchId || null,
      token: token || (result.method === 'nowpayments_custody' ? 'USDT' : 'MTR'),
      tokenAddress: tokenAddress || '0x99cd1eb32846c9027ed9cb8710066fa08791c33b'
    })
  } catch (error) {
    console.error('[prize-api] send error:', error)
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to send prize' })
  }
  }
}

function registerPrizeRoutes(app, supabase) {
  if (!app || typeof app.post !== 'function') {
    throw new Error('registerPrizeRoutes requires an app instance with .post(path, handler)')
  }
  if (!supabase) {
    throw new Error('registerPrizeRoutes requires a supabase client to validate winner wallets')
  }

  app.post('/api/prizes/send', makePrizeRouteHandler(supabase))
  return app
}

module.exports = { registerPrizeRoutes, makePrizeRouteHandler }
