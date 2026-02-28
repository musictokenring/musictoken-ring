# Safe rollout checklist for MTR deposit credit flow

Use this checklist before merging/deploying the `Acreditar compra` flow.

## 1) Pre-merge (local)
- [ ] Open `index.html` and verify both elements exist:
  - `#depositTxHash`
  - `#creditPurchaseBtn`
- [ ] Run syntax/runtime checks:
  - `npm run check`
- [ ] Confirm `creditPurchasedMtr()` still calls:
  - `GameEngine.verifyDepositAndCredit(txHash, { network: 'base' })`

## 2) Manual functional test (staging)
- [ ] Open app and navigate to **Comprar MTR directo** panel.
- [ ] Paste invalid hash (example: `0x123`) and click **Acreditar compra**.
  - Expected: validation toast error appears.
- [ ] Paste valid-format hash (`0x` + 64 hex chars) and click button.
  - Expected: button disables while request is in-flight.
  - Expected: button re-enables after response.
- [ ] If backend responds with credited/newBalance:
  - Expected: success toast appears and input is cleared.
- [ ] If backend responds with status only:
  - Expected: info toast with status appears.

## 3) Regression checks
- [ ] Quick match still blocks when in-app balance is insufficient.
- [ ] Quick match allows play after a successful credited deposit.
- [ ] Cashout quote/request buttons still work as before.

## 4) Production rollout guardrails
- [ ] Deploy in low-traffic window.
- [ ] Monitor backend `/api/deposits/verify` 4xx/5xx and latency for 30 minutes.
- [ ] Monitor frontend console errors for `creditPurchasedMtr` and wallet flows.
- [ ] Keep rollback commit hash ready.

## 5) Rollback criteria
Rollback if any of the following happen:
- [ ] Credit button stuck disabled.
- [ ] Verification request not sent for valid tx hash.
- [ ] Spike in failed credits or user reports of unable-to-bet after purchase.

