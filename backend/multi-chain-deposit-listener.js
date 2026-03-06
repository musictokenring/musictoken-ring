/**
 * Multi-Chain Deposit Detection Service
 * Monitors USDC deposits to platform wallet across multiple networks:
 * - Base (main network)
 * - Ethereum Mainnet
 * - Polygon
 * - Optimism
 * - Arbitrum
 * 
 * Automatically credits user accounts regardless of which network was used
 */

const { createPublicClient, http, formatUnits } = require('viem');
const { createClient } = require('@supabase/supabase-js');

// Import chains individually to avoid issues
let base, mainnet, polygon, optimism, arbitrum;
try {
    const chains = require('viem/chains');
    base = chains.base;
    mainnet = chains.mainnet;
    polygon = chains.polygon;
    optimism = chains.optimism;
    arbitrum = chains.arbitrum;
} catch (error) {
    console.error('[multi-chain] Error loading chains:', error);
    // Fallback: try individual imports
    try {
        base = require('viem/chains').base;
        mainnet = require('viem/chains').mainnet;
        polygon = require('viem/chains').polygon;
        optimism = require('viem/chains').optimism;
        arbitrum = require('viem/chains').arbitrum;
    } catch (e) {
        console.error('[multi-chain] Failed to load chains:', e);
        throw new Error('Cannot load viem chains. Please check viem installation.');
    }
}

// Configuration
const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS || '0x75376BC58830f27415402875D26B73A6BE8E2253';
const DEPOSIT_FEE_RATE = 0.05; // 5%

// USDC addresses on different networks
const USDC_ADDRESSES = {
    base: process.env.USDC_ADDRESS_BASE || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    ethereum: process.env.USDC_ADDRESS_ETHEREUM || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    polygon: process.env.USDC_ADDRESS_POLYGON || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    optimism: process.env.USDC_ADDRESS_OPTIMISM || '0x7F5c764cB1414f8692694c42fE9D426fC24B1C57',
    arbitrum: process.env.USDC_ADDRESS_ARBITRUM || '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'
};

// RPC URLs for each network
const RPC_URLS = {
    base: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    ethereum: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
    polygon: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    optimism: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
    arbitrum: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc'
};

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

class MultiChainDepositListener {
    constructor() {
        this.clients = {};
        this.isListening = false;
        this.processedTxHashes = new Set();
        this.lastBlockProcessed = {};
        
        // Initialize clients for each network
        this.initClients();
    }

    /**
     * Initialize public clients for each network
     */
    initClients() {
        this.clients = {};
        
        // Verify chains are loaded
        if (!base) {
            console.error('[multi-chain] ❌ Base chain not loaded. Cannot initialize clients.');
            return;
        }
        
        // Initialize Base (always available)
        try {
            this.clients.base = createPublicClient({
                chain: base,
                transport: http(RPC_URLS.base)
            });
            console.log('[multi-chain] ✅ Base client initialized');
        } catch (error) {
            console.error('[multi-chain] ❌ Error initializing Base client:', error);
            console.error('[multi-chain] Error details:', error.message);
        }
        
        // Initialize other networks (optional, fail gracefully)
        if (mainnet) {
            try {
                this.clients.ethereum = createPublicClient({
                    chain: mainnet,
                    transport: http(RPC_URLS.ethereum)
                });
                console.log('[multi-chain] ✅ Ethereum client initialized');
            } catch (error) {
                console.warn('[multi-chain] ⚠️ Ethereum client not available:', error.message);
            }
        } else {
            console.warn('[multi-chain] ⚠️ Mainnet chain not loaded, skipping Ethereum');
        }
        
        if (polygon) {
            try {
                this.clients.polygon = createPublicClient({
                    chain: polygon,
                    transport: http(RPC_URLS.polygon)
                });
                console.log('[multi-chain] ✅ Polygon client initialized');
            } catch (error) {
                console.warn('[multi-chain] ⚠️ Polygon client not available:', error.message);
            }
        } else {
            console.warn('[multi-chain] ⚠️ Polygon chain not loaded, skipping Polygon');
        }
        
        if (optimism) {
            try {
                this.clients.optimism = createPublicClient({
                    chain: optimism,
                    transport: http(RPC_URLS.optimism)
                });
                console.log('[multi-chain] ✅ Optimism client initialized');
            } catch (error) {
                console.warn('[multi-chain] ⚠️ Optimism client not available:', error.message);
            }
        } else {
            console.warn('[multi-chain] ⚠️ Optimism chain not loaded, skipping Optimism');
        }
        
        if (arbitrum) {
            try {
                this.clients.arbitrum = createPublicClient({
                    chain: arbitrum,
                    transport: http(RPC_URLS.arbitrum)
                });
                console.log('[multi-chain] ✅ Arbitrum client initialized');
            } catch (error) {
                console.warn('[multi-chain] ⚠️ Arbitrum client not available:', error.message);
            }
        } else {
            console.warn('[multi-chain] ⚠️ Arbitrum chain not loaded, skipping Arbitrum');
        }
        
        console.log(`[multi-chain] ✅ Initialized ${Object.keys(this.clients).length} network client(s)`);
    }

