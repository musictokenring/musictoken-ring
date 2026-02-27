#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "[repair] Applying canonical prize API router..."
cat > backend/prize-api.js <<'ROUTER'
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
ROUTER

if [ -f backend/prize-api-example.js ]; then
  echo "[repair] Removing deprecated backend/prize-api-example.js"
  rm -f backend/prize-api-example.js
fi

echo "[repair] Patching wallet connect/disconnect state and on-chain strict balance fallback..."
python - <<'PY'
from pathlib import Path

# index.html wallet state effect
idx = Path('index.html')
s = idx.read_text()
legacy = """            useEffect(() => {
                if (!address) return;
                localStorage.setItem('mtr_wallet', address);
                localStorage.setItem('mtr_wallet_chain', 'base');
                window.__mtrConnectedWallet = address;
            }, [address]);
"""
canonical = """            useEffect(() => {
                if (address) {
                    localStorage.setItem('mtr_wallet', address);
                    localStorage.setItem('mtr_wallet_chain', 'base');
                    window.__mtrConnectedWallet = address;
                    return;
                }

                window.__mtrConnectedWallet = null;
                window.__mtrOnChainBalance = 0;
                localStorage.removeItem('mtr_wallet');
                localStorage.removeItem('mtr_wallet_chain');
            }, [address]);
"""
if legacy in s:
    s = s.replace(legacy, canonical)
idx.write_text(s)

# game-engine.js strict on-chain behavior when wallet connected
ge = Path('game-engine.js')
g = ge.read_text()
old = """    getAvailableWalletBalance() {
        const onChainBalance = Number(window.__mtrOnChainBalance || 0);
        const localBalance = Number(this.userBalance || 0);
        if (Number.isFinite(onChainBalance) && onChainBalance > 0) {
            return onChainBalance;
        }
        return Number.isFinite(localBalance) ? localBalance : 0;
    },
"""
new = """    getAvailableWalletBalance() {
        const hasConnectedWallet = Boolean(window.__mtrConnectedWallet);
        const onChainBalance = Number(window.__mtrOnChainBalance || 0);
        const localBalance = Number(this.userBalance || 0);

        if (hasConnectedWallet && Number.isFinite(onChainBalance)) {
            return Math.max(0, onChainBalance);
        }

        return Number.isFinite(localBalance) ? Math.max(0, localBalance) : 0;
    },
"""
if old in g:
    g = g.replace(old, new)
ge.write_text(g)
PY

echo "[repair] Running checks..."
npm run check
node --check backend/prize-api.js
node --check backend/prize-service.js
node --check game-engine.js

echo "[repair] Done. If this repo is on your branch, commit with:"
echo "  git add -A && git commit -m 'fix: apply canonical MTR repair script'"
