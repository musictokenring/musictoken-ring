'use strict';

/**
 * NOWPayments puede usar una dirección de liquidación no-EVM (p. ej. USDT TRC20 en Tron)
 * en PLATFORM_WALLET_ADDRESS. El código EVM (listeners, swaps) usa EVM_PLATFORM_WALLET_ADDRESS
 * o PLATFORM_WALLET_ADDRESS solo si ya es 0x…
 */

function isEvmAddress(s) {
  return typeof s === 'string' && /^0x[a-fA-F0-9]{40}$/.test(s);
}

/** Tron (TRC20) típico: base58, empieza por T */
function isTronAddress(s) {
  return typeof s === 'string' && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(s.trim());
}

/**
 * Wallet EVM (Base) para listeners/swaps. null si solo configuraste Tron en PLATFORM_WALLET_ADDRESS.
 */
function resolveEvmPlatformWallet() {
  const evm = process.env.EVM_PLATFORM_WALLET_ADDRESS;
  if (isEvmAddress(evm)) return evm;
  const plat = process.env.PLATFORM_WALLET_ADDRESS;
  if (isEvmAddress(plat)) return plat;
  return null;
}

function requireEvmPlatformWallet() {
  const w = resolveEvmPlatformWallet();
  if (!w) {
    throw new Error(
      'Define EVM_PLATFORM_WALLET_ADDRESS (0x…) o PLATFORM_WALLET_ADDRESS como dirección EVM para operaciones on-chain en Base.'
    );
  }
  return w;
}

/** Dirección mostrada en NOWPayments (Tron USDT, etc.); no validamos formato estricto aquí */
function getNowPaymentsSettlementAddress() {
  return (
    process.env.NOWPAYMENTS_SETTLEMENT_ADDRESS ||
    process.env.PLATFORM_WALLET_ADDRESS ||
    ''
  );
}

/** Destino de retiros/premios vía NOWPayments (EVM Base o Tron USDT, etc.) */
function isValidPayoutAddress(addr) {
  if (!addr || typeof addr !== 'string') return false;
  const a = addr.trim();
  return isEvmAddress(a) || isTronAddress(a);
}

module.exports = {
  isEvmAddress,
  isTronAddress,
  resolveEvmPlatformWallet,
  requireEvmPlatformWallet,
  getNowPaymentsSettlementAddress,
  isValidPayoutAddress
};
