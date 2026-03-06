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
const BASE_SWAP_ROUTER = '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86'; // BaseSwap Router (alternative)

// Swap configuration
const SWAP_PERCENTAGE = parseFloat(process.env.SWAP_PERCENTAGE || '0.90'); // 90% of deposit goes to MTR purchase
const MIN_SWAP_AMOUNT = parseFloat(process.env.MIN_SWAP_AMOUNT || '10'); // Minimum 10 USDC to trigger swap
const MAX_DAILY_SWAP = parseFloat(process.env.MAX_DAILY_SWAP || '10000'); // Max 10k USDC per day
const USDC_BUFFER_PERCENTAGE = parseFloat(process.env.USDC_BUFFER_PERCENTAGE || '0.20'); // Keep 20% USDC for immediate payouts
const SLIPPAGE_TOLERANCE = parseFloat(process.env.SLIPPAGE_TOLERANCE || '0.05'); // 5% slippage tolerance

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

class MTRSwapService {
    constructor() {
        if (!SWAP_WALLET_PRIVATE_KEY) {
            console.warn('[mtr-swap] ⚠️ SWAP_WALLET_PRIVATE_KEY not set, auto-swap disabled');
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
            this.loadDailySwapAmount();
            
            console.log('[mtr-swap] ✅ Service initialized');
            console.log(`[mtr-swap] Swap wallet: ${this.account.address}`);
            console.log(`[mtr-swap] MTR pool wallet: ${MTR_POOL_WALLET}`);
        } catch (error) {
            console.error('[mtr-swap] ❌ Error initializing service:', error);
            this.enabled = false;
        }
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
            // Fee tier: 0.05% (500) - common for stablecoin pairs
            const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
            
            console.log('[mtr-swap] Executing swap on Uniswap V3...');
            
            const swapHash = await this.walletClient.writeContract({
                address: UNISWAP_V3_ROUTER,
                abi: UNISWAP_ROUTER_ABI,
                functionName: 'exactInputSingle',
                args: [{
                    tokenIn: USDC_ADDRESS,
                    tokenOut: MTR_TOKEN_ADDRESS,
                    fee: 500, // 0.05% fee tier
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

            // Calculate how much MTR to sell
            const mtrPrice = await this.getMTRPrice();
            const mtrToSell = (requiredUSDC - usdcBalanceFormatted) / mtrPrice * 1.1; // 10% buffer

            // Check MTR balance
            const mtrBalance = await this.publicClient.readContract({
                address: MTR_TOKEN_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [MTR_POOL_WALLET]
            });
            
            const mtrBalanceFormatted = parseFloat(formatUnits(mtrBalance, 18));
            
            if (mtrBalanceFormatted < mtrToSell) {
                return { 
                    success: false, 
                    reason: `Insufficient MTR balance (${mtrBalanceFormatted.toFixed(2)} MTR, need ${mtrToSell.toFixed(2)})` 
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

            const deadline = Math.floor(Date.now() / 1000) + 300;
            
            // Execute swap: MTR -> USDC
            const swapHash = await this.walletClient.writeContract({
                address: UNISWAP_V3_ROUTER,
                abi: UNISWAP_ROUTER_ABI,
                functionName: 'exactInputSingle',
                args: [{
                    tokenIn: MTR_TOKEN_ADDRESS,
                    tokenOut: USDC_ADDRESS,
                    fee: 500,
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
