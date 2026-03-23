/**
 * Script para encontrar depósitos del usuario a la wallet de la plataforma
 */

const { createPublicClient, http, formatUnits, decodeEventLog } = require('viem');
const { mainnet } = require('viem/chains');

const { requireEvmPlatformWallet } = require('./platform-addresses');
const PLATFORM_WALLET = requireEvmPlatformWallet();
const USDC_ADDRESS_ETHEREUM = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USER_WALLET = '0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd';

const ERC20_TRANSFER_ABI = [
    {
        type: 'event',
        name: 'Transfer',
        inputs: [
            { name: 'from', type: 'address', indexed: true },
            { name: 'to', type: 'address', indexed: true },
            { name: 'value', type: 'uint256', indexed: false }
        ]
    }
];

async function findDeposits() {
    const publicClient = createPublicClient({
        chain: mainnet,
        transport: http(process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com')
    });

    console.log(`🔍 Buscando depósitos de ${USER_WALLET} a ${PLATFORM_WALLET}\n`);

    try {
        const latestBlock = await publicClient.getBlockNumber();
        console.log(`📡 Bloque actual: ${latestBlock}`);
        
        // Search around the specific transaction block (24595151) - yesterday
        // Search ±500 blocks around that block
        const targetBlock = BigInt(24595151);
        const searchRange = BigInt(500);
        const fromBlock = targetBlock - searchRange;
        const toBlock = targetBlock + searchRange;
        
        console.log(`🔍 Buscando en bloques ${fromBlock} a ${toBlock} (alrededor del bloque ${targetBlock})\n`);

        // Search for transfers FROM user wallet TO platform wallet
        const logs = await publicClient.getLogs({
            address: USDC_ADDRESS_ETHEREUM,
            event: {
                type: 'event',
                name: 'Transfer',
                inputs: [
                    { name: 'from', type: 'address', indexed: true },
                    { name: 'to', type: 'address', indexed: true },
                    { name: 'value', type: 'uint256', indexed: false }
                ]
            },
            args: {
                from: USER_WALLET.toLowerCase(),
                to: PLATFORM_WALLET.toLowerCase()
            },
            fromBlock: fromBlock,
            toBlock: toBlock
        });

        console.log(`✅ Encontradas ${logs.length} transferencias a la wallet de la plataforma\n`);

        if (logs.length === 0) {
            console.log('❌ No se encontraron transferencias recientes a la wallet de la plataforma');
            return;
        }

        // Filter transfers from user wallet
        const userDeposits = [];
        
        for (const log of logs) {
            try {
                const decoded = decodeEventLog({
                    abi: ERC20_TRANSFER_ABI,
                    data: log.data,
                    topics: log.topics
                });

                const fromAddress = decoded.args.from.toLowerCase();
                const amount = formatUnits(BigInt(decoded.args.value), 6);

                if (fromAddress === USER_WALLET.toLowerCase()) {
                    userDeposits.push({
                        txHash: log.transactionHash,
                        blockNumber: log.blockNumber,
                        from: fromAddress,
                        to: decoded.args.to,
                        amount: parseFloat(amount),
                        logIndex: log.logIndex
                    });
                }
            } catch (e) {
                // Skip invalid logs
            }
        }

        if (userDeposits.length > 0) {
            console.log(`✅ Encontrados ${userDeposits.length} depósito(s) del usuario:\n`);
            userDeposits.forEach((deposit, i) => {
                console.log(`${i + 1}. Transacción: ${deposit.txHash}`);
                console.log(`   Bloque: ${deposit.blockNumber}`);
                console.log(`   Cantidad: ${deposit.amount} USDC`);
                console.log(`   From: ${deposit.from}`);
                console.log(`   To: ${deposit.to}`);
                console.log('');
            });

            // Process the most recent one
            const mostRecent = userDeposits[userDeposits.length - 1];
            console.log(`\n💡 Para procesar el depósito más reciente, ejecuta:`);
            console.log(`   node backend/process-missing-deposit.js ${mostRecent.txHash} ethereum`);
        } else {
            console.log('❌ No se encontraron depósitos directos del usuario a la wallet de la plataforma');
            console.log('\n💡 Esto podría significar:');
            console.log('   1. El depósito fue a través de un bridge/swap (transacción indirecta)');
            console.log('   2. El depósito fue hace más de 5000 bloques');
            console.log('   3. El depósito fue en otra red (Base, Polygon, etc.)');
            
            // Show all recent deposits to platform for reference
            console.log(`\n📋 Últimas ${Math.min(10, logs.length)} transferencias a la plataforma (para referencia):`);
            let count = 0;
            for (const log of logs.slice(-10).reverse()) {
                try {
                    const decoded = decodeEventLog({
                        abi: ERC20_TRANSFER_ABI,
                        data: log.data,
                        topics: log.topics
                    });
                    const amount = formatUnits(BigInt(decoded.args.value), 6);
                    console.log(`   ${decoded.args.from} → ${amount} USDC (Tx: ${log.transactionHash.slice(0, 20)}...)`);
                    count++;
                    if (count >= 10) break;
                } catch (e) {
                    // Skip
                }
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.message.includes('range is too large')) {
            console.log('\n💡 El rango de búsqueda es muy grande. Intentando búsqueda más específica...');
            // Try smaller range
            try {
                const latestBlock = await publicClient.getBlockNumber();
                const fromBlock = latestBlock - BigInt(1000);
                const logs = await publicClient.getLogs({
                    address: USDC_ADDRESS_ETHEREUM,
                    event: {
                        type: 'event',
                        name: 'Transfer',
                        inputs: [
                            { name: 'from', type: 'address', indexed: true },
                            { name: 'to', type: 'address', indexed: true },
                            { name: 'value', type: 'uint256', indexed: false }
                        ]
                    },
                    args: {
                        from: USER_WALLET.toLowerCase(),
                        to: PLATFORM_WALLET.toLowerCase()
                    },
                    fromBlock: fromBlock,
                    toBlock: latestBlock
                });
                
                if (logs.length > 0) {
                    console.log(`✅ Encontradas ${logs.length} transferencias directas`);
                    logs.forEach(log => {
                        const decoded = decodeEventLog({
                            abi: ERC20_TRANSFER_ABI,
                            data: log.data,
                            topics: log.topics
                        });
                        const amount = formatUnits(BigInt(decoded.args.value), 6);
                        console.log(`   Tx: ${log.transactionHash}, Amount: ${amount} USDC`);
                    });
                } else {
                    console.log('❌ No se encontraron transferencias directas en los últimos 1000 bloques');
                }
            } catch (e2) {
                console.error('Error en búsqueda alternativa:', e2.message);
            }
        }
    }
}

findDeposits();
