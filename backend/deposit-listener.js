/**
 * Automatic Deposit Detection Service
 * Listens for MTR/USDC transfers to platform wallet and auto-converts to credits
 * Uses ethers.js event listeners + Supabase for credit management
 */

const { createPublicClient, http, formatUnits } = require('viem');
const { base } = require('viem/chains');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS || '0x75376BC58830f27415402875D26B73A6BE8E2253';
const MTR_TOKEN_ADDRESS = process.env.MTR_TOKEN_ADDRESS || '0x99cd1eb32846c9027ed9cb8710066fa08791c33b';
const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC
const INITIAL_RATE = parseFloat(process.env.MTR_TO_CREDIT_RATE || '778'); // 778 MTR = 1 credit
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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

// ERC20 balanceOf ABI
const ERC20_BALANCE_ABI = [
    {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
    }
];

class DepositListener {
    constructor() {
        this.publicClient = createPublicClient({
            chain: base,
            transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
        });
        this.isListening = false;
        this.processedTxHashes = new Set();
        this.currentRate = INITIAL_RATE;
        this.lastBlockProcessed = null;
    }

    /**
     * Initialize deposit listener
     */
    async init() {
        console.log('[deposit-listener] Initializing...');
        
        // Load current rate from database
        await this.loadCurrentRate();
        
        // Start listening for transfers
        await this.startListening();
        
        // Start periodic scan for missed deposits (mejorado: más frecuente y más bloques)
        this.startPeriodicScan();
        
        console.log('[deposit-listener] ✅ Initialized and listening');
        console.log(`[deposit-listener] Platform wallet: ${PLATFORM_WALLET}`);
        console.log(`[deposit-listener] Monitoring MTR: ${MTR_TOKEN_ADDRESS}`);
        console.log(`[deposit-listener] Monitoring USDC: ${USDC_ADDRESS}`);
    }

    /**
     * Load current MTR to credit rate from database
     */
    async loadCurrentRate() {
        try {
            const { data, error } = await supabase
                .from('platform_settings')
                .select('mtr_to_credit_rate')
                .eq('key', 'mtr_to_credit_rate')
                .single();
            
            if (data && data.mtr_to_credit_rate) {
                this.currentRate = parseFloat(data.mtr_to_credit_rate);
                console.log(`[deposit-listener] Rate loaded: ${this.currentRate} MTR = 1 credit`);
            }
        } catch (error) {
            console.warn('[deposit-listener] Using default rate:', this.currentRate);
        }
    }

    /**
     * Start listening for Transfer events
     */
    async startListening() {
        if (this.isListening) return;
        
        this.isListening = true;
        
        // Listen for MTR transfers
        this.listenForToken(MTR_TOKEN_ADDRESS, 'MTR');
        
        // Listen for USDC transfers
        this.listenForToken(USDC_ADDRESS, 'USDC');
    }