    /**
     * Initialize multi-chain deposit listener
     */
    async init() {
        console.log('[multi-chain] ==========================================');
        console.log('[multi-chain] 🚀 Initializing multi-chain deposit listener...');
        console.log('[multi-chain] ==========================================');
        
        // Start listening on all available networks (don't fail if one network fails)
        const networks = Object.keys(this.clients); // Only networks that have clients initialized
        console.log(`[multi-chain] Attempting to start listeners for: ${networks.join(', ')}`);
        
        const results = await Promise.allSettled(
            networks.map(network => this.startListening(network))
        );
        
        // Log results
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        
        console.log(`[multi-chain] ✅ ${successful} network(s) initialized successfully`);
        if (failed > 0) {
            console.log(`[multi-chain] ⚠️ ${failed} network(s) failed to initialize (will retry periodically)`);
        }
        
        if (successful === 0) {
            console.error('[multi-chain] ❌ CRITICAL: No networks initialized! Check RPC configuration.');
        }
        
        // Start periodic scans for missed deposits
        this.startPeriodicScan();
        
        console.log('[multi-chain] ==========================================');
        console.log('[multi-chain] ✅ Multi-chain listener initialization complete');
        console.log('[multi-chain] ==========================================');
    }

    /**
     * Start listening for deposits on a specific network
     */
    async startListening(networkName) {
        try {
            const client = this.clients[networkName];
            const usdcAddress = USDC_ADDRESSES[networkName];
            
            if (!client || !usdcAddress) {
                console.warn(`[multi-chain] ⚠️ Skipping ${networkName}: client or USDC address not configured`);
                return;
            }

            console.log(`[multi-chain] 🌐 Starting listener for ${networkName}...`);
            console.log(`[multi-chain] 📍 Monitoring USDC: ${usdcAddress}`);
            console.log(`[multi-chain] 💼 Platform wallet: ${PLATFORM_WALLET}`);

            // Get current block
            let currentBlock;
            try {
                currentBlock = await client.getBlockNumber();
                this.lastBlockProcessed[networkName] = currentBlock;
                console.log(`[multi-chain] ✅ ${networkName} connected - Current block: ${currentBlock.toString()}`);
            } catch (rpcError) {
                console.error(`[multi-chain] ❌ Error connecting to ${networkName} RPC:`, rpcError.message);
                console.log(`[multi-chain] ⚠️ ${networkName} listener disabled - RPC unavailable`);
                return; // Skip this network if RPC is not available
            }

            // Initial historical scan (last 5000 blocks) - run in background
            this.scanHistoricalBlocks(networkName, currentBlock - BigInt(5000), currentBlock)
                .catch(error => {
                    console.error(`[multi-chain] Error in initial scan for ${networkName}:`, error);
                });

            // Start watching for new blocks (with error handling)
            try {
                client.watchBlocks({
                    onBlock: async (block) => {
                        try {
                            await this.scanBlock(networkName, block.number);
                        } catch (error) {
                            console.error(`[multi-chain] Error processing block on ${networkName}:`, error.message);
                        }
                    },
                    onError: (error) => {
                        console.error(`[multi-chain] Error watching blocks on ${networkName}:`, error.message);
                    }
                });
                console.log(`[multi-chain] ✅ ${networkName} listener active`);
            } catch (watchError) {
                console.error(`[multi-chain] Error setting up block watcher for ${networkName}:`, watchError.message);
                console.log(`[multi-chain] ⚠️ ${networkName} will use periodic scan only`);
            }
        } catch (error) {
            console.error(`[multi-chain] Error starting listener for ${networkName}:`, error);
        }
    }

