/**
 * Automatic Price Updater Service
 * Fetches MTR/USDC price from Aerodrome pool every minute
 * Updates rate automatically if price changes significantly
 */

const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MTR_TOKEN_ADDRESS = process.env.MTR_TOKEN_ADDRESS || '0x99cd1eb32846c9027ed9cb8710066fa08791c33b';
const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Aerodrome pool address (example - replace with actual pool)
const AERODROME_POOL_ADDRESS = process.env.AERODROME_POOL_ADDRESS || '0x...'; // TODO: Get actual pool address

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Uniswap V2 Pair ABI (Aerodrome uses similar)
const PAIR_ABI = [
    {
        type: 'function',
        name: 'getReserves',
        stateMutability: 'view',
        inputs: [],
        outputs: [
            { name: 'reserve0', type: 'uint112' },
            { name: 'reserve1', type: 'uint112' },
            { name: 'blockTimestampLast', type: 'uint32' }
        ]
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
    }
];

class PriceUpdater {
    constructor() {
        this.publicClient = createPublicClient({
            chain: base,
            transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
        });
        this.updateInterval = 60 * 1000; // 1 minute
        this.rateChangeThreshold = 0.05; // 5% change triggers rate update
        this.currentPrice = null;
        this.currentRate = null;
    }

    /**
     * Initialize price updater
     */
    async init() {
        console.log('[price-updater] Initializing...');
        
        // Load current rate
        await this.loadCurrentRate();
        
        // Initial price fetch
        await this.updatePrice();
        
        // Start periodic updates
        this.startPeriodicUpdates();
        
        console.log('[price-updater] Initialized');
    }

    /**
     * Load current rate from database
     */
    async loadCurrentRate() {
        try {
            const { data } = await supabase
                .from('platform_settings')
                .select('mtr_to_credit_rate')
                .eq('key', 'mtr_to_credit_rate')
                .single();
            
            if (data?.mtr_to_credit_rate) {
                this.currentRate = parseFloat(data.mtr_to_credit_rate);
            } else {
                this.currentRate = parseFloat(process.env.MTR_TO_CREDIT_RATE || '778');
            }
        } catch (error) {
            this.currentRate = parseFloat(process.env.MTR_TO_CREDIT_RATE || '778');
        }
    }

    /**
     * Update MTR/USDC price from Aerodrome pool
     */
    async updatePrice() {
        try {
            // Method 1: Query Aerodrome pool reserves
            let price = await this.getPriceFromPool();
            
            // Method 2: Fallback to Chainlink or other oracle if pool fails
            if (!price || price <= 0) {
                price = await this.getPriceFromOracle();
            }

            if (!price || price <= 0) {
                console.warn('[price-updater] Could not fetch price, using cached value');
                return;
            }

            const previousPrice = this.currentPrice;
            this.currentPrice = price;

            // Update price in database
            await supabase
                .from('platform_settings')
                .upsert([{
                    key: 'mtr_usdc_price',
                    mtr_usdc_price: price,
                    updated_at: new Date().toISOString()
                }], {
                    onConflict: 'key'
                });

            console.log(`[price-updater] Price updated: ${price} USDC per MTR`);

            // Check if rate needs adjustment
            if (previousPrice) {
                const priceChange = Math.abs((price - previousPrice) / previousPrice);
                
                if (priceChange >= this.rateChangeThreshold) {
                    await this.adjustRate(price, previousPrice);
                }
            }

        } catch (error) {
            console.error('[price-updater] Error updating price:', error);
        }
    }

    /**
     * Get price from Aerodrome pool reserves
     */
    async getPriceFromPool() {
        try {
            if (!AERODROME_POOL_ADDRESS || AERODROME_POOL_ADDRESS === '0x...') {
                // Fallback: Use direct token balance comparison or DEX aggregator
                return await this.getPriceFromDEXAggregator();
            }

            const reserves = await this.publicClient.readContract({
                address: AERODROME_POOL_ADDRESS,
                abi: PAIR_ABI,
                functionName: 'getReserves'
            });

            const token0 = await this.publicClient.readContract({
                address: AERODROME_POOL_ADDRESS,
                abi: PAIR_ABI,
                functionName: 'token0'
            });

            const reserve0 = Number(reserves[0]);
            const reserve1 = Number(reserves[1]);

            // Determine which reserve is MTR and which is USDC
            const isMTRToken0 = token0.toLowerCase() === MTR_TOKEN_ADDRESS.toLowerCase();
            
            const mtrReserve = isMTRToken0 ? reserve0 : reserve1;
            const usdcReserve = isMTRToken0 ? reserve1 : reserve0;

            // Price = USDC reserve / MTR reserve (adjust for decimals)
            const price = (usdcReserve / 1e6) / (mtrReserve / 1e18);
            
            return price;
        } catch (error) {
            console.error('[price-updater] Error getting price from pool:', error);
            return null;
        }
    }

    /**
     * Get price from DEX aggregator API (fallback)
     */
    async getPriceFromDEXAggregator() {
        try {
            // Use 0x API or similar aggregator
            const response = await fetch(
                `https://api.0x.org/swap/v1/price?sellToken=${MTR_TOKEN_ADDRESS}&buyToken=${USDC_ADDRESS}&sellAmount=1000000000000000000`, // 1 MTR
                { headers: { '0x-api-key': process.env.ZEROX_API_KEY || '' } }
            );

            if (response.ok) {
                const data = await response.json();
                return parseFloat(data.price);
            }
        } catch (error) {
            console.error('[price-updater] Error getting price from aggregator:', error);
        }
        return null;
    }

    /**
     * Get price from Chainlink oracle (fallback)
     */
    async getPriceFromOracle() {
        // TODO: Implement Chainlink price feed if available
        return null;
    }

    /**
     * Adjust MTR to credit rate based on price change
     */
    async adjustRate(newPrice, oldPrice) {
        try {
            // Calculate new rate to maintain credit value stability
            // If MTR price increases, we need more MTR per credit to maintain value
            const priceRatio = newPrice / oldPrice;
            const newRate = this.currentRate * priceRatio;

            // Round to nearest integer
            const adjustedRate = Math.round(newRate);

            console.log(`[price-updater] Adjusting rate: ${this.currentRate} → ${adjustedRate} (price change: ${((priceRatio - 1) * 100).toFixed(2)}%)`);

            // Update rate in database
            await supabase
                .from('platform_settings')
                .upsert([{
                    key: 'mtr_to_credit_rate',
                    mtr_to_credit_rate: adjustedRate,
                    updated_at: new Date().toISOString()
                }], {
                    onConflict: 'key'
                });

            // Log rate change
            await supabase
                .from('rate_changes')
                .insert([{
                    old_rate: this.currentRate,
                    new_rate: adjustedRate,
                    old_price: oldPrice,
                    new_price: newPrice,
                    change_reason: 'automatic_price_adjustment',
                    created_at: new Date().toISOString()
                }]);

            this.currentRate = adjustedRate;

            console.log(`[price-updater] ✅ Rate adjusted to ${adjustedRate} MTR = 1 credit`);

        } catch (error) {
            console.error('[price-updater] Error adjusting rate:', error);
        }
    }

    /**
     * Start periodic price updates
     */
    startPeriodicUpdates() {
        setInterval(() => {
            this.updatePrice();
        }, this.updateInterval);
    }

    /**
     * Get current price (synchronous)
     */
    getCurrentPrice() {
        return this.currentPrice;
    }

    /**
     * Get current rate (synchronous)
     */
    getCurrentRate() {
        return this.currentRate;
    }
}

module.exports = { PriceUpdater };