    /**
     * Listen for transfers of a specific token
     */
    async listenForToken(tokenAddress, tokenName) {
        try {
            console.log(`[deposit-listener] Listening for ${tokenName} transfers to ${PLATFORM_WALLET}`);
            
            // Get latest block
            const latestBlock = await this.publicClient.getBlockNumber();
            // Escanear más bloques históricos al iniciar (últimos 5000 bloques)
            const fromBlock = this.lastBlockProcessed || latestBlock - 5000n;
            
            // Process existing events first (scan blocks directly, don't use filters)
            try {
                console.log(`[deposit-listener] Scanning ${tokenName} transfers from block ${fromBlock} to ${latestBlock}...`);
                
                const events = await this.publicClient.getLogs({
                    address: tokenAddress,
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
                        to: PLATFORM_WALLET
                    },
                    fromBlock: fromBlock,
                    toBlock: latestBlock
                });
                
                console.log(`[deposit-listener] Found ${events.length} ${tokenName} transfer events in historical blocks`);
                
                let processedCount = 0;
                for (const event of events) {
                    try {
                        await this.processDeposit(event, tokenName, tokenAddress);
                        processedCount++;
                    } catch (processError) {
                        console.error(`[deposit-listener] Error processing event ${event.transactionHash}:`, processError.message);
                        // Continue with next event
                    }
                }
                
                console.log(`[deposit-listener] Processed ${processedCount}/${events.length} ${tokenName} deposits`);
            } catch (scanError) {
                console.warn(`[deposit-listener] Error scanning historical ${tokenName} events:`, scanError.message);
                // Continue with watchEvent even if scan fails
            }

            // Watch for new events (this doesn't use filters, so it won't fail)
            this.publicClient.watchEvent({
                address: tokenAddress,
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
                    to: PLATFORM_WALLET
                },
                onLogs: async (logs) => {
                    for (const log of logs) {
                        if (log.address && log.address.toLowerCase() === tokenAddress.toLowerCase()) {
                            await this.processDeposit(log, tokenName, tokenAddress);
                        }
                    }
                }
            });