    /**
     * Scan historical blocks for missed deposits
     */
    async scanHistoricalBlocks(networkName, fromBlock, toBlock) {
        try {
            console.log(`[multi-chain] Scanning ${networkName} blocks ${fromBlock.toString()} to ${toBlock.toString()}...`);
            
            const client = this.clients[networkName];
            const usdcAddress = USDC_ADDRESSES[networkName];
            
            const logs = await client.getLogs({
                address: usdcAddress,
                event: ERC20_TRANSFER_ABI[0],
                args: {
                    to: PLATFORM_WALLET
                },
                fromBlock: fromBlock,
                toBlock: toBlock
            });

            console.log(`[multi-chain] Found ${logs.length} USDC transfers to platform on ${networkName}`);

            for (const log of logs) {
                await this.processDeposit(networkName, log);
            }
        } catch (error) {
            console.error(`[multi-chain] Error scanning historical blocks on ${networkName}:`, error);
        }
    }

    /**
     * Scan a single block for deposits
     */
    async scanBlock(networkName, blockNumber) {
        try {
            const client = this.clients[networkName];
            const usdcAddress = USDC_ADDRESSES[networkName];
            
            const logs = await client.getLogs({
                address: usdcAddress,
                event: ERC20_TRANSFER_ABI[0],
                args: {
                    to: PLATFORM_WALLET
                },
                fromBlock: blockNumber,
                toBlock: blockNumber
            });

            if (logs.length > 0) {
                console.log(`[multi-chain] Found ${logs.length} deposit(s) in block ${blockNumber.toString()} on ${networkName}`);
                
                for (const log of logs) {
                    await this.processDeposit(networkName, log);
                }
            }

            this.lastBlockProcessed[networkName] = blockNumber;
        } catch (error) {
            console.error(`[multi-chain] Error scanning block on ${networkName}:`, error);
        }
    }

