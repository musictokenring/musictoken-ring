/**
 * MTR Auto-Swap Service
 * Automatically buys MTR from Uniswap/BaseSwap when USDC deposits arrive
 * Manages liquidity pool and sells MTR when needed for payouts
 * 
 * Flow:
 * 1. USDC deposit detected → Buy MTR automatically (90% of deposit)
 * 2. MTR goes to internal pool wallet
 * 3. When payout needed → Sell MTR if USDC buffer insufficient
 * 4. Result: MTR volume, price movement, user always gets USDC
 */

const { createPublicClient, createWalletClient, http, parseUnits, formatUnits, encodeFunctionData } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS || '0x75376BC58830f27415402875D26B73A6BE8E2253';
const MTR_TOKEN_ADDRESS = process.env.MTR_TOKEN_ADDRESS || '0x99cd1eb32846c9027ed9cb8710066fa08791c33b';
const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SWAP_WALLET_PRIVATE_KEY = process.env.SWAP_WALLET_PRIVATE_KEY || process.env.ADMIN_WALLET_PRIVATE_KEY;
const MTR_POOL_WALLET = process.env.MTR_POOL_WALLET || PLATFORM_WALLET; // Wallet donde se guarda el MTR comprado

// Uniswap V3 Router on Base
const UNISWAP_V3_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481'; // Base Uniswap V3 Router
const UNISWAP_V3_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD'; // Base Uniswap V3 Factory
const BASE_SWAP_ROUTER = '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86'; // BaseSwap Router (alternative)

// Swap configuration
const SWAP_PERCENTAGE = parseFloat(process.env.SWAP_PERCENTAGE || '0.90'); // 90% of deposit goes to MTR purchase
const MIN_SWAP_AMOUNT = parseFloat(process.env.MIN_SWAP_AMOUNT || '10'); // Minimum 10 USDC to trigger swap
const MAX_DAILY_SWAP = parseFloat(process.env.MAX_DAILY_SWAP || '10000'); // Max 10k USDC per day
const USDC_BUFFER_PERCENTAGE = parseFloat(process.env.USDC_BUFFER_PERCENTAGE || '0.20'); // Keep 20% USDC for immediate payouts
const SLIPPAGE_TOLERANCE = parseFloat(process.env.SLIPPAGE_TOLERANCE || '0.05'); // 5% slippage tolerance

// Treasury protection configuration
const MIN_MTR_RESERVE_USDC_VALUE = parseFloat(process.env.MIN_MTR_RESERVE_USDC_VALUE || '1000000'); // Minimum reserve value in USDC (default: $1M - conservador)
const TREASURY_PROTECTION_UPDATE_INTERVAL = parseInt(process.env.TREASURY_PROTECTION_UPDATE_INTERVAL || '1800000'); // Update every 30 minutes (1800000ms) - más frecuente para mejor protección

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ERC20 ABI
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
    },
    {
        type: 'function',
        name: 'transferFrom',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' }
        ],
        outputs: [{ name: '', type: 'bool' }]
    },
    {
        type: 'function',
        name: 'approve',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' }
        ],
        outputs: [{ name: '', type: 'bool' }]
    },
    {
        type: 'function',
        name: 'allowance',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' }
        ],
        outputs: [{ name: '', type: 'uint256' }]
    },
    {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
    }
];

// Uniswap V3 Router ABI (simplified for swapExactInputSingle)
const UNISWAP_ROUTER_ABI = [
    {
        type: 'function',
        name: 'exactInputSingle',
        stateMutability: 'payable',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'tokenIn', type: 'address' },
                    { name: 'tokenOut', type: 'address' },
                    { name: 'fee', type: 'uint24' },
                    { name: 'recipient', type: 'address' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' },
                    { name: 'sqrtPriceLimitX96', type: 'uint160' }
                ]
            }
        ],
        outputs: [{ name: 'amountOut', type: 'uint256' }]
    },
    {
        type: 'function',
        name: 'exactInput',
        stateMutability: 'payable',
        inputs: [
            {
                name: 'params',
                type: 'tuple',
                components: [
                    { name: 'path', type: 'bytes' },
                    { name: 'recipient', type: 'address' },
                    { name: 'deadline', type: 'uint256' },
                    { name: 'amountIn', type: 'uint256' },
                    { name: 'amountOutMinimum', type: 'uint256' }
                ]
            }
        ],
        outputs: [{ name: 'amountOut', type: 'uint256' }]
    }
];

