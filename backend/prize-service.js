/**
 * Servicio backend para enviar premios MTR en Base.
 * Usa variables de entorno (no hardcodear claves privadas).
 */
const { createPublicClient, createWalletClient, http, parseUnits, isAddress } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

 codex/fix-issues-from-codex-review-on-pr-#117-h1vqdv
const MTR_TOKEN_ADDRESS = process.env.MTR_TOKEN_ADDRESS || '0x99cd1eb32846c9027ed9cb88710066fa08791c33b';

 codex/fix-issues-from-codex-review-on-pr-#117-vm0jtz
const MTR_TOKEN_ADDRESS = process.env.MTR_TOKEN_ADDRESS || '0x99cd1eb32846c9027ed9cb88710066fa08791c33b';

const MTR_TOKEN_ADDRESS = process.env.MTR_TOKEN_ADDRESS || '0x99cd1eb32846c9027ed9cb8710066fa08791c33b';
 codex/migrate-mtoken-to-mtr-on-base-chain-hbd77v
 codex/migrate-mtoken-to-mtr-on-base-chain-hbd77v
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
  const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
  const privateKey = process.env.PRIZE_SIGNER_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('Missing PRIZE_SIGNER_PRIVATE_KEY env var');
  }

  if (!isAddress(winner)) {
    throw new Error('Invalid winner wallet address');
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('Invalid prize amount');
  }

  const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

  const value = parseUnits(String(numericAmount), 18);
  console.log('[prize] sendPrize start', { winner, amount, value: value.toString() });

  const hash = await walletClient.writeContract({
    address: MTR_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [winner, value]
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('[prize] sendPrize confirmed', { hash, status: receipt.status });

  return { txHash: hash, status: receipt.status };
}

module.exports = { sendPrize };
