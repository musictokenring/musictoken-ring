/**
 * Liquidity Manager Service
 * Buffer en USDC (Base) y pool MTR; vende MTR si falta liquidez nominal para pagos
 */

const { createPublicClient, http, formatUnits } = require('viem');
const { base } = require('viem/chains');
const { createClient } = require('@supabase/supabase-js');
const { MTRSwapService } = require('./mtr-swap-service');

// Configuration
const { resolveEvmPlatformWallet } = require('./platform-addresses');
const PLATFORM_WALLET = resolveEvmPlatformWallet();
const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const MTR_TOKEN_ADDRESS = process.env.MTR_TOKEN_ADDRESS || '0x99cd1eb32846c9027ed9cb8710066fa08791c33b';
const MTR_POOL_WALLET = process.env.MTR_POOL_WALLET || PLATFORM_WALLET;

const MIN_USDC_BUFFER = parseFloat(process.env.MIN_USDC_BUFFER || '1000'); // mín. buffer USD nominal (token USDC Base)
const TARGET_USDC_BUFFER = parseFloat(process.env.TARGET_USDC_BUFFER || '5000'); // objetivo buffer USD nominal
const CHECK_INTERVAL = parseInt(process.env.LIQUIDITY_CHECK_INTERVAL || '300000'); // Check every 5 minutes

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ERC20 ABI
const ERC20_ABI = [
    {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
    }
];

class LiquidityManager {
    constructor() {
        this.publicClient = createPublicClient({
            chain: base,
            transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
        });
        
        this.swapService = new MTRSwapService();
        this.checkInterval = null;
        this.isChecking = false;
    }

    /**
     * Initialize liquidity manager
     */
    async init() {
        console.log('[liquidity-manager] Initializing...');
        console.log(`[liquidity-manager] Min buffer: ${MIN_USDC_BUFFER} USD nominal (USDC)`);
        console.log(`[liquidity-manager] Target buffer: ${TARGET_USDC_BUFFER} USD nominal (USDC)`);
        
        // Initialize swap service (detects pool fee tier)
        if (this.swapService && this.swapService.enabled) {
            await this.swapService.init();
        }
        
        // Start periodic checks
        this.startPeriodicChecks();
        
        // Do initial check
        await this.checkAndMaintainLiquidity();
        
        console.log('[liquidity-manager] ✅ Initialized');
    }

    /**
     * Start periodic liquidity checks
     */
    startPeriodicChecks() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        
        this.checkInterval = setInterval(async () => {
            if (!this.isChecking) {
                await this.checkAndMaintainLiquidity();
            }
        }, CHECK_INTERVAL);
        
        console.log(`[liquidity-manager] Periodic checks started (every ${CHECK_INTERVAL / 1000}s)`);
    }

    /**
     * Check liquidity and maintain buffer
     */
    async checkAndMaintainLiquidity() {
        if (this.isChecking) {
            return;
        }
        
        this.isChecking = true;
        
        try {
            const balances = await this.getBalances();
            
            console.log('[liquidity-manager] Current balances:', {
                usdc: balances.usdc.toFixed(2),
                mtr: balances.mtr.toFixed(2),
                minBuffer: MIN_USDC_BUFFER,
                targetBuffer: TARGET_USDC_BUFFER
            });
            
            // Buffer USDC (Base) bajo mínimo
            if (balances.usdc < MIN_USDC_BUFFER) {
                console.log(`[liquidity-manager] ⚠️ Buffer bajo (${balances.usdc.toFixed(2)} < ${MIN_USDC_BUFFER} USD nominal)`);
                
                const usdcNeeded = TARGET_USDC_BUFFER - balances.usdc;
                
                if (balances.mtr > 0) {
                    console.log(`[liquidity-manager] Selling MTR to replenish buffer (USDC)...`);
                    const sellResult = await this.swapService.sellMTRForUSDC(usdcNeeded);
                    
                    if (sellResult.success) {
                        console.log(`[liquidity-manager] ✅ Sold MTR, replenished buffer`);
                    } else {
                        console.log(`[liquidity-manager] ⚠️ Could not sell MTR: ${sellResult.reason || sellResult.error}`);
                    }
                } else {
                    console.log(`[liquidity-manager] ⚠️ No MTR available to sell`);
                }
            } else if (balances.usdc < TARGET_USDC_BUFFER) {
                // Buffer is OK but below target - optional: sell some MTR to reach target
                console.log(`[liquidity-manager] Buffer below target, above minimum (OK)`);
            } else {
                console.log(`[liquidity-manager] ✅ Buffer OK`);
            }
            
        } catch (error) {
            console.error('[liquidity-manager] Error checking liquidity:', error);
        } finally {
            this.isChecking = false;
        }
    }

    /**
     * Get current balances
     */
    async getBalances() {
        try {
            if (!PLATFORM_WALLET || !MTR_POOL_WALLET) {
                return { usdc: 0, mtr: 0 };
            }
            const [usdcBalance, mtrBalance] = await Promise.all([
                this.publicClient.readContract({
                    address: USDC_ADDRESS,
                    abi: ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [PLATFORM_WALLET]
                }),
                this.publicClient.readContract({
                    address: MTR_TOKEN_ADDRESS,
                    abi: ERC20_ABI,
                    functionName: 'balanceOf',
                    args: [MTR_POOL_WALLET]
                })
            ]);
            
            return {
                usdc: parseFloat(formatUnits(usdcBalance, 6)),
                mtr: parseFloat(formatUnits(mtrBalance, 18))
            };
        } catch (error) {
            console.error('[liquidity-manager] Error getting balances:', error);
            return { usdc: 0, mtr: 0 };
        }
    }

    /**
     * Verificar liquidez USDC (Base) para un pago
     * If not, try to sell MTR first
     */
    async ensureUSDCForPayout(requiredUSDC) {
        try {
            const balances = await this.getBalances();
            
            if (balances.usdc >= requiredUSDC) {
                return { success: true, reason: 'Sufficient USDC (Base) balance' };
            }
            
            console.log(`[liquidity-manager] ⚠️ Insufficient liquidity for payout (${balances.usdc.toFixed(2)} < ${requiredUSDC.toFixed(2)} USD nominal)`);
            
            // Try to sell MTR
            if (balances.mtr > 0) {
                const sellResult = await this.swapService.sellMTRForUSDC(requiredUSDC);
                
                if (sellResult.success) {
                    // Verify we now have enough
                    const newBalances = await this.getBalances();
                    if (newBalances.usdc >= requiredUSDC) {
                        return { success: true, reason: 'Sold MTR to cover payout' };
                    } else {
                        return { success: false, reason: 'Sold MTR but still insufficient' };
                    }
                } else {
                    return { success: false, reason: sellResult.reason || sellResult.error };
                }
            } else {
                return { success: false, reason: 'No MTR available to sell' };
            }
        } catch (error) {
            console.error('[liquidity-manager] Error ensuring payout liquidity:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * Stop periodic checks
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        console.log('[liquidity-manager] Stopped');
    }
}

module.exports = { LiquidityManager };
