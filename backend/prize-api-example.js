/**
 * Ejemplo de endpoint Express para premios automáticos on-chain con viem.
 * Integra este router en tu backend principal:
 *   const prizeRouter = require('./backend/prize-api-example')
 *   app.use(prizeRouter)
 */
const express = require('express');
const { sendPrize } = require('./prize-service');

const router = express.Router();

router.post('/api/prizes/send', async (req, res) => {
  try {
    const { winner, amount, matchId, network, token, tokenAddress } = req.body || {};

    if (network && network !== 'base') {
      return res.status(400).json({ ok: false, error: 'Unsupported network, use base' });
    }

    const result = await sendPrize(winner, amount);
    return res.status(200).json({
      ok: true,
      txHash: result.txHash,
      status: result.status,
      matchId: matchId || null,
      token: token || 'MTR',
      tokenAddress: tokenAddress || '0x99cd1eb32846c9027ed9cb8710066fa08791c33b'
    });
  } catch (error) {
    console.error('[prize-api] send error:', error);
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to send prize' });
  }
});

module.exports = router;
