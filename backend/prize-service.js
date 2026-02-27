/**
 * Servicio backend para enviar premios MTR en Base.
 * Usa variables de entorno (no hardcodear claves privadas).
 */
const { createPublicClient, createWalletClient, http, parseUnits } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

const MTR_TOKEN_ADDRESS = '0x99cd1eb32846c9027ed9cb8710066fa08791c33b';
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

  const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

  const value = parseUnits(String(amount), 18);
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