// Uniswap V3 Factory ABI
const UNISWAP_FACTORY_ABI = [
    {
        type: 'function',
        name: 'getPool',
        stateMutability: 'view',
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'fee', type: 'uint24' }
        ],
        outputs: [{ name: 'pool', type: 'address' }]
    }
];

// Uniswap V3 Pool ABI (simplified)
const UNISWAP_POOL_ABI = [
    {
        type: 'function',
        name: 'liquidity',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint128' }]
    },
    {
        type: 'function',
        name: 'token0',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'address' }]
    },
    {
        type: 'function',
        name: 'token1',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'address' }]
    },
    {
        type: 'function',
        name: 'fee',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint24' }]
    }
];

class MTRSwapService {
    constructor() {
        console.log('[mtr-swap] 🔄 Initializing MTR swap service...');
        console.log('[mtr-swap] SWAP_WALLET_PRIVATE_KEY exists:', !!SWAP_WALLET_PRIVATE_KEY);
        console.log('[mtr-swap] SWAP_WALLET_PRIVATE_KEY length:', SWAP_WALLET_PRIVATE_KEY ? SWAP_WALLET_PRIVATE_KEY.length : 0);
        
        if (!SWAP_WALLET_PRIVATE_KEY) {
            console.warn('[mtr-swap] ⚠️ SWAP_WALLET_PRIVATE_KEY not set, auto-swap disabled');
            console.warn('[mtr-swap] Check environment variables in Render');
            this.enabled = false;
            return;
        }

        try {
            this.account = privateKeyToAccount(
                SWAP_WALLET_PRIVATE_KEY.startsWith('0x') 
                    ? SWAP_WALLET_PRIVATE_KEY 
                    : `0x${SWAP_WALLET_PRIVATE_KEY}`
            );
            
            this.publicClient = createPublicClient({
                chain: base,
                transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
            });
            
            this.walletClient = createWalletClient({
                account: this.account,
                chain: base,
                transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
            });
            
            this.enabled = true;
            this.dailySwapAmount = 0;
            this.lastResetDate = new Date().toDateString();
            this.poolFeeTier = null; // Will be detected on init
            this.minMTRReserve = null; // Will be calculated based on current price
            this.lastTreasuryProtectionUpdate = null;
            this.loadDailySwapAmount();
            
            // Verificar configuración de wallets
            if (MTR_POOL_WALLET.toLowerCase() === PLATFORM_WALLET.toLowerCase()) {
                console.warn('[mtr-swap] ⚠️ ADVERTENCIA: MTR_POOL_WALLET es la misma que PLATFORM_WALLET');
                console.warn('[mtr-swap] ⚠️ Esto significa que se usará la wallet de tesorería para swaps');
                console.warn('[mtr-swap] ⚠️ Recomendación: Configurar MTR_POOL_WALLET como wallet separada');
            } else {
                console.log('[mtr-swap] ✅ MTR_POOL_WALLET configurada separadamente');
            }
            
            console.log('[mtr-swap] ✅ Service initialized');
            console.log(`[mtr-swap] Swap wallet: ${this.account.address}`);
            console.log(`[mtr-swap] MTR pool wallet: ${MTR_POOL_WALLET}`);
            console.log(`[mtr-swap] Platform wallet (tesorería): ${PLATFORM_WALLET}`);
        } catch (error) {
            console.error('[mtr-swap] ❌ Error initializing service:', error);
            console.error('[mtr-swap] Error message:', error.message);
            console.error('[mtr-swap] Error stack:', error.stack);
            this.enabled = false;
        }
    }

