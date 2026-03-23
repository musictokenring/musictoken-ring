/**
 * Automatic Deposit Detection Service
 * Escucha transferencias MTR / stablecoin USDC (Base) a la wallet plataforma y acredita créditos
 * Uses ethers.js event listeners + Supabase for credit management
 */

const { createPublicClient, http, formatUnits } = require('viem');
const { base } = require('viem/chains');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS;
if (!PLATFORM_WALLET) {
    throw new Error('PLATFORM_WALLET_ADDRESS is required');
}
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
        
        // Start periodic scan for missed deposits
        this.startPeriodicScan();
        
        console.log('[deposit-listener] Initialized and listening');
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
            const fromBlock = this.lastBlockProcessed || latestBlock - 1000n; // Check last 1000 blocks initially
            
            // Process existing events first (scan blocks directly, don't use filters)
            try {
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
                
                for (const event of events) {
                    await this.processDeposit(event, tokenName, tokenAddress);
                }
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

            // Check if already processed in database
            const { data: existing } = await supabase
                .from('deposits')
                .select('id')
                .eq('tx_hash', txHash)
                .single();

            if (existing) {
                this.processedTxHashes.add(txHash);
                return;
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

            // Créditos estables (1 crédito ≈ 1 USD nominal); on-chain USDC Base = 1:1
            let usdcValue = 0;
            if (tokenName === 'USDC') {
                usdcValue = amount;
            } else if (tokenName === 'MTR') {
                const mtrPrice = await this.getMTRPrice();
                if (!mtrPrice || mtrPrice <= 0) {
                    throw new Error('MTR price unavailable');
                }
                usdcValue = amount * mtrPrice;
            }

            // Fee 5% del valor nominal
            const DEPOSIT_FEE_RATE = 0.05; // 5%
            const depositFee = usdcValue * DEPOSIT_FEE_RATE;
            
            // Créditos: valor nominal - fee
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
            console.log(`[deposit-listener] ✅ Credited ${creditsRounded} credits (${usdcValue} USD nominal - ${depositFee} fee) to user ${from}`);

        } catch (error) {
            console.error('[deposit-listener] Error processing deposit:', error);
        }
    }

    /**
     * Credit user account
     */
    async creditUser(userId, credits, txHash, tokenName, amount, usdcValue, depositFee) {
        try {
            // Record deposit with new fields
            const { error: depositError } = await supabase
                .from('deposits')
                .insert([{
                    user_id: userId,
                    tx_hash: txHash,
                    token: tokenName,
                    amount: amount,
                    credits_awarded: credits,
                    usdc_value_at_deposit: usdcValue, // Nuevo campo
                    deposit_fee: depositFee, // Nuevo campo
                    rate_used: null, // Ya no se usa rate variable
                    status: 'processed',
                    processed_at: new Date().toISOString()
                }]);

            if (depositError) {
                console.error('[deposit-listener] Error recording deposit:', depositError);
                return;
            }

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

                await supabase
                    .from('user_credits')
                    .upsert([{
                        user_id: userId,
                        credits: newBalance,
                        updated_at: new Date().toISOString()
                    }], {
                        onConflict: 'user_id'
                    });
            }

            // Enviar fee al vault (5% del depósito)
            await this.sendFeeToVault(depositFee, 'deposit', txHash);

            console.log(`[deposit-listener] ✅ Credited ${credits} credits to user ${userId}, fee ${depositFee} USD nominal to vault`);

        } catch (error) {
            console.error('[deposit-listener] Error crediting user:', error);
        }
    }

    /**
     * Get current MTR price in USD (stable reference)
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
                    console.log(`[deposit-listener] Fee ${feeAmount} USD nominal (USDC on Base) to vault (type: ${feeType})`);
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
     */
    startPeriodicScan() {
        setInterval(async () => {
            console.log('[deposit-listener] Running periodic scan...');
            const latestBlock = await this.publicClient.getBlockNumber();
            const fromBlock = this.lastBlockProcessed || latestBlock - 5000n;
            
            // Scan MTR
            await this.scanBlockRange(MTR_TOKEN_ADDRESS, 'MTR', fromBlock, latestBlock);
            
            // Scan USDC
            await this.scanBlockRange(USDC_ADDRESS, 'USDC', fromBlock, latestBlock);
            
            this.lastBlockProcessed = latestBlock;
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    /**
     * Scan block range for deposits
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
            
            for (const event of events) {
                await this.processDeposit(event, tokenName, tokenAddress);
            }
        } catch (error) {
            console.error(`[deposit-listener] Error scanning ${tokenName}:`, error.message);
            // Don't throw - allow periodic scan to continue
        }
    }
}

module.exports = { DepositListener };
