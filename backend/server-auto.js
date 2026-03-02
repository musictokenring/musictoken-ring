/**
 * Automated Backend Server
 * Handles all automatic processes: deposits, prices, claims
 * No manual intervention required
 */

const express = require('express');
const cors = require('cors');
const { DepositListener } = require('./deposit-listener');
const { PriceUpdater } = require('./price-updater');
const { ClaimService } = require('./claim-service');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Supabase client
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Initialize services
let depositListener;
let priceUpdater;
let claimService;

// Initialize all services
async function initializeServices() {
    try {
        console.log('[server] Initializing automated services...');

        // Initialize price updater first (needed by other services)
        priceUpdater = new PriceUpdater();
        await priceUpdater.init();

        // Initialize deposit listener
        depositListener = new DepositListener();
        await depositListener.init();

        // Initialize claim service
        claimService = new ClaimService();

        console.log('[server] ✅ All services initialized');
    } catch (error) {
        console.error('[server] Error initializing services:', error);
        process.exit(1);
    }
}

// ==========================================
// API ENDPOINTS
// ==========================================

/**
 * Get user credits balance
 */
app.get('/api/user/credits/:walletAddress', async (req, res) => {
    try {
        const walletAddress = req.params.walletAddress.toLowerCase();

        // Find user
        const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('wallet_address', walletAddress)
            .single();

        if (!user) {
            return res.json({
                credits: 0,
                usdcValue: 0,
                mtrPrice: priceUpdater.getCurrentPrice() || 0,
                userId: null
            });
        }

        // Get credits
        const { data: creditsData } = await supabase
            .from('user_credits')
            .select('credits')
            .eq('user_id', user.id)
            .single();

        const credits = creditsData?.credits || 0;

        // Calculate USDC value
        const mtrPrice = priceUpdater.getCurrentPrice() || 0;
        const rate = priceUpdater.getCurrentRate() || 778;
        const mtrEquivalent = credits * rate;
        const usdcValue = mtrEquivalent * mtrPrice;

        res.json({
            credits: Math.round(credits * 10000) / 10000, // 4 decimals
            usdcValue: Math.round(usdcValue * 100) / 100, // 2 decimals
            mtrPrice,
            rate,
            userId: user.id
        });
    } catch (error) {
        console.error('[server] Error getting credits:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Deduct credits (for betting)
 */
app.post('/api/user/deduct-credits', async (req, res) => {
    try {
        const { userId, credits } = req.body;

        if (!userId || !credits || credits <= 0) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }

        // Get current balance
        const { data: currentBalance } = await supabase
            .from('user_credits')
            .select('credits')
            .eq('user_id', userId)
            .single();

        if (!currentBalance || currentBalance.credits < credits) {
            return res.status(400).json({ error: 'Insufficient credits' });
        }

        // Deduct credits
        const { error: deductError } = await supabase.rpc('decrement_user_credits', {
            user_id_param: userId,
            credits_to_subtract: credits
        });

        if (deductError) {
            // Fallback: direct update
            const newBalance = currentBalance.credits - credits;
            await supabase
                .from('user_credits')
                .update({ credits: newBalance, updated_at: new Date().toISOString() })
                .eq('user_id', userId);
        }

        res.json({ success: true, creditsDeducted: credits });
    } catch (error) {
        console.error('[server] Error deducting credits:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Claim credits (convert to USDC)
 */
app.post('/api/claim', async (req, res) => {
    try {
        const { userId, credits, walletAddress } = req.body;

        if (!userId || !credits || !walletAddress) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        if (credits < 100) {
            return res.status(400).json({ error: 'Minimum claim: 100 credits' });
        }

        const result = await claimService.processClaim(userId, credits, walletAddress);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('[server] Error processing claim:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get current price and rate
 */
app.get('/api/price', async (req, res) => {
    try {
        res.json({
            mtrPrice: priceUpdater.getCurrentPrice(),
            rate: priceUpdater.getCurrentRate(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get deposit history
 */
app.get('/api/deposits/:walletAddress', async (req, res) => {
    try {
        const walletAddress = req.params.walletAddress.toLowerCase();

        const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('wallet_address', walletAddress)
            .single();

        if (!user) {
            return res.json({ deposits: [] });
        }

        const { data: deposits } = await supabase
            .from('deposits')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        res.json({ deposits: deposits || [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get claim history
 */
app.get('/api/claims/:walletAddress', async (req, res) => {
    try {
        const walletAddress = req.params.walletAddress.toLowerCase();

        const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('wallet_address', walletAddress)
            .single();

        if (!user) {
            return res.json({ claims: [] });
        }

        const { data: claims } = await supabase
            .from('claims')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        res.json({ claims: claims || [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        services: {
            depositListener: depositListener?.isListening || false,
            priceUpdater: priceUpdater ? true : false,
            claimService: claimService ? true : false
        },
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, async () => {
    console.log(`[server] Automated backend server running on port ${PORT}`);
    await initializeServices();
});

module.exports = app;