    /**
     * Initialize pool detection (async, called after constructor)
     */
    async init() {
        if (!this.enabled) {
            return;
        }

        console.log('[mtr-swap] 🔍 Detecting MTR/USDC pool fee tier...');
        this.poolFeeTier = await this.findPoolFeeTier();
        
        if (this.poolFeeTier) {
            console.log(`[mtr-swap] ✅ Pool encontrado con fee tier: ${this.poolFeeTier} (${this.poolFeeTier === 500 ? '0.05%' : this.poolFeeTier === 3000 ? '0.3%' : '1%'})`);
        } else {
            console.error('[mtr-swap] ❌ No se encontró pool MTR/USDC con liquidez en Uniswap V3 Base');
            console.error('[mtr-swap] ❌ Los swaps estarán deshabilitados hasta que exista un pool');
            this.enabled = false;
            return;
        }

        // Initialize treasury protection
        await this.updateTreasuryProtectionLimit();
        
        // Start periodic updates of treasury protection limit
        this.startTreasuryProtectionUpdates();
    }

    /**
     * Update treasury protection limit based on current MTR price
     * This ensures the minimum reserve maintains its value in USDC
     */
    async updateTreasuryProtectionLimit() {
        try {
            const mtrPrice = await this.getMTRPrice();
            
            if (mtrPrice > 0) {
                // Calculate minimum MTR reserve based on USDC value
                // Example: If MIN_MTR_RESERVE_USDC_VALUE = 500000 and MTR price = 0.001
                // Then minMTRReserve = 500000 / 0.001 = 500,000,000 MTR
                this.minMTRReserve = MIN_MTR_RESERVE_USDC_VALUE / mtrPrice;
                
                console.log(`[mtr-swap] 🛡️ Treasury protection updated:`);
                console.log(`[mtr-swap]    MTR Price: $${mtrPrice.toFixed(6)}`);
                console.log(`[mtr-swap]    Min Reserve Value: $${MIN_MTR_RESERVE_USDC_VALUE.toLocaleString()} USDC`);
                console.log(`[mtr-swap]    Min MTR Reserve: ${this.minMTRReserve.toLocaleString()} MTR`);
                console.log(`[mtr-swap]    Protection Level: ${(this.minMTRReserve / 1000000000).toFixed(2)}B MTR protected`);
                
                this.lastTreasuryProtectionUpdate = Date.now();
            } else {
                console.warn('[mtr-swap] ⚠️ Could not get MTR price for treasury protection, using fallback');
                // Fallback: assume very low price to be conservative
                this.minMTRReserve = MIN_MTR_RESERVE_USDC_VALUE / 0.001; // Conservative estimate
            }
        } catch (error) {
            console.error('[mtr-swap] ❌ Error updating treasury protection limit:', error);
            // Use conservative fallback
            this.minMTRReserve = MIN_MTR_RESERVE_USDC_VALUE / 0.001;
        }
    }

    /**
     * Start periodic updates of treasury protection limit
     */
    startTreasuryProtectionUpdates() {
        setInterval(async () => {
            if (this.enabled) {
                console.log(`[mtr-swap] 🔄 Updating treasury protection limit (scheduled update)...`);
                await this.updateTreasuryProtectionLimit();
            }
        }, TREASURY_PROTECTION_UPDATE_INTERVAL);
        
        const updateIntervalMinutes = TREASURY_PROTECTION_UPDATE_INTERVAL / 1000 / 60;
        console.log(`[mtr-swap] 🔄 Treasury protection updates scheduled every ${updateIntervalMinutes} minutes`);
        console.log(`[mtr-swap] 🛡️ Protection will revalue automatically based on MTR price changes`);
    }

