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
            
            // Create filter for Transfer events to platform wallet
            const filter = await this.publicClient.createEventFilter({
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
                toBlock: 'latest'
            });

            // Process existing events
            const events = await this.publicClient.getFilterLogs({ filter });
            console.log(`[deposit-listener] Found ${events.length} ${tokenName} transfer events`);
            
            for (const event of events) {
                await this.processDeposit(event, tokenName, tokenAddress);
            }

            // Watch for new events
            this.publicClient.watchEvent({
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
                        if (log.address.toLowerCase() === tokenAddress.toLowerCase()) {
                            await this.processDeposit(log, tokenName, tokenAddress);
                        }
                    }
                }
            });

            this.lastBlockProcessed = latestBlock;
        } catch (error) {
            console.error(`[deposit-listener] Error listening for ${tokenName}:`, error);
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

            // Calculate credits
            let credits = 0;
            if (tokenName === 'MTR') {
                credits = amount / this.currentRate; // MTR to credits
            } else if (tokenName === 'USDC') {
                // Convert USDC to MTR equivalent first, then to credits
                const mtrPrice = await this.getMTRPrice();
                const mtrEquivalent = amount / mtrPrice;
                credits = mtrEquivalent / this.currentRate;
            }

            // Round credits to 4 decimal places
            credits = Math.round(credits * 10000) / 10000;

            if (credits <= 0) {
                console.warn(`[deposit-listener] Credits too low: ${credits}, skipping`);
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

                await this.creditUser(newUser.id, credits, txHash, tokenName, amount);
            } else {
                await this.creditUser(user.id, credits, txHash, tokenName, amount);
            }

            this.processedTxHashes.add(txHash);
            console.log(`[deposit-listener] ✅ Credited ${credits} credits to user ${from}`);

        } catch (error) {
            console.error('[deposit-listener] Error processing deposit:', error);
        }
    }

    /**
     * Credit user account
     */
    async creditUser(userId, credits, txHash, tokenName, amount) {
        try {
            // Record deposit
            const { error: depositError } = await supabase
                .from('deposits')
                .insert([{
                    user_id: userId,
                    tx_hash: txHash,
                    token: tokenName,
                    amount: amount,
                    credits_awarded: credits,
                    rate_used: this.currentRate,
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

            console.log(`[deposit-listener] ✅ Credited ${credits} credits to user ${userId}`);

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
            const filter = await this.publicClient.createEventFilter({
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

            const events = await this.publicClient.getFilterLogs({ filter });
            
            for (const event of events) {
                await this.processDeposit(event, tokenName, tokenAddress);
            }
        } catch (error) {
            console.error(`[deposit-listener] Error scanning ${tokenName}:`, error);
        }
    }
}

module.exports = { DepositListener };