    /**
     * Process a deposit from any network
     */
    async processDeposit(networkName, log) {
        try {
            const txHash = log.transactionHash;
            
            // Skip if already processed
            if (this.processedTxHashes.has(`${networkName}:${txHash}`)) {
                return;
            }

            // Check if already in database
            const { data: existing } = await supabase
                .from('deposits')
                .select('id')
                .eq('tx_hash', txHash)
                .single();

            if (existing) {
                console.log(`[multi-chain] Deposit ${txHash} already processed, skipping`);
                this.processedTxHashes.add(`${networkName}:${txHash}`);
                return;
            }

            // Decode the transfer event
            const client = this.clients[networkName];
            const decoded = await client.decodeEventLog({
                abi: ERC20_TRANSFER_ABI,
                data: log.data,
                topics: log.topics
            });

            const from = decoded.args.from;
            const value = decoded.args.value;
            
            // Skip if from platform wallet (internal transfer)
            if (from.toLowerCase() === PLATFORM_WALLET.toLowerCase()) {
                return;
            }

            // Get transaction receipt to verify success
            const receipt = await client.getTransactionReceipt({ hash: txHash });
            if (receipt.status !== 'success') {
                console.warn(`[multi-chain] Transaction ${txHash} failed on ${networkName}, skipping`);
                return;
            }

            // Convert value to human-readable amount (USDC has 6 decimals)
            const amount = parseFloat(formatUnits(value, 6));

            // Calculate credits (1 USDC = 1 credit, minus 5% fee)
            const depositFee = amount * DEPOSIT_FEE_RATE;
            const credits = amount - depositFee;
            const creditsRounded = Math.round(credits * 10000) / 10000;

            if (creditsRounded <= 0) {
                console.warn(`[multi-chain] Credits too low: ${creditsRounded}, skipping`);
                return;
            }

            console.log(`[multi-chain] Processing deposit on ${networkName}:`, {
                txHash,
                from,
                amount,
                credits: creditsRounded,
                network: networkName
            });

            // Find or create user by wallet address
            let { data: user } = await supabase
                .from('users')
                .select('id')
                .eq('wallet_address', from.toLowerCase())
                .single();

            if (!user) {
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
                    console.error(`[multi-chain] Error creating user:`, createError);
                    return;
                }

                user = newUser;
            }

            // Credit user account
            await this.creditUser(user.id, creditsRounded, txHash, networkName, amount, depositFee);

            this.processedTxHashes.add(`${networkName}:${txHash}`);
            console.log(`[multi-chain] ✅ Credited ${creditsRounded} credits (${amount} USDC - ${depositFee} fee) to user ${from} from ${networkName}`);

        } catch (error) {
            console.error(`[multi-chain] Error processing deposit on ${networkName}:`, error);
        }
    }

    /**
     * Credit user account
     */
    async creditUser(userId, credits, txHash, networkName, amount, depositFee) {
        try {
            // Final check for duplicates
            const { data: lastCheck } = await supabase
                .from('deposits')
                .select('id')
                .eq('tx_hash', txHash)
                .single();

            if (lastCheck) {
                console.error(`[multi-chain] ⚠️ DUPLICADO DETECTADO - TxHash ${txHash} ya existe. Abortando crédito.`);
                return;
            }

            // Record deposit
            const { data: insertedDeposit, error: depositError } = await supabase
                .from('deposits')
                .insert([{
                    user_id: userId,
                    tx_hash: txHash,
                    token: 'USDC',
                    amount: amount,
                    credits_awarded: credits,
                    usdc_value_at_deposit: amount,
                    deposit_fee: depositFee,
                    rate_used: 1.0, // USDC always 1:1
                    status: 'processed',
                    network: networkName, // Store which network the deposit came from
                    processed_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (depositError) {
                if (depositError.code === '23505' || depositError.message?.includes('duplicate') || depositError.message?.includes('unique')) {
                    console.error(`[multi-chain] ⚠️ DUPLICADO BLOQUEADO POR CONSTRAINT - TxHash ${txHash} ya existe.`);
                    return;
                }
                console.error(`[multi-chain] Error recording deposit:`, depositError);
                return;
            }

            if (!insertedDeposit) {
                console.error(`[multi-chain] Error: Deposit insert returned no data`);
                return;
            }

            // Update user credits balance
            const { error: balanceError } = await supabase.rpc('increment_user_credits', {
                user_id_param: userId,
                credits_to_add: credits
            });

            if (balanceError) {
                console.error(`[multi-chain] Error updating user credits:`, balanceError);
                return;
            }

            // Update vault balance (add fee)
            const { error: vaultError } = await supabase.rpc('update_vault_balance', {
                amount_to_add: depositFee
            });

            if (vaultError) {
                console.error(`[multi-chain] Error updating vault balance:`, vaultError);
            }

            console.log(`[multi-chain] ✅ Deposit recorded and credits awarded successfully`);

        } catch (error) {
            console.error(`[multi-chain] Error crediting user:`, error);
        }
    }

    /**
     * Start periodic scan for missed deposits
     */
    startPeriodicScan() {
        // Scan all networks every 2 minutes
        const scanInterval = setInterval(async () => {
            try {
                console.log('[multi-chain] 🔄 Running periodic scan on all networks...');
                
                const availableNetworks = Object.keys(this.clients).filter(name => this.clients[name]);
                
                if (availableNetworks.length === 0) {
                    console.warn('[multi-chain] ⚠️ No networks available for periodic scan');
                    return;
                }
                
                for (const networkName of availableNetworks) {
                    try {
                        const client = this.clients[networkName];
                        if (!client) continue;
                        
                        const currentBlock = await client.getBlockNumber();
                        const lastBlock = this.lastBlockProcessed[networkName] || (currentBlock - BigInt(2000));
                        
                        if (currentBlock > lastBlock) {
                            console.log(`[multi-chain] 📡 Scanning ${networkName} blocks ${lastBlock.toString()} to ${currentBlock.toString()}`);
                            await this.scanHistoricalBlocks(networkName, lastBlock, currentBlock);
                        }
                    } catch (error) {
                        console.error(`[multi-chain] ❌ Error in periodic scan for ${networkName}:`, error.message);
                        // Continue with other networks even if one fails
                    }
                }
            } catch (error) {
                console.error('[multi-chain] ❌ Error in periodic scan scheduler:', error);
            }
        }, 2 * 60 * 1000); // Every 2 minutes
        
        // Store interval ID for potential cleanup
        this.scanIntervalId = scanInterval;
        
        console.log('[multi-chain] ✅ Periodic scan started (every 2 minutes)');
    }
}

module.exports = { MultiChainDepositListener };