    /**
     * Check if selling MTR would violate treasury protection
     * @param {number} mtrToSell - Amount of MTR to sell
     * @param {number} currentBalance - Current MTR balance in pool wallet
     * @returns {Object} { allowed: boolean, reason?: string, availableToSell?: number }
     */
    checkTreasuryProtection(mtrToSell, currentBalance) {
        // If no limit set yet, allow (will be set on first update)
        if (!this.minMTRReserve) {
            return { allowed: true };
        }

        // Calculate total balance including treasury wallet
        // We need to check if selling would leave us below the reserve
        const totalBalance = currentBalance; // Current balance in MTR_POOL_WALLET
        
        // Check if we're using the treasury wallet (PLATFORM_WALLET)
        const isUsingTreasuryWallet = MTR_POOL_WALLET.toLowerCase() === PLATFORM_WALLET.toLowerCase();
        
            if (isUsingTreasuryWallet) {
                // If using treasury wallet, we need to protect the reserve
                const balanceAfterSale = totalBalance - mtrToSell;
                
                if (balanceAfterSale < this.minMTRReserve) {
                    const availableToSell = Math.max(0, totalBalance - this.minMTRReserve);
                    const protectionPercentage = ((this.minMTRReserve / totalBalance) * 100).toFixed(2);
                    
                    return {
                        allowed: false,
                        reason: `🛡️ Treasury protection activated: Cannot sell ${mtrToSell.toLocaleString()} MTR. ` +
                               `Current balance: ${totalBalance.toLocaleString()} MTR. ` +
                               `Minimum reserve: ${this.minMTRReserve.toLocaleString()} MTR (${protectionPercentage}% protected). ` +
                               `Available to sell: ${availableToSell.toLocaleString()} MTR`,
                        availableToSell: availableToSell,
                        protectionPercentage: protectionPercentage
                    };
                }
            }
        
        return { allowed: true };
    }

    /**
     * Find MTR/USDC pool fee tier automatically
     * Tries fee tiers: 500 (0.05%), 3000 (0.3%), 10000 (1%)
     * @returns {Promise<number|null>} Fee tier found or null if no pool exists
     */
    async findPoolFeeTier() {
        const feeTiers = [500, 3000, 10000];
        
        for (const fee of feeTiers) {
            try {
                // Get pool address from factory
                const poolAddress = await this.publicClient.readContract({
                    address: UNISWAP_V3_FACTORY,
                    abi: UNISWAP_FACTORY_ABI,
                    functionName: 'getPool',
                    args: [MTR_TOKEN_ADDRESS, USDC_ADDRESS, fee]
                });

                // Check if pool exists (not zero address)
                if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
                    console.log(`[mtr-swap] Pool encontrado con fee tier ${fee} en: ${poolAddress}`);
                    
                    // Check if pool has liquidity
                    try {
                        const liquidity = await this.publicClient.readContract({
                            address: poolAddress,
                            abi: UNISWAP_POOL_ABI,
                            functionName: 'liquidity',
                            args: []
                        });

                        if (liquidity > 0n) {
                            console.log(`[mtr-swap] ✅ Pool tiene liquidez: ${liquidity.toString()}`);
                            return fee; // Found pool with liquidity
                        } else {
                            console.log(`[mtr-swap] ⚠️ Pool existe pero sin liquidez`);
                        }
                    } catch (liquidityError) {
                        console.log(`[mtr-swap] ⚠️ Error verificando liquidez: ${liquidityError.message}`);
                        // Pool exists, assume it might have liquidity
                        return fee;
                    }
                }
            } catch (error) {
                console.log(`[mtr-swap] Fee tier ${fee} no disponible: ${error.message}`);
                // Continue to next fee tier
            }
        }

