/**
 * Script para procesar manualmente un depósito que no fue detectado
 * Uso: node backend/fix-deposit.js <txHash> <walletAddress>
 * 
 * IMPORTANTE: Solo usar para depósitos legítimos que no fueron procesados
 */

const { createPublicClient, http, formatUnits } = require('viem');
const { base } = require('viem/chains');
const { createClient } = require('@supabase/supabase-js');
const { DepositListener } = require('./deposit-listener');

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

async function fixDeposit(txHash, userWalletAddress) {
    console.log('🔧 PROCESANDO DEPÓSITO MANUALMENTE');
    console.log('================================\n');
    console.log(`Tx Hash: ${txHash}`);
    console.log(`Wallet Usuario: ${userWalletAddress}`);
    console.log(`Platform Wallet: ${PLATFORM_WALLET}\n`);

    try {
        // 1. Verificar transacción
        console.log('1️⃣ Verificando transacción...');
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

        if (receipt.status !== 'success') {
            throw new Error('Transacción fallida');
        }

        // 2. Buscar evento Transfer de USDC
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

        let transferEvent = null;
        for (const log of receipt.logs) {
            if (log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
                try {
                    const decoded = await publicClient.decodeEventLog({
                        abi: ERC20_TRANSFER_ABI,
                        data: log.data,
                        topics: log.topics
                    });

                    if (decoded.args.to.toLowerCase() === PLATFORM_WALLET.toLowerCase()) {
                        transferEvent = decoded;
                        break;
                    }
                } catch (e) {
                    // Continuar buscando
                }
            }
        }

        if (!transferEvent) {
            throw new Error('No se encontró evento Transfer de USDC a la wallet de la plataforma');
        }

        const from = transferEvent.args.from;
        const value = transferEvent.args.value;
        const amount = parseFloat(formatUnits(value, 6));

        console.log(`   ✅ Transacción válida`);
        console.log(`   From: ${from}`);
        console.log(`   Amount: ${amount} USDC\n`);

        // Verificar que la wallet coincida
        if (from.toLowerCase() !== userWalletAddress.toLowerCase()) {
            console.log(`   ⚠️ ADVERTENCIA: Wallet origen no coincide`);
            console.log(`   Esperado: ${userWalletAddress}`);
            console.log(`   Encontrado: ${from}`);
            console.log(`   Continuando con wallet de la transacción...\n`);
        }

        // PROTECCIÓN CRÍTICA: Verificar si ya está procesado ANTES de procesar
        const { data: existing, error: checkError } = await supabase
            .from('deposits')
            .select('id, user_id, credits_awarded, status, processed_at')
            .eq('tx_hash', txHash)
            .single();

        if (existing) {
            console.log(`[fix-deposit] ⚠️ DEPÓSITO DUPLICADO DETECTADO:`, {
                txHash,
                existingId: existing.id,
                userId: existing.user_id,
                creditsAlreadyAwarded: existing.credits_awarded,
                status: existing.status,
                processedAt: existing.processed_at
            });
            throw new Error(`Este depósito ya fue procesado anteriormente. ID: ${existing.id}, Créditos acreditados: ${existing.credits_awarded}, Fecha: ${existing.processed_at}`);
        }

        // Si hay error de consulta, no procesar por seguridad
        if (checkError && checkError.code !== 'PGRST116') {
            console.error('[fix-deposit] Error checking for existing deposit:', checkError);
            throw new Error('Error verificando depósito existente. No se procesará por seguridad.');
        }

        // 4. Crear evento simulado para procesar
        console.log('2️⃣ Procesando depósito...');
        const mockEvent = {
            transactionHash: txHash,
            args: {
                from: from,
                to: PLATFORM_WALLET,
                value: value
            }
        };

        // Crear instancia de DepositListener y procesar
        const depositListener = new DepositListener();
        await depositListener.init();

        // Procesar el depósito
        await depositListener.processDeposit(mockEvent, 'USDC', USDC_ADDRESS);

        console.log('\n✅ DEPÓSITO PROCESADO EXITOSAMENTE');
        console.log('================================\n');

        // Verificar resultado
        const { data: newDeposit } = await supabase
            .from('deposits')
            .select('*')
            .eq('tx_hash', txHash)
            .single();

        if (newDeposit) {
            console.log('📊 Detalles del depósito procesado:');
            console.log(`   ID: ${newDeposit.id}`);
            console.log(`   User ID: ${newDeposit.user_id}`);
            console.log(`   Credits: ${newDeposit.credits_awarded}`);
            console.log(`   Fee: ${newDeposit.deposit_fee}`);
            console.log(`   Status: ${newDeposit.status}\n`);

            // Verificar balance del usuario
            const { data: userCredits } = await supabase
                .from('user_credits')
                .select('credits')
                .eq('user_id', newDeposit.user_id)
                .single();

            console.log(`💰 Balance actual del usuario: ${userCredits?.credits || 0} créditos\n`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Ejecutar
const txHash = process.argv[2];
const walletAddress = process.argv[3];

if (!txHash || !walletAddress) {
    console.log('Uso: node backend/fix-deposit.js <txHash> <walletAddress>');
    console.log('Ejemplo: node backend/fix-deposit.js 0x1234... 0x5678...');
    console.log('\n⚠️ IMPORTANTE: Solo usar para depósitos legítimos verificados');
    process.exit(1);
}

fixDeposit(txHash, walletAddress).then(() => {
    process.exit(0);
}).catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
});
