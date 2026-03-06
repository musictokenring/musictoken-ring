/**
 * Script para procesar manualmente un depósito faltante
 * Úsalo cuando el sistema multi-red no detecta automáticamente un depósito
 */

const { createPublicClient, http, formatUnits, decodeEventLog } = require('viem');
const { mainnet } = require('viem/chains');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY no está configurada');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS || '0x75376BC58830f27415402875D26B73A6BE8E2253';
const USDC_ADDRESS_ETHEREUM = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const DEPOSIT_FEE_RATE = 0.05; // 5%

// ERC20 Transfer Event ABI
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

async function processDeposit(txHash, network = 'ethereum') {
    console.log(`\n🔍 Procesando depósito: ${txHash}`);
    console.log(`📡 Red: ${network}\n`);

    try {
        // Create client for Ethereum
        const publicClient = createPublicClient({
            chain: mainnet,
            transport: http(process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com')
        });

        // Get transaction receipt
        console.log('📥 Obteniendo receipt de la transacción...');
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
        
        if (!receipt) {
            throw new Error('Receipt no encontrado');
        }

        console.log('✅ Receipt obtenido');
        console.log(`   Block: ${receipt.blockNumber}`);
        console.log(`   Status: ${receipt.status}`);

        if (receipt.status !== 'success') {
            throw new Error('La transacción falló');
        }

        // Get transaction details to see the 'to' address
        const tx = await publicClient.getTransaction({ hash: txHash });
        console.log('\n📋 Detalles de la transacción:');
        console.log(`   From: ${tx.from}`);
        console.log(`   To: ${tx.to}`);
        console.log(`   Value: ${formatUnits(tx.value, 18)} ETH`);
        
        // Check if transaction is directly to platform wallet
        const isDirectTransfer = tx.to?.toLowerCase() === PLATFORM_WALLET.toLowerCase();
        console.log(`   ¿Es transferencia directa a plataforma? ${isDirectTransfer ? '✅ SÍ' : '❌ NO'}`);
        
        // Find USDC Transfer event to platform wallet
        console.log('\n🔍 Analizando logs de la transacción...');
        console.log(`   Total logs: ${receipt.logs.length}`);
        
        // Show all USDC transfers
        const usdcLogs = receipt.logs.filter(log => 
            log.address.toLowerCase() === USDC_ADDRESS_ETHEREUM.toLowerCase()
        );
        
        console.log(`   Logs de USDC: ${usdcLogs.length}`);
        
        if (usdcLogs.length > 0) {
            console.log('\n📋 Transferencias de USDC encontradas:');
            usdcLogs.forEach((log, i) => {
                try {
                    const decoded = decodeEventLog({
                        abi: ERC20_TRANSFER_ABI,
                        data: log.data,
                        topics: log.topics
                    });
                    const amount = formatUnits(BigInt(decoded.args.value), 6);
                    const isToPlatform = decoded.args.to?.toLowerCase() === PLATFORM_WALLET.toLowerCase();
                    console.log(`   ${i + 1}. From: ${decoded.args.from}`);
                    console.log(`      To: ${decoded.args.to}`);
                    console.log(`      Amount: ${amount} USDC`);
                    console.log(`      To platform? ${isToPlatform ? '✅ SÍ' : '❌ NO'}`);
                } catch (e) {
                    console.log(`   ${i + 1}. Error decodificando log: ${e.message}`);
                }
            });
        }
        
        // Try to find transfer to platform wallet
        let transferLog = receipt.logs.find(log => {
            if (log.address.toLowerCase() !== USDC_ADDRESS_ETHEREUM.toLowerCase()) {
                return false;
            }
            
            try {
                const decoded = decodeEventLog({
                    abi: ERC20_TRANSFER_ABI,
                    data: log.data,
                    topics: log.topics
                });
                
                return decoded.args.to?.toLowerCase() === PLATFORM_WALLET.toLowerCase();
            } catch (e) {
                return false;
            }
        });

        // If no direct transfer found, check if this is a complex transaction that ended up crediting the vault
        // We'll search for transfers FROM the user's wallet that might have been routed to platform
        if (!transferLog && isDirectTransfer) {
            console.log('\n⚠️  No se encontró transferencia directa de USDC, pero la transacción es a la wallet de la plataforma.');
            console.log('   Esto podría ser una transacción compleja (swap, bridge, etc.)');
            console.log('   Buscando transferencias desde la wallet del usuario...');
            
            // Find transfers FROM user wallet
            const userTransfers = receipt.logs.filter(log => {
                if (log.address.toLowerCase() !== USDC_ADDRESS_ETHEREUM.toLowerCase()) {
                    return false;
                }
                try {
                    const decoded = decodeEventLog({
                        abi: ERC20_TRANSFER_ABI,
                        data: log.data,
                        topics: log.topics
                    });
                    return decoded.args.from?.toLowerCase() === tx.from.toLowerCase();
                } catch (e) {
                    return false;
                }
            });
            
            if (userTransfers.length > 0) {
                console.log(`   Encontradas ${userTransfers.length} transferencias desde la wallet del usuario`);
                // Use the largest transfer as the deposit amount
                let largestTransfer = null;
                let largestAmount = BigInt(0);
                
                userTransfers.forEach(log => {
                    try {
                        const decoded = decodeEventLog({
                            abi: ERC20_TRANSFER_ABI,
                            data: log.data,
                            topics: log.topics
                        });
                        const amount = BigInt(decoded.args.value);
                        if (amount > largestAmount) {
                            largestAmount = amount;
                            largestTransfer = { log, decoded, amount };
                        }
                    } catch (e) {
                        // Skip
                    }
                });
                
                if (largestTransfer) {
                    console.log(`   Usando la transferencia más grande: ${formatUnits(largestTransfer.amount, 6)} USDC`);
                    // We'll process this as if it was a deposit, even though it went to an intermediary
                    // This handles cases where the user sent USDC through a bridge or swap service
                    transferLog = largestTransfer.log;
                    // We'll need to adjust the logic below to handle this case
                }
            }
        }

        if (!transferLog) {
            console.log(`\n⚠️  Wallet de la plataforma esperada: ${PLATFORM_WALLET}`);
            console.log(`\n💡 Intentando buscar transferencias recientes a la wallet de la plataforma...`);
            
            // Try to find recent USDC transfers to platform wallet from this user
            // Search around the transaction block (±500 blocks)
            try {
                const txBlock = receipt.blockNumber;
                const searchRange = BigInt(500);
                const fromBlock = txBlock > searchRange ? txBlock - searchRange : BigInt(0);
                const toBlock = txBlock + searchRange;
                
                console.log(`   Buscando en bloques ${fromBlock} a ${toBlock} (alrededor del bloque ${txBlock})`);
                
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
                        from: tx.from.toLowerCase(),
                        to: PLATFORM_WALLET.toLowerCase()
                    },
                    fromBlock: fromBlock,
                    toBlock: toBlock
                });
                
                if (logs.length > 0) {
                    console.log(`   ✅ Encontradas ${logs.length} transferencias recientes del usuario a la plataforma`);
                    // Use the most recent one
                    const recentLog = logs[logs.length - 1];
                    transferLog = recentLog;
                    console.log(`   Usando transferencia del bloque ${recentLog.blockNumber}`);
                } else {
                    throw new Error('No se encontró transferencia de USDC a la wallet de la plataforma en esta transacción ni en transferencias recientes.');
                }
            } catch (searchError) {
                throw new Error(`No se encontró transferencia de USDC a la wallet de la plataforma. Error buscando transferencias recientes: ${searchError.message}`);
            }
        }

        // Decode transfer event
        const decoded = decodeEventLog({
            abi: ERC20_TRANSFER_ABI,
            data: transferLog.data,
            topics: transferLog.topics
        });

        const fromAddress = decoded.args.from;
        const toAddress = decoded.args.to;
        const amount = BigInt(decoded.args.value);

        console.log('✅ Transferencia encontrada:');
        console.log(`   From: ${fromAddress}`);
        console.log(`   To: ${toAddress}`);
        console.log(`   Amount: ${formatUnits(amount, 6)} USDC`);

        // Verify it's to platform wallet
        if (toAddress.toLowerCase() !== PLATFORM_WALLET.toLowerCase()) {
            throw new Error(`La transferencia no es a la wallet de la plataforma. Esperado: ${PLATFORM_WALLET}, Recibido: ${toAddress}`);
        }

        // Calculate credits (after 5% fee)
        const amountUsdc = parseFloat(formatUnits(amount, 6));
        const fee = amountUsdc * DEPOSIT_FEE_RATE;
        const creditsAwarded = amountUsdc - fee;

        console.log('\n💰 Cálculo de créditos:');
        console.log(`   Depósito: ${amountUsdc} USDC`);
        console.log(`   Fee (5%): ${fee} USDC`);
        console.log(`   Créditos: ${creditsAwarded} USDC`);

        // Check if deposit already exists
        const { data: existingDeposit } = await supabase
            .from('deposits')
            .select('*')
            .eq('tx_hash', txHash)
            .single();

        if (existingDeposit) {
            console.log('\n⚠️  Este depósito ya fue procesado:');
            console.log(`   ID: ${existingDeposit.id}`);
            console.log(`   Créditos: ${existingDeposit.credits_awarded}`);
            console.log(`   Usuario: ${existingDeposit.user_id}`);
            return existingDeposit;
        }

        // Find or create user
        console.log('\n👤 Buscando/creando usuario...');
        let { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('wallet_address', fromAddress.toLowerCase())
            .single();

        if (!user) {
            console.log('   Usuario no existe, creando...');
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert({
                    wallet_address: fromAddress.toLowerCase()
                })
                .select()
                .single();

            if (createError) {
                throw new Error(`Error creando usuario: ${createError.message}`);
            }

            user = newUser;
            console.log(`   ✅ Usuario creado: ${user.id}`);
        } else {
            console.log(`   ✅ Usuario encontrado: ${user.id}`);
        }

        // Create deposit record
        console.log('\n💾 Creando registro de depósito...');
        const { data: deposit, error: depositError } = await supabase
            .from('deposits')
            .insert({
                user_id: user.id,
                tx_hash: txHash,
                token: 'USDC',
                amount: amountUsdc,
                credits_awarded: creditsAwarded,
                rate_used: 1.0,
                usdc_value_at_deposit: amountUsdc,
                deposit_fee: fee,
                status: 'processed',
                network: network
            })
            .select()
            .single();

        if (depositError) {
            throw new Error(`Error creando depósito: ${depositError.message}`);
        }

        console.log(`   ✅ Depósito creado: ${deposit.id}`);

        // Credit user
        console.log('\n💳 Acreditando créditos al usuario...');
        const { error: creditError } = await supabase.rpc('increment_user_credits', {
            user_id_param: user.id,
            credits_to_add: creditsAwarded
        });

        if (creditError) {
            throw new Error(`Error acreditando créditos: ${creditError.message}`);
        }

        console.log(`   ✅ ${creditsAwarded} créditos acreditados`);

        // Update vault balance
        console.log('\n🏦 Actualizando vault balance...');
        const { error: vaultError } = await supabase.rpc('update_vault_balance', {
            amount_to_add: fee,
            tx_hash_param: txHash
        });

        if (vaultError) {
            console.warn(`   ⚠️  Error actualizando vault: ${vaultError.message}`);
        } else {
            console.log(`   ✅ Vault actualizado (+${fee} USDC)`);
        }

        console.log('\n✅ Depósito procesado exitosamente!');
        console.log(`\n📊 Resumen:`);
        console.log(`   Usuario: ${fromAddress}`);
        console.log(`   Créditos acreditados: ${creditsAwarded}`);
        console.log(`   Fee al vault: ${fee}`);
        console.log(`   Network: ${network}`);

        return deposit;

    } catch (error) {
        console.error('\n❌ Error procesando depósito:', error);
        console.error('Stack:', error.stack);
        throw error;
    }
}

// Main
const txHash = process.argv[2];
const network = process.argv[3] || 'ethereum';

if (!txHash) {
    console.error('❌ Uso: node process-missing-deposit.js <txHash> [network]');
    console.error('   Ejemplo: node process-missing-deposit.js 0x519d5d68597fb754bb51e9dafd4465c3eeecae28c279fdf689fc22c8c6707cb3 ethereum');
    process.exit(1);
}

processDeposit(txHash, network)
    .then(() => {
        console.log('\n✅ Proceso completado');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Proceso falló:', error.message);
        process.exit(1);
    });