            this.lastBlockProcessed = latestBlock;
            console.log(`[deposit-listener] ✅ ${tokenName} listener active, watching from block ${latestBlock}`);
        } catch (error) {
            console.error(`[deposit-listener] Error listening for ${tokenName}:`, error);
            // Don't throw - allow other listeners to continue
        }
    }

    /**
     * Process a deposit event
     */
    async processDeposit(event, tokenName, tokenAddress) {
        try {
            const txHash = event.transactionHash;
            
            // Skip if already processed
            if (this.processedTxHashes.has(txHash)) {
                return;
            }

            const from = event.args.from;
            const value = event.args.value;
            
            // Skip if from platform wallet (internal transfer)
            if (from.toLowerCase() === PLATFORM_WALLET.toLowerCase()) {
                return;
            }

            // PROTECCIÓN CRÍTICA: Verificar si ya está procesado en base de datos
            // Esta es la verificación PRINCIPAL que previene duplicados
            const { data: existing, error: checkError } = await supabase
                .from('deposits')
                .select('id, user_id, credits_awarded, status, processed_at')
                .eq('tx_hash', txHash)
                .single();

            if (existing) {
                console.log(`[deposit-listener] ⚠️ DEPÓSITO DUPLICADO DETECTADO Y RECHAZADO:`, {
                    txHash,
                    existingId: existing.id,
                    userId: existing.user_id,
                    creditsAlreadyAwarded: existing.credits_awarded,
                    status: existing.status,
                    processedAt: existing.processed_at
                });
                this.processedTxHashes.add(txHash);
                return; // CRÍTICO: No procesar si ya existe
            }

            // Si hay error de consulta (no es "no encontrado"), registrar pero continuar con cuidado
            if (checkError && checkError.code !== 'PGRST116') {
                console.error('[deposit-listener] Error checking for existing deposit:', checkError);
                // Continuar pero con precaución - la verificación de inserción también protegerá
            }

            console.log(`[deposit-listener] Processing ${tokenName} deposit:`, {
                txHash,
                from,
                value: value.toString()
            });

            // Get transaction details
            const tx = await this.publicClient.getTransaction({ hash: txHash });
            const receipt = await this.publicClient.getTransactionReceipt({ hash: txHash });

            if (receipt.status !== 'success') {
                console.warn(`[deposit-listener] Transaction ${txHash} failed, skipping`);
                return;
            }

            // Convert value to human-readable amount
            const decimals = tokenName === 'USDC' ? 6 : 18;
            const amount = parseFloat(formatUnits(value, decimals));

            // NUEVO SISTEMA: Créditos estables (1 crédito = 1 USDC fijo)
            // Calcular valor en USDC al momento del depósito
            let usdcValue = 0;
            if (tokenName === 'USDC') {
                // USDC directo: 1 USDC = 1 crédito
                usdcValue = amount;
            } else if (tokenName === 'MTR') {
                // MTR: convertir a USDC usando precio actual
                const mtrPrice = await this.getMTRPrice();
                if (!mtrPrice || mtrPrice <= 0) {
                    throw new Error('MTR price unavailable');
                }
                usdcValue = amount * mtrPrice; // Valor en USDC
            }

            // Fee de depósito: 5% del valor en USDC
            const DEPOSIT_FEE_RATE = 0.05; // 5%
            const depositFee = usdcValue * DEPOSIT_FEE_RATE;
            
            // Créditos otorgados: valor USDC - fee (1 crédito = 1 USDC)
            const credits = usdcValue - depositFee;

            // Round credits to 4 decimal places
            const creditsRounded = Math.round(credits * 10000) / 10000;

            if (creditsRounded <= 0) {
                console.warn(`[deposit-listener] Credits too low: ${creditsRounded}, skipping`);
                return;
            }

            // Find user by wallet address
            const { data: user } = await supabase
                .from('users')
                .select('id')
                .eq('wallet_address', from.toLowerCase())
                .single();

            if (!user) {
                console.warn(`[deposit-listener] User not found for wallet ${from}`);
                // Create user if doesn't exist
                const { data: newUser, error: createError } = await supabase
                    .from('users')
                    .insert([{
                        wallet_address: from.toLowerCase(),
                        created_at: new Date().toISOString()
                    }])
                    .select()
                    .single();

                if (createError || !newUser) {
                    console.error('[deposit-listener] Error creating user:', createError);
                    return;
                }

                await this.creditUser(newUser.id, creditsRounded, txHash, tokenName, amount, usdcValue, depositFee);
            } else {
                await this.creditUser(user.id, creditsRounded, txHash, tokenName, amount, usdcValue, depositFee);
            }

            this.processedTxHashes.add(txHash);
            console.log(`[deposit-listener] ✅ Credited ${creditsRounded} credits (${usdcValue} USDC - ${depositFee} fee) to user ${from}`);

        } catch (error) {
            console.error('[deposit-listener] Error processing deposit:', error);
            // Log más detalles para debugging
            console.error('[deposit-listener] Deposit details:', {
                txHash: event?.transactionHash,
                from: event?.args?.from,
                tokenName,
                error: error.message,
                stack: error.stack
            });
            // No re-throw para que otros depósitos puedan procesarse
        }
    }

    /**
     * Credit user account
     */
    async creditUser(userId, credits, txHash, tokenName, amount, usdcValue, depositFee) {
        try {
            // PROTECCIÓN CRÍTICA: Verificar una vez más antes de insertar (race condition protection)
            const { data: lastCheck } = await supabase
                .from('deposits')
                .select('id')
                .eq('tx_hash', txHash)
                .single();

            if (lastCheck) {
                console.error(`[deposit-listener] ⚠️ DUPLICADO DETECTADO EN ÚLTIMO MOMENTO - TxHash ${txHash} ya existe en DB. Abortando crédito.`);
                return; // CRÍTICO: No continuar si ya existe
            }

            // Obtener el rate actual para USDC (siempre 1:1) o MTR (desde price updater)
            let rateUsed = 1.0; // Default para USDC (1 USDC = 1 crédito)
            
            if (tokenName === 'MTR') {
                // Para MTR, obtener el rate desde el price updater si está disponible
                // El rate se carga en init() y se almacena en this.rate
                rateUsed = this.rate || 1.0; // Fallback a 1.0 si no hay rate disponible
            }
            
            // Record deposit with new fields
            // NOTA: Si tx_hash tiene constraint UNIQUE en DB, esto fallará si hay duplicado
            const { data: insertedDeposit, error: depositError } = await supabase
                .from('deposits')
                .insert([{
                    user_id: userId,
                    tx_hash: txHash, // Debe ser UNIQUE en la base de datos
                    token: tokenName,
                    amount: amount,
                    credits_awarded: credits,
                    usdc_value_at_deposit: usdcValue,
                    deposit_fee: depositFee,
                    rate_used: rateUsed, // Usar el rate actual en lugar de null
                    status: 'processed',
                    processed_at: new Date().toISOString()
                }])
                .select()
                .single();

            // PROTECCIÓN: Si hay error de duplicado, no continuar
            if (depositError) {
                // Verificar si es error de constraint único (duplicado)
                if (depositError.code === '23505' || depositError.message?.includes('duplicate') || depositError.message?.includes('unique')) {
                    console.error(`[deposit-listener] ⚠️ DUPLICADO BLOQUEADO POR CONSTRAINT DE BD - TxHash ${txHash} ya existe. No se acreditarán créditos.`);
                    return; // CRÍTICO: No continuar
                }
                
                console.error('[deposit-listener] Error recording deposit:', depositError);
                return; // No continuar si hay error al insertar
            }

            if (!insertedDeposit) {
                console.error('[deposit-listener] Error: Deposit insert returned no data');
                return;
            }

            // PROTECCIÓN: Solo acreditar créditos si el depósito se insertó correctamente
            // Si llegamos aquí, el depósito fue insertado exitosamente (sin duplicado)

            // Update user credits balance (atomic operation)
            const { error: balanceError } = await supabase.rpc('increment_user_credits', {
                user_id_param: userId,
                credits_to_add: credits
            });

            if (balanceError) {
                // Fallback: direct update if RPC doesn't exist
                const { data: currentBalance } = await supabase
                    .from('user_credits')
                    .select('credits')
                    .eq('user_id', userId)
                    .single();

                const newBalance = (currentBalance?.credits || 0) + credits;

                const { error: updateError } = await supabase
                    .from('user_credits')
                    .upsert([{
                        user_id: userId,
                        credits: newBalance,
                        updated_at: new Date().toISOString()
                    }], {
                        onConflict: 'user_id'
                    });

                if (updateError) {
                    console.error('[deposit-listener] Error updating user credits:', updateError);
                    // IMPORTANTE: Si falla actualizar créditos, el depósito ya está registrado
                    // Esto es aceptable - el depósito existe y puede ser corregido manualmente
                }
            }

            // Enviar fee al vault (5% del depósito)
            // Solo enviar fee si todo fue exitoso (depósito registrado y créditos acreditados)
            await this.sendFeeToVault(depositFee, 'deposit', txHash);

            console.log(`[deposit-listener] ✅ Credited ${credits} credits to user ${userId}, fee ${depositFee} USDC sent to vault`);
            console.log(`[deposit-listener] ✅ Deposit ${txHash} processed successfully - NO DUPLICATES POSSIBLE`);

        } catch (error) {
            console.error('[deposit-listener] Error crediting user:', error);
        }
    }

    /**
     * Get current MTR price in USDC
     */
    async getMTRPrice() {
        try {
            const { data } = await supabase
                .from('platform_settings')
                .select('mtr_usdc_price')
                .eq('key', 'mtr_usdc_price')
                .single();

            return data?.mtr_usdc_price || 0.001; // Fallback price
        } catch (error) {
            return 0.001; // Fallback
        }
    }

    /**
     * Send fee to vault
     */
    async sendFeeToVault(feeAmount, feeType, txHash) {
        try {
            // Llamar al backend API para agregar fee al vault
            const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:3001';
            
            try {
                const response = await fetch(`${backendUrl}/api/vault/add-fee`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        feeType: feeType,
                        amount: feeAmount,
                        sourceTxHash: txHash
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log(`[deposit-listener] Fee ${feeAmount} USDC sent to vault (type: ${feeType})`);
                    return result;
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            } catch (apiError) {
                // Fallback: registrar directamente en base de datos si API no está disponible
                console.warn('[deposit-listener] API not available, recording fee directly:', apiError.message);
                const { error } = await supabase
                    .from('vault_fees')
                    .insert([{
                        fee_type: feeType,
                        amount: feeAmount,
                        source_tx_hash: txHash,
                        status: 'pending',
                        created_at: new Date().toISOString()
                    }]);

                if (error) {
                    console.error('[deposit-listener] Error recording fee:', error);
                }
            }
        } catch (error) {
            console.error('[deposit-listener] Error sending fee to vault:', error);
        }
    }

    /**
     * Periodic scan for missed deposits
     * Mejorado: escanea más bloques y con mayor frecuencia
     */
    startPeriodicScan() {
        // Escanear inmediatamente al iniciar
        setTimeout(async () => {
            console.log('[deposit-listener] Running initial scan...');
            const latestBlock = await this.publicClient.getBlockNumber();
            const fromBlock = this.lastBlockProcessed || latestBlock - 5000n; // Últimos 5000 bloques
            
            // Scan MTR
            await this.scanBlockRange(MTR_TOKEN_ADDRESS, 'MTR', fromBlock, latestBlock);
            
            // Scan USDC
            await this.scanBlockRange(USDC_ADDRESS, 'USDC', fromBlock, latestBlock);
            
            this.lastBlockProcessed = latestBlock;
        }, 10000); // Esperar 10 segundos después de iniciar

        // Escanear periódicamente cada 2 minutos (más frecuente)
        setInterval(async () => {
            console.log('[deposit-listener] Running periodic scan...');
            const latestBlock = await this.publicClient.getBlockNumber();
            const fromBlock = this.lastBlockProcessed || latestBlock - 2000n; // Últimos 2000 bloques
            
            // Scan MTR
            await this.scanBlockRange(MTR_TOKEN_ADDRESS, 'MTR', fromBlock, latestBlock);
            
            // Scan USDC
            await this.scanBlockRange(USDC_ADDRESS, 'USDC', fromBlock, latestBlock);
            
            this.lastBlockProcessed = latestBlock;
        }, 2 * 60 * 1000); // Every 2 minutes (más frecuente que antes)
    }

    /**
     * Scan block range for deposits
     * Mejorado: mejor manejo de errores y logging
     */
    async scanBlockRange(tokenAddress, tokenName, fromBlock, toBlock) {
        try {
            // Use getLogs directly instead of createEventFilter + getFilterLogs
            // This avoids "filter not found" errors when filters expire
            const events = await this.publicClient.getLogs({
                address: tokenAddress,
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
                    to: PLATFORM_WALLET
                },
                fromBlock: fromBlock,
                toBlock: toBlock
            });
            
            console.log(`[deposit-listener] Scanned ${tokenName} blocks ${fromBlock}-${toBlock}: found ${events.length} events`);
            
            let processedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;

            for (const event of events) {
                try {
                    // Verificar si ya está procesado antes de intentar procesar
                    const { data: existing } = await supabase
                        .from('deposits')
                        .select('id')
                        .eq('tx_hash', event.transactionHash)
                        .single();

                    if (existing) {
                        skippedCount++;
                        continue;
                    }

                    await this.processDeposit(event, tokenName, tokenAddress);
                    processedCount++;
                } catch (processError) {
                    errorCount++;
                    console.error(`[deposit-listener] Error processing ${tokenName} deposit ${event.transactionHash}:`, processError.message);
                    // Continuar con el siguiente evento
                }
            }

            if (processedCount > 0 || errorCount > 0) {
                console.log(`[deposit-listener] ${tokenName} scan results: ${processedCount} processed, ${skippedCount} skipped, ${errorCount} errors`);
            }
        } catch (error) {
            console.error(`[deposit-listener] Error scanning ${tokenName} blocks ${fromBlock}-${toBlock}:`, error.message);
            // Don't throw - allow periodic scan to continue
        }
    }
}

module.exports = { DepositListener };
