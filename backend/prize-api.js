/**
 * Registro de rutas de premios on-chain (agnóstico al framework).
 *
 * Uso recomendado en backend Express/Fastify-like:
 *   const { registerPrizeRoutes } = require('./backend/prize-api')
 *   registerPrizeRoutes(app)
 */
const { sendPrize } = require('./prize-service')

async function prizeRouteHandler(req, res) {
  try {
    const body = req?.body || {}
    const { winner, amount, matchId, network, token, tokenAddress } = body

    if (network && network !== 'base') {
      return res.status(400).json({ ok: false, error: 'Unsupported network, use base' })
    }

    const result = await sendPrize(winner, amount)

    return res.status(200).json({
      ok: true,
      txHash: result.txHash,
      status: result.status,
      matchId: matchId || null,
      token: token || 'MTR',
      tokenAddress: tokenAddress || '0x99cd1eb32846c9027ed9cb8710066fa08791c33b'
    })
  } catch (error) {
    console.error('[prize-api] send error:', error)
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to send prize' })
  }
}

function registerPrizeRoutes(app) {
  if (!app || typeof app.post !== 'function') {
    throw new Error('registerPrizeRoutes requires an app instance with .post(path, handler)')
  }

  app.post('/api/prizes/send', prizeRouteHandler)
  return app
}

module.exports = { registerPrizeRoutes, prizeRouteHandler }
