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
const { VaultService } = require('./vault-service');
const { DepositSyncService } = require('./deposit-sync-service');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - CORS configuration
const corsOptions = {
    origin: [
        'https://www.musictokenring.xyz',
        'https://musictokenring.xyz',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:5500',
        'http://127.0.0.1:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json());

// Handle preflight requests
app.options('*', cors(corsOptions));

// Supabase client
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Initialize services
let depositListener;
let priceUpdater;
let claimService;
let vaultService;
let depositSyncService;

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

        // Initialize vault service
        vaultService = new VaultService();

        // Initialize deposit sync service (backup mechanism)
        depositSyncService = new DepositSyncService();
        await depositSyncService.init();

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

        // NUEVO: 1 crédito = 1 USDC fijo siempre
        const usdcValue = credits; // 1:1 fijo

        res.json({
            credits: Math.round(credits * 10000) / 10000, // 4 decimals
            usdcValue: Math.round(usdcValue * 100) / 100, // 2 decimals (igual a créditos)
            mtrPrice: null, // Ya no relevante
            rate: null, // Ya no se usa
            userId: user.id,
            note: '1 crédito = 1 USDC fijo'
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

        const MIN_CLAIM_AMOUNT = 5; // Mínimo para reclamar (mismo que apuesta mínima)
        if (credits < MIN_CLAIM_AMOUNT) {
            return res.status(400).json({ error: `Minimum claim: ${MIN_CLAIM_AMOUNT} credits` });
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
 * Auto-sync deposits for a wallet (called by frontend periodically)
 */
app.post('/api/deposits/auto-sync/:walletAddress', async (req, res) => {
    try {
        const walletAddress = req.params.walletAddress.toLowerCase();

        if (!depositSyncService) {
            return res.status(503).json({ error: 'Deposit sync service not available' });
        }

        // Trigger sync
        await depositSyncService.manualSync();

        // Check user's recent deposits
        const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('wallet_address', walletAddress)
            .single();

        if (user) {
            const { data: recentDeposits } = await supabase
                .from('deposits')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(5);

            return res.json({
                success: true,
                syncCompleted: true,
                recentDeposits: recentDeposits || []
            });
        }

        res.json({ success: true, syncCompleted: true });
    } catch (error) {
        console.error('[server] Error in auto-sync:', error);
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
 * Diagnose a deposit transaction
 */
app.get('/api/deposits/diagnose/:txHash', async (req, res) => {
    try {
        const txHash = req.params.txHash;
        
        // Validar formato del hash
        if (!txHash || !txHash.startsWith('0x') || txHash.length !== 66) {
            return res.status(400).json({ 
                error: 'Invalid transaction hash format',
                message: 'El hash de transacción debe tener 66 caracteres y comenzar con 0x'
            });
        }
        
        const { createPublicClient, http, formatUnits } = require('viem');
        const { base } = require('viem/chains');

        const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS || '0x75376BC58830f27415402875D26B73A6BE8E2253';
        const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

        const publicClient = createPublicClient({
            chain: base,
            transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
        });

        // Get transaction receipt
        let receipt;
        try {
            receipt = await publicClient.getTransactionReceipt({ hash: txHash });
        } catch (rpcError) {
            console.error('[diagnose] Error fetching receipt:', rpcError);
            if (rpcError.message && rpcError.message.includes('not found')) {
                return res.status(404).json({ 
                    error: 'Transaction not found',
                    message: 'La transacción no se encontró en la red Base. Verifica el hash.'
                });
            }
            return res.status(500).json({ 
                error: 'RPC Error',
                message: 'Error al consultar la blockchain: ' + (rpcError.message || 'Error desconocido')
            });
        }

        if (!receipt) {
            return res.status(404).json({ 
                error: 'Transaction not found',
                message: 'La transacción no existe o aún no ha sido confirmada.'
            });
        }

        if (receipt.status !== 'success') {
            return res.status(400).json({ 
                error: 'Transaction failed', 
                status: receipt.status,
                message: 'Esta transacción falló en la blockchain y no puede ser procesada como depósito.'
            });
        }

        // Check if already processed
        let existingDeposit;
        try {
            const { data, error } = await supabase
                .from('deposits')
                .select('*')
                .eq('tx_hash', txHash)
                .single();
            
            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                console.error('[diagnose] Error checking existing deposit:', error);
                throw error;
            }
            
            existingDeposit = data;
        } catch (dbError) {
            console.error('[diagnose] Database error:', dbError);
            return res.status(500).json({ 
                error: 'Database error',
                message: 'Error al consultar la base de datos: ' + (dbError.message || 'Error desconocido')
            });
        }

        if (existingDeposit) {
            return res.json({
                processed: true,
                deposit: existingDeposit,
                message: 'Deposit already processed'
            });
        }

        // Decode Transfer events
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

        const transferLogs = receipt.logs.filter(log => 
            log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()
        );

        const transfers = [];
        for (const log of transferLogs) {
            try {
                const decoded = await publicClient.decodeEventLog({
                    abi: ERC20_TRANSFER_ABI,
                    data: log.data,
                    topics: log.topics
                });

                const from = decoded.args.from;
                const to = decoded.args.to;
                const value = decoded.args.value;
                const amount = parseFloat(formatUnits(value, 6));

                if (to.toLowerCase() === PLATFORM_WALLET.toLowerCase()) {
                    transfers.push({
                        from,
                        to,
                        amount,
                        isPlatformDeposit: true
                    });
                }
            } catch (e) {
                // Skip invalid logs
            }
        }

        if (transfers.length === 0) {
            return res.status(400).json({ 
                error: 'No USDC transfer to platform wallet found in this transaction' 
            });
        }

        const depositTransfer = transfers[0];
        const DEPOSIT_FEE_RATE = 0.05;
        const depositFee = depositTransfer.amount * DEPOSIT_FEE_RATE;
        const credits = depositTransfer.amount - depositFee;

        // Check user
        const { data: user } = await supabase
            .from('users')
            .select('id, wallet_address')
            .eq('wallet_address', depositTransfer.from.toLowerCase())
            .single();

        res.json({
            processed: false,
            transaction: {
                hash: txHash,
                status: receipt.status,
                blockNumber: receipt.blockNumber.toString()
            },
            transfer: {
                from: depositTransfer.from,
                to: depositTransfer.to,
                amount: depositTransfer.amount,
                credits: Math.round(credits * 10000) / 10000,
                fee: depositFee
            },
            user: user ? {
                id: user.id,
                wallet_address: user.wallet_address
            } : null,
            canProcess: true
        });

    } catch (error) {
        console.error('[diagnose] Unexpected error:', error);
        console.error('[diagnose] Error stack:', error.stack);
        res.status(500).json({ 
            error: 'Internal server error', 
            message: error.message || 'Error inesperado al procesar la solicitud',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * Trigger manual deposit sync
 */
app.post('/api/deposits/sync', async (req, res) => {
    try {
        if (!depositSyncService) {
            return res.status(503).json({ error: 'Deposit sync service not initialized' });
        }

        const result = await depositSyncService.manualSync();
        res.json(result);
    } catch (error) {
        console.error('[server] Error in manual sync:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Sync specific transaction
 */
app.post('/api/deposits/sync-transaction', async (req, res) => {
    try {
        const { txHash } = req.body;

        if (!txHash) {
            return res.status(400).json({ error: 'txHash required' });
        }

        if (!depositSyncService) {
            return res.status(503).json({ error: 'Deposit sync service not initialized' });
        }

        const result = await depositSyncService.syncTransaction(txHash);
        res.json(result);
    } catch (error) {
        console.error('[server] Error syncing transaction:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Manually process a deposit
 */
app.post('/api/deposits/process', async (req, res) => {
    try {
        const { txHash, walletAddress } = req.body;

        if (!txHash || !walletAddress) {
            return res.status(400).json({ error: 'txHash and walletAddress required' });
        }

        // Verify transaction first
        const { createPublicClient, http, formatUnits } = require('viem');
        const { base } = require('viem/chains');
        
        const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS || '0x75376BC58830f27415402875D26B73A6BE8E2253';
        const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
        
        const publicClient = createPublicClient({
            chain: base,
            transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
        });

        // PROTECCIÓN CRÍTICA: Verificar si ya está procesado ANTES de procesar
        const { data: existing, error: checkError } = await supabase
            .from('deposits')
            .select('id, user_id, credits_awarded, status, processed_at')
            .eq('tx_hash', txHash)
            .single();

        if (existing) {
            console.log(`[server] ⚠️ INTENTO DE PROCESAR DEPÓSITO DUPLICADO RECHAZADO:`, {
                txHash,
                existingId: existing.id,
                userId: existing.user_id,
                creditsAlreadyAwarded: existing.credits_awarded
            });
            return res.status(400).json({ 
                error: 'Deposit already processed',
                deposit: existing,
                message: 'Esta transacción ya fue procesada y acreditada anteriormente'
            });
        }

        // Si hay error de consulta, no procesar por seguridad
        if (checkError && checkError.code !== 'PGRST116') {
            console.error('[server] Error checking for existing deposit:', checkError);
            return res.status(500).json({ error: 'Error verificando depósito existente' });
        }

        // Get receipt and decode transfer
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
        
        if (receipt.status !== 'success') {
            return res.status(400).json({ error: 'Transaction failed' });
        }

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

        let transferEvent = null;
        for (const log of receipt.logs) {
            if (log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
                try {
                    const decoded = await publicClient.decodeEventLog({
                        abi: ERC20_TRANSFER_ABI,
                        data: log.data,
                        topics: log.topics
                    });

                    if (decoded.args.to.toLowerCase() === PLATFORM_WALLET.toLowerCase()) {
                        transferEvent = decoded;
                        break;
                    }
                } catch (e) {
                    // Continue
                }
            }
        }

        if (!transferEvent) {
            return res.status(400).json({ error: 'No USDC transfer to platform wallet found' });
        }

        // Verify wallet matches
        if (transferEvent.args.from.toLowerCase() !== walletAddress.toLowerCase()) {
            return res.status(400).json({ 
                error: 'Wallet address mismatch',
                expected: walletAddress,
                found: transferEvent.args.from
            });
        }

        // Process using DepositListener
        const { DepositListener } = require('./deposit-listener');
        const depositListener = new DepositListener();
        await depositListener.init();

        const mockEvent = {
            transactionHash: txHash,
            args: {
                from: transferEvent.args.from,
                to: transferEvent.args.to,
                value: transferEvent.args.value
            }
        };

        await depositListener.processDeposit(mockEvent, 'USDC', USDC_ADDRESS);

        // Get result
        const { data: newDeposit } = await supabase
            .from('deposits')
            .select('*')
            .eq('tx_hash', txHash)
            .single();

        if (!newDeposit) {
            return res.status(500).json({ error: 'Deposit processing failed' });
        }

        res.json({
            success: true,
            deposit: newDeposit,
            message: 'Deposit processed successfully'
        });

    } catch (error) {
        console.error('[server] Error processing deposit:', error);
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
 * Add credits (for wins)
 */
app.post('/api/user/add-credits', async (req, res) => {
    try {
        const { userId, credits, reason, matchId } = req.body;

        if (!userId || !credits || credits <= 0) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }

        // Add credits using RPC function
        const { error: addError } = await supabase.rpc('increment_user_credits', {
            user_id_param: userId,
            credits_to_add: credits
        });

        if (addError) {
            // Fallback: direct update
            const { data: currentBalance } = await supabase
                .from('user_credits')
                .select('credits')
                .eq('user_id', userId)
                .single();

            const newBalance = (currentBalance?.credits || 0) + credits;

            await supabase
                .from('user_credits')
                .update({ credits: newBalance, updated_at: new Date().toISOString() })
                .eq('user_id', userId);
        }

        res.json({ success: true, creditsAdded: credits });
    } catch (error) {
        console.error('[server] Error adding credits:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Vault endpoints
 */

/**
 * Get vault balance
 */
app.get('/api/vault/balance', async (req, res) => {
    try {
        if (!vaultService) {
            console.error('[server] Vault service not initialized');
            return res.status(503).json({ 
                error: 'Vault service not initialized',
                message: 'El servicio del vault no está disponible. Verifica que las variables de entorno estén configuradas.'
            });
        }

        const balance = await vaultService.getVaultBalance();
        const stats = await vaultService.getVaultStats();

        res.json({
            balance: balance,
            stats: stats,
            vaultAddress: process.env.VAULT_WALLET_ADDRESS || process.env.ADMIN_WALLET_ADDRESS,
            baseScanUrl: process.env.VAULT_WALLET_ADDRESS
                ? `https://basescan.org/address/${process.env.VAULT_WALLET_ADDRESS}`
                : null
        });
    } catch (error) {
        console.error('[server] Error getting vault balance:', error);
        console.error('[server] Error stack:', error.stack);
        res.status(500).json({ 
            error: error.message,
            details: 'Error al obtener balance del vault. Verifica que la migración SQL se haya ejecutado correctamente.'
        });
    }
});

/**
 * Add fee to vault
 */
app.post('/api/vault/add-fee', async (req, res) => {
    try {
        const { feeType, amount, matchId, source } = req.body;

        if (!feeType || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }

        if (!['deposit', 'bet', 'withdrawal'].includes(feeType)) {
            return res.status(400).json({ error: 'Invalid fee type' });
        }

        if (!vaultService) {
            return res.status(503).json({ error: 'Vault service not initialized' });
        }

        const result = await vaultService.addFee(amount, feeType, null, matchId);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('[server] Error adding fee to vault:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get vault statistics
 */
app.get('/api/vault/stats', async (req, res) => {
    try {
        if (!vaultService) {
            return res.status(503).json({ error: 'Vault service not initialized' });
        }

        const stats = await vaultService.getVaultStats();

        res.json(stats);
    } catch (error) {
        console.error('[server] Error getting vault stats:', error);
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
            claimService: claimService ? true : false,
            vaultService: vaultService ? true : false
        },
        timestamp: new Date().toISOString(),
        cors: 'enabled'
    });
});

/**
 * Root endpoint - helps verify server is running
 */
app.get('/', (req, res) => {
    res.json({
        message: 'MusicToken Ring Backend API',
        version: '2.0',
        endpoints: {
            health: '/api/health',
            vaultBalance: '/api/vault/balance',
            userCredits: '/api/user/credits/:walletAddress',
            deposits: '/api/deposits/:walletAddress',
            claims: '/api/claims/:walletAddress',
            price: '/api/price'
        }
    });
});

/**
 * 404 handler for API routes
 */
app.use('/api/*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        path: req.path,
        method: req.method,
        message: 'El endpoint solicitado no existe. Verifica la URL.'
    });
});

// Start server
app.listen(PORT, async () => {
    console.log(`[server] Automated backend server running on port ${PORT}`);
    await initializeServices();
});

module.exports = app;
