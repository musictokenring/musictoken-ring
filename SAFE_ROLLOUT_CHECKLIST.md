 codex/fix-issues-from-codex-review-on-pr-#117-h1vqdv
# Safe rollout checklist for MTR automatic deposit verification flow

Use this checklist before merging/deploying the `Verificar depósito` flow.

# Safe rollout checklist for MTR deposit credit flow

Use this checklist before merging/deploying the `Acreditar compra` flow.
 codex/migrate-mtoken-to-mtr-on-base-chain-hbd77v

## 1) Pre-merge (local)
- [ ] Open `index.html` and verify both elements exist:
  - `#depositTxHash`
 codex/fix-issues-from-codex-review-on-pr-#117-h1vqdv
  - `#creditPurchaseBtn` (label: `🔎 Verificar depósito`)
- [ ] Run syntax/runtime checks:
  - `npm run check`
- [ ] Run pre-push guard (no conflict markers + checks):
  - `npm run prepush:guard`
- [ ] Confirm `verifyPurchasedMtrTx()` calls:
  - `GameEngine.verifyDepositAndCredit(txHash, { network: 'base' })`
- [ ] Confirm no manual credit text remains in UI (`Acreditar compra`).

## 2) Manual functional test (staging)
- [ ] Open app and navigate to **Comprar MTR directo** panel.
- [ ] Paste invalid hash (example: `0x123`) and click **Verificar depósito**.

  - `#creditPurchaseBtn`
- [ ] Run syntax/runtime checks:
  - `npm run check`
- [ ] Confirm `creditPurchasedMtr()` still calls:
  - `GameEngine.verifyDepositAndCredit(txHash, { network: 'base' })`

## 2) Manual functional test (staging)
- [ ] Open app and navigate to **Comprar MTR directo** panel.
- [ ] Paste invalid hash (example: `0x123`) and click **Acreditar compra**.
 codex/migrate-mtoken-to-mtr-on-base-chain-hbd77v
  - Expected: validation toast error appears.
- [ ] Paste valid-format hash (`0x` + 64 hex chars) and click button.
  - Expected: button disables while request is in-flight.
  - Expected: button re-enables after response.
- [ ] If backend responds with credited/newBalance:
  - Expected: success toast appears and input is cleared.
- [ ] If backend responds with status only:
 codex/fix-issues-from-codex-review-on-pr-#117-h1vqdv
  - Expected: info toast with on-chain verification status appears.

## 3) Wallet/Base network checks
- [ ] Connect wallet on Base:
  - Expected: warning banner hidden, button text `Wallet conectada`.
- [ ] Connect wallet on non-Base chain:
  - Expected: warning banner visible and button text `Cambiar a Base`.
- [ ] Disconnect wallet:
  - Expected: on-chain badge shows explicit state (`Wallet no conectada`).

## 4) Regression checks
- [ ] Quick match still blocks when in-app balance is insufficient.
- [ ] Quick match allows play after successful verified deposit.
- [ ] Cashout quote/request buttons still work as before.

## 5) Production rollout guardrails
- [ ] Deploy in low-traffic window.
- [ ] Monitor backend `/api/deposits/verify` 4xx/5xx and latency for 30 minutes.
- [ ] Monitor frontend console errors for `verifyPurchasedMtrTx` and wallet/Base flows.
- [ ] Keep rollback commit hash ready.

## 6) Rollback criteria
Rollback if any of the following happen:
- [ ] Verify button stuck disabled.
- [ ] Verification request not sent for valid tx hash.
- [ ] Spike in failed verifications or user reports of unable-to-bet after purchase.

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

 codex/migrate-mtoken-to-mtr-on-base-chain-hbd77v
