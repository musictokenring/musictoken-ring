/**
 * Premios: con CUSTODY_ENABLED + NOWPayments se envía USDT (p. ej. TRC20) vía Custody;
 * si no, transferencia MTR on-chain en Base (PRIZE_SIGNER_PRIVATE_KEY).
 */
const { createPublicClient, createWalletClient, http, parseUnits, isAddress } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');
const { isValidPayoutAddress } = require('./platform-addresses');

const MTR_TOKEN_ADDRESS = process.env.MTR_TOKEN_ADDRESS || '0x99cd1eb32846c9027ed9cb8710066fa08791c33b';

const ERC20_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  }
];

async function sendPrize(winner, amount) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('Invalid prize amount');
  }

  const useCustody =
    process.env.CUSTODY_ENABLED === 'true' && !!process.env.NOWPAYMENTS_API_KEY;

  if (useCustody) {
    if (!isValidPayoutAddress(winner)) {
      throw new Error('Invalid winner address for Custody payout (Base 0x… o Tron T…)');
    }
    const { NOWPaymentsService } = require('./nowpayments-service');
    const np = new NOWPaymentsService();
    const out = await np.createCustodyPayout(winner, numericAmount, { source: 'prize' });
    return {
      method: 'nowpayments_custody',
      payoutId: out.payoutId,
      data: out.data
    };
  }

  const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
  const privateKey = process.env.PRIZE_SIGNER_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('Missing PRIZE_SIGNER_PRIVATE_KEY env var (or enable Custody + NOWPayments)');
  }

  if (!isAddress(winner)) {
    throw new Error('Invalid winner wallet address');
  }

  const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

  const value = parseUnits(String(numericAmount), 18);
  console.log('[prize] sendPrize on-chain MTR', { winner, amount, value: value.toString() });

  const hash = await walletClient.writeContract({
    address: MTR_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [winner, value]
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('[prize] sendPrize confirmed', { hash, status: receipt.status });

  return { method: 'mtr_onchain', txHash: hash, status: receipt.status };
}

module.exports = { sendPrize };
