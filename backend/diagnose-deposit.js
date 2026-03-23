/**
 * Script de diagnóstico para verificar depósitos no procesados
 * Uso: node backend/diagnose-deposit.js <txHash> [walletAddress]
 */

const { createPublicClient, http, formatUnits } = require('viem');
const { base } = require('viem/chains');
const { createClient } = require('@supabase/supabase-js');

const { requireEvmPlatformWallet } = require('./platform-addresses');
const PLATFORM_WALLET = requireEvmPlatformWallet();
const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
});

async function diagnoseTransaction(txHash, userWalletAddress = null) {
    console.log('🔍 DIAGNÓSTICO DE TRANSACCIÓN');
    console.log('================================\n');
    console.log(`Tx Hash: ${txHash}`);
    console.log(`Platform Wallet: ${PLATFORM_WALLET}`);
    console.log(`USDC Address: ${USDC_ADDRESS}\n`);

    try {
        // 1. Obtener detalles de la transacción
        console.log('1️⃣ Obteniendo detalles de la transacción...');
        const tx = await publicClient.getTransaction({ hash: txHash });
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

        console.log(`   ✅ Transacción encontrada`);
        console.log(`   Status: ${receipt.status}`);
        console.log(`   From: ${tx.from}`);
        console.log(`   To: ${tx.to}`);
        console.log(`   Block: ${receipt.blockNumber}\n`);

        if (receipt.status !== 'success') {
            console.log('   ❌ Transacción fallida, no se puede procesar');
            return;
        }

        // 2. Verificar si es una transferencia de USDC
        console.log('2️⃣ Analizando logs de eventos...');
        const transferLogs = receipt.logs.filter(log => 
            log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()
        );

        if (transferLogs.length === 0) {
            console.log('   ⚠️ No se encontraron eventos de transferencia USDC');
            console.log('   Verificando si es transferencia de MTR...');
            // Podría ser MTR también
        }

        // Decodificar eventos Transfer
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

        for (const log of transferLogs) {
            try {
                const decoded = await publicClient.decodeEventLog({
                    abi: ERC20_TRANSFER_ABI,
                    data: log.data,
                    topics: log.topics
                });

                const from = decoded.args.from;
                const to = decoded.args.to;
                const value = decoded.args.value;
                const amount = parseFloat(formatUnits(value, 6)); // USDC tiene 6 decimales

                console.log(`   ✅ Evento Transfer encontrado:`);
                console.log(`      From: ${from}`);
                console.log(`      To: ${to}`);
                console.log(`      Amount: ${amount} USDC`);

                // Verificar si llegó a la wallet de la plataforma
                if (to.toLowerCase() === PLATFORM_WALLET.toLowerCase()) {
                    console.log(`      ✅ Llegó a la wallet de la plataforma\n`);

                    // 3. Verificar si ya está procesado en la base de datos
                    console.log('3️⃣ Verificando en base de datos...');
                    const { data: existingDeposit } = await supabase
                        .from('deposits')
                        .select('*')
                        .eq('tx_hash', txHash)
                        .single();

                    if (existingDeposit) {
                        console.log('   ⚠️ DEPÓSITO YA PROCESADO:');
                        console.log(`      ID: ${existingDeposit.id}`);
                        console.log(`      User ID: ${existingDeposit.user_id}`);
                        console.log(`      Credits: ${existingDeposit.credits_awarded}`);
                        console.log(`      Status: ${existingDeposit.status}`);
                        console.log(`      Processed at: ${existingDeposit.processed_at}\n`);

                        // Verificar balance actual del usuario
                        const { data: userCredits } = await supabase
                            .from('user_credits')
                            .select('credits')
                            .eq('user_id', existingDeposit.user_id)
                            .single();

                        console.log(`   Balance actual del usuario: ${userCredits?.credits || 0} créditos`);
                        return;
                    }

                    console.log('   ❌ DEPÓSITO NO PROCESADO\n');

                    // 4. Verificar usuario
                    const walletToCheck = userWalletAddress || from;
                    console.log(`4️⃣ Verificando usuario (wallet: ${walletToCheck})...`);
                    const { data: user } = await supabase
                        .from('users')
                        .select('id, wallet_address')
                        .eq('wallet_address', walletToCheck.toLowerCase())
                        .single();

                    if (!user) {
                        console.log('   ⚠️ Usuario no encontrado en base de datos');
                        console.log('   Se crearía automáticamente al procesar\n');
                    } else {
                        console.log(`   ✅ Usuario encontrado: ${user.id}\n`);
                    }

                    // 5. Calcular créditos que deberían haberse otorgado
                    console.log('5️⃣ Calculando créditos...');
                    const DEPOSIT_FEE_RATE = 0.05; // 5%
                    const depositFee = amount * DEPOSIT_FEE_RATE;
                    const credits = amount - depositFee;

                    console.log(`   Amount USDC: ${amount}`);
                    console.log(`   Fee (5%): ${depositFee}`);
                    console.log(`   Créditos a otorgar: ${credits}\n`);

                    // 6. Mostrar resumen y opciones
                    console.log('📊 RESUMEN:');
                    console.log('================================');
                    console.log(`Transacción: ${txHash}`);
                    console.log(`Wallet origen: ${from}`);
                    console.log(`Wallet destino: ${to}`);
                    console.log(`Monto: ${amount} USDC`);
                    console.log(`Créditos a otorgar: ${credits} créditos`);
                    console.log(`Fee: ${depositFee} USDC`);
                    console.log(`Usuario: ${user ? user.id : 'NO ENCONTRADO (se creará)'}`);
                    console.log(`Estado: NO PROCESADO`);
                    console.log('\n💡 Para procesar manualmente, ejecuta:');
                    console.log(`   node backend/fix-deposit.js ${txHash} ${from}\n`);

                } else {
                    console.log(`   ❌ NO llegó a la wallet de la plataforma`);
                    console.log(`   Destino: ${to}`);
                    console.log(`   Esperado: ${PLATFORM_WALLET}\n`);
                }
            } catch (decodeError) {
                console.log(`   ⚠️ Error decodificando log: ${decodeError.message}`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    }
}

// Ejecutar diagnóstico
const txHash = process.argv[2];
const walletAddress = process.argv[3];

if (!txHash) {
    console.log('Uso: node backend/diagnose-deposit.js <txHash> [walletAddress]');
    console.log('Ejemplo: node backend/diagnose-deposit.js 0x1234... 0x5678...');
    process.exit(1);
}

diagnoseTransaction(txHash, walletAddress).then(() => {
    process.exit(0);
}).catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
});