        return null; // No pool found with liquidity
    }

    /**
     * Load daily swap amount from database
     */
    async loadDailySwapAmount() {
        try {
            const today = new Date().toDateString();
            
            // Check if we need to reset (new day)
            if (this.lastResetDate !== today) {
                this.dailySwapAmount = 0;
                this.lastResetDate = today;
            }
            
            // Load from database if exists
            const { data } = await supabase
                .from('swap_logs')
                .select('amount_usdc')
                .gte('created_at', new Date().toISOString().split('T')[0])
                .eq('type', 'buy');
            
            if (data && data.length > 0) {
                this.dailySwapAmount = data.reduce((sum, log) => sum + parseFloat(log.amount_usdc || 0), 0);
            }
        } catch (error) {
            console.warn('[mtr-swap] Could not load daily swap amount:', error.message);
        }
    }

    /**
     * Check if we can perform swap (limits and safety checks)
     */
    async canSwap(amountUSDC) {
        if (!this.enabled) {
            return { allowed: false, reason: 'Service disabled' };
        }

        // Check minimum amount
        if (amountUSDC < MIN_SWAP_AMOUNT) {
            return { allowed: false, reason: `Amount too small (min: ${MIN_SWAP_AMOUNT} USDC)` };
        }

        // Check daily limit
        const today = new Date().toDateString();
        if (this.lastResetDate !== today) {
            this.dailySwapAmount = 0;
            this.lastResetDate = today;
        }

        if (this.dailySwapAmount + amountUSDC > MAX_DAILY_SWAP) {
            return { 
                allowed: false, 
                reason: `Daily limit exceeded (${this.dailySwapAmount.toFixed(2)}/${MAX_DAILY_SWAP} USDC)` 
            };
        }

        // Check USDC balance
        try {
            const balance = await this.publicClient.readContract({
                address: USDC_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [PLATFORM_WALLET]
            });
            
            const balanceFormatted = parseFloat(formatUnits(balance, 6));
            
            if (balanceFormatted < amountUSDC) {
                return { allowed: false, reason: `Insufficient USDC balance (${balanceFormatted.toFixed(2)} USDC)` };
            }
        } catch (error) {
            console.error('[mtr-swap] Error checking balance:', error);
            return { allowed: false, reason: 'Error checking balance' };
        }

        return { allowed: true };
    }

    /**
     * Get current MTR price from Uniswap (for estimation)
     */
    async getMTRPrice() {
        try {
            // This is a simplified version - in production, you'd query the pool directly
            // For now, we'll use a fallback or query from price-updater service
            // This is just for estimation - actual swap will use market price
            
            // Try to get from database (price-updater should update this)
            const { data } = await supabase
                .from('platform_settings')
                .select('mtr_usdc_price')
                .eq('key', 'mtr_usdc_price')
                .single();
            
            if (data && data.mtr_usdc_price) {
                return parseFloat(data.mtr_usdc_price);
            }
            
            // Fallback: estimate based on common pool (this is approximate)
            return 0.001; // Fallback price (should be updated by price-updater)
        } catch (error) {
            console.warn('[mtr-swap] Could not get MTR price, using fallback');
            return 0.001;
        }
    }

    /**
     * Auto-buy MTR when USDC deposit arrives
     * @param {number} depositAmountUSDC - Amount of USDC deposited
     * @param {string} depositTxHash - Transaction hash of the deposit
     * @returns {Promise<Object>} Swap result
     */
    async autoBuyMTR(depositAmountUSDC, depositTxHash) {
        if (!this.enabled) {
            console.log('[mtr-swap] Auto-swap disabled, skipping');
            return { success: false, reason: 'Service disabled' };
        }

        try {
            // Calculate swap amount (90% of deposit, keeping 10% as buffer)
            const swapAmountUSDC = depositAmountUSDC * SWAP_PERCENTAGE;
            
            // Check if we can swap
            const canSwapResult = await this.canSwap(swapAmountUSDC);
            if (!canSwapResult.allowed) {
                console.log(`[mtr-swap] Cannot swap: ${canSwapResult.reason}`);
                return { success: false, reason: canSwapResult.reason };
            }

            console.log(`[mtr-swap] 🔄 Auto-buying MTR: ${swapAmountUSDC.toFixed(2)} USDC`);

            // Estimate MTR output (for logging)
            const estimatedMTRPrice = await this.getMTRPrice();
            const estimatedMTR = swapAmountUSDC / estimatedMTRPrice;
            
            console.log(`[mtr-swap] Estimated MTR output: ~${estimatedMTR.toFixed(2)} MTR (price: ${estimatedMTRPrice})`);

            // Check allowance
            const allowance = await this.publicClient.readContract({
                address: USDC_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'allowance',
                args: [PLATFORM_WALLET, UNISWAP_V3_ROUTER]
            });

            const swapAmountWei = parseUnits(swapAmountUSDC.toFixed(6), 6);
            
            // Approve if needed
            if (allowance < swapAmountWei) {
                console.log('[mtr-swap] Approving USDC for swap...');
                const approveHash = await this.walletClient.writeContract({
                    address: USDC_ADDRESS,
                    abi: ERC20_ABI,
                    functionName: 'approve',
                    args: [UNISWAP_V3_ROUTER, swapAmountWei * 2n] // Approve 2x for safety
                });
                
                await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
                console.log('[mtr-swap] ✅ USDC approved');
            }

            // Calculate minimum output (with slippage tolerance)
            const minMTROutput = parseUnits(
                (estimatedMTR * (1 - SLIPPAGE_TOLERANCE)).toFixed(18), 
                18
            );

            // Execute swap using Uniswap V3
            // Path: USDC -> MTR
            // Fee tier: Detected automatically
            if (!this.poolFeeTier) {
                throw new Error('Pool fee tier not detected. Call init() first or pool does not exist.');
            }

            const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
            
            console.log(`[mtr-swap] Executing swap on Uniswap V3 with fee tier ${this.poolFeeTier}...`);
            
            const swapHash = await this.walletClient.writeContract({
                address: UNISWAP_V3_ROUTER,
                abi: UNISWAP_ROUTER_ABI,
                functionName: 'exactInputSingle',
                args: [{
                    tokenIn: USDC_ADDRESS,
                    tokenOut: MTR_TOKEN_ADDRESS,
                    fee: this.poolFeeTier, // Auto-detected fee tier
                    recipient: MTR_POOL_WALLET,
                    deadline: BigInt(deadline),
                    amountIn: swapAmountWei,
                    amountOutMinimum: minMTROutput,
                    sqrtPriceLimitX96: 0n
                }]
            });

            console.log(`[mtr-swap] Swap transaction sent: ${swapHash}`);
            
            // Wait for confirmation
            const receipt = await this.publicClient.waitForTransactionReceipt({ hash: swapHash });
            
            if (receipt.status !== 'success') {
                throw new Error('Swap transaction failed');
            }

            // Get actual MTR received (from event logs or balance change)
            const mtrBalanceBefore = await this.publicClient.readContract({
                address: MTR_TOKEN_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [MTR_POOL_WALLET]
            });

            // Note: In a real implementation, you'd parse the Swap event from logs
            // For now, we'll estimate based on balance change
            const actualMTRReceived = parseFloat(formatUnits(mtrBalanceBefore, 18));

            // Update daily swap amount
            this.dailySwapAmount += swapAmountUSDC;

            // Log swap to database
            await this.logSwap({
                type: 'buy',
                depositTxHash,
                amountUSDC: swapAmountUSDC,
                amountMTR: actualMTRReceived,
                txHash: swapHash,
                status: 'success'
            });

            console.log(`[mtr-swap] ✅ Successfully bought ${actualMTRReceived.toFixed(2)} MTR for ${swapAmountUSDC.toFixed(2)} USDC`);
            console.log(`[mtr-swap] Daily swap total: ${this.dailySwapAmount.toFixed(2)}/${MAX_DAILY_SWAP} USDC`);

            return {
                success: true,
                swapTxHash: swapHash,
                amountUSDC: swapAmountUSDC,
                amountMTR: actualMTRReceived,
                estimatedPrice: swapAmountUSDC / actualMTRReceived
            };

        } catch (error) {
            console.error('[mtr-swap] ❌ Error auto-buying MTR:', error);
            
            // Log failed swap
            await this.logSwap({
                type: 'buy',
                depositTxHash,
                amountUSDC: depositAmountUSDC * SWAP_PERCENTAGE,
                amountMTR: 0,
                txHash: null,
                status: 'failed',
                error: error.message
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Sell MTR when USDC buffer is insufficient for payouts
     * @param {number} requiredUSDC - Amount of USDC needed
     * @returns {Promise<Object>} Sell result
     */
    async sellMTRForUSDC(requiredUSDC) {
        if (!this.enabled) {
            return { success: false, reason: 'Service disabled' };
        }

        try {
            // Check current USDC balance
            const usdcBalance = await this.publicClient.readContract({
                address: USDC_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [PLATFORM_WALLET]
            });
            
            const usdcBalanceFormatted = parseFloat(formatUnits(usdcBalance, 6));
            
            // Only sell if we don't have enough USDC
            if (usdcBalanceFormatted >= requiredUSDC) {
                return { success: false, reason: 'Sufficient USDC balance, no need to sell' };
            }

            // Check MTR balance FIRST (before calculating)
            const mtrBalance = await this.publicClient.readContract({
                address: MTR_TOKEN_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [MTR_POOL_WALLET]
            });
            
            const mtrBalanceFormatted = parseFloat(formatUnits(mtrBalance, 18));
            
            // Early validation: If no MTR available, return immediately
            if (mtrBalanceFormatted === 0) {
                return { 
                    success: false, 
                    reason: 'No MTR available to sell. Waiting for USDC deposits to buy MTR first.' 
                };
            }

            // Calculate how much MTR to sell
            const mtrPrice = await this.getMTRPrice();
            const mtrToSell = (requiredUSDC - usdcBalanceFormatted) / mtrPrice * 1.1; // 10% buffer
            
            if (mtrBalanceFormatted < mtrToSell) {
                return { 
                    success: false, 
                    reason: `Insufficient MTR balance (${mtrBalanceFormatted.toFixed(2)} MTR, need ${mtrToSell.toFixed(2)})` 
                };
            }

            // 🛡️ TREASURY PROTECTION: Check if selling would violate reserve limit
            const protectionCheck = this.checkTreasuryProtection(mtrToSell, mtrBalanceFormatted);
            
            if (!protectionCheck.allowed) {
                console.warn(`[mtr-swap] 🛡️ Treasury protection triggered: ${protectionCheck.reason}`);
                
                // Try to sell only what's available (if any)
                if (protectionCheck.availableToSell && protectionCheck.availableToSell > 0) {
                    console.log(`[mtr-swap] ⚠️ Attempting partial sale: ${protectionCheck.availableToSell.toLocaleString()} MTR`);
                    // Recursively call with available amount (but limit recursion)
                    const partialRequiredUSDC = protectionCheck.availableToSell * mtrPrice;
                    if (partialRequiredUSDC >= requiredUSDC * 0.5) { // Only if we can get at least 50% of needed USDC
                        return await this.sellMTRForUSDC(partialRequiredUSDC);
                    } else {
                        return {
                            success: false,
                            reason: protectionCheck.reason + ' Partial sale would not provide sufficient USDC.'
                        };
                    }
                }
                
                return {
                    success: false,
                    reason: protectionCheck.reason
                };
            }

            console.log(`[mtr-swap] 💰 Selling ${mtrToSell.toFixed(2)} MTR for USDC...`);

            // Approve MTR if needed
            const mtrAllowance = await this.publicClient.readContract({
                address: MTR_TOKEN_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'allowance',
                args: [MTR_POOL_WALLET, UNISWAP_V3_ROUTER]
            });

            const mtrToSellWei = parseUnits(mtrToSell.toFixed(18), 18);
            
            if (mtrAllowance < mtrToSellWei) {
                // Note: This requires the MTR_POOL_WALLET to have the private key
                // Or we need to transfer MTR to swap wallet first
                console.log('[mtr-swap] ⚠️ Need to approve MTR - this requires pool wallet access');
                // For now, we'll skip if pool wallet is different
                if (MTR_POOL_WALLET.toLowerCase() !== this.account.address.toLowerCase()) {
                    return { success: false, reason: 'MTR pool wallet different from swap wallet - manual approval needed' };
                }
                
                const approveHash = await this.walletClient.writeContract({
                    address: MTR_TOKEN_ADDRESS,
                    abi: ERC20_ABI,
                    functionName: 'approve',
                    args: [UNISWAP_V3_ROUTER, mtrToSellWei * 2n]
                });
                
                await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
            }

            // Calculate minimum USDC output
            const minUSDCOutput = parseUnits(
                (requiredUSDC * (1 - SLIPPAGE_TOLERANCE)).toFixed(6),
                6
            );

            // Check if pool fee tier is detected
            if (!this.poolFeeTier) {
                throw new Error('Pool fee tier not detected. Call init() first or pool does not exist.');
            }

            const deadline = Math.floor(Date.now() / 1000) + 300;
            
            console.log(`[mtr-swap] Executing sell swap with fee tier ${this.poolFeeTier}...`);
            
            // Execute swap: MTR -> USDC
            const swapHash = await this.walletClient.writeContract({
                address: UNISWAP_V3_ROUTER,
                abi: UNISWAP_ROUTER_ABI,
                functionName: 'exactInputSingle',
                args: [{
                    tokenIn: MTR_TOKEN_ADDRESS,
                    tokenOut: USDC_ADDRESS,
                    fee: this.poolFeeTier, // Auto-detected fee tier
                    recipient: PLATFORM_WALLET,
                    deadline: BigInt(deadline),
                    amountIn: mtrToSellWei,
                    amountOutMinimum: minUSDCOutput,
                    sqrtPriceLimitX96: 0n
                }]
            });

            const receipt = await this.publicClient.waitForTransactionReceipt({ hash: swapHash });
            
            if (receipt.status !== 'success') {
                throw new Error('Sell transaction failed');
            }

            // Log sell
            await this.logSwap({
                type: 'sell',
                depositTxHash: null,
                amountUSDC: requiredUSDC,
                amountMTR: mtrToSell,
                txHash: swapHash,
                status: 'success'
            });

            console.log(`[mtr-swap] ✅ Sold ${mtrToSell.toFixed(2)} MTR for USDC`);

            return {
                success: true,
                swapTxHash: swapHash,
                amountMTR: mtrToSell,
                amountUSDC: requiredUSDC
            };

        } catch (error) {
            console.error('[mtr-swap] ❌ Error selling MTR:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Log swap to database
     */
    async logSwap({ type, depositTxHash, amountUSDC, amountMTR, txHash, status, error }) {
        try {
            await supabase.from('swap_logs').insert([{
                type, // 'buy' or 'sell'
                deposit_tx_hash: depositTxHash,
                amount_usdc: amountUSDC,
                amount_mtr: amountMTR,
                swap_tx_hash: txHash,
                status,
                error_message: error || null,
                created_at: new Date().toISOString()
            }]);
        } catch (err) {
            console.error('[mtr-swap] Error logging swap:', err);
        }
    }

    /**
     * Get current MTR pool balance
     */
    async getMTRPoolBalance() {
        try {
            const balance = await this.publicClient.readContract({
                address: MTR_TOKEN_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [MTR_POOL_WALLET]
            });
            
            return parseFloat(formatUnits(balance, 18));
        } catch (error) {
            console.error('[mtr-swap] Error getting MTR pool balance:', error);
            return 0;
        }
    }
}

module.exports = { MTRSwapService };
