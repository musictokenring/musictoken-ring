/**
 * Automated Backend Server
 * Handles all automatic processes: deposits, prices, claims
 * No manual intervention required
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { DepositListener } = require('./deposit-listener');
const { MultiChainDepositListener } = require('./multi-chain-deposit-listener');
const { PriceUpdater } = require('./price-updater');
const { ClaimService } = require('./claim-service');
const { VaultService } = require('./vault-service');
const { DepositSyncService } = require('./deposit-sync-service');
const { LiquidityManager } = require('./liquidity-manager');
const { WalletLinkService } = require('./wallet-link-service');
const { TradingFundService } = require('./trading-fund-service');
const { NOWPaymentsService } = require('./nowpayments-service');
const { MoonPayService } = require('./moonpay-service');
const { MercadoPagoService } = require('./mercadopago-service');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;

// 🔒 SEGURIDAD: Rate limiting para endpoints críticos
const claimRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máximo 5 requests por ventana de tiempo
    message: {
        error: 'Too many claim requests',
        message: 'Por favor espera antes de hacer otra solicitud de retiro. Máximo 5 requests cada 15 minutos.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skipSuccessfulRequests: false, // Count successful requests too
    skipFailedRequests: false, // Count failed requests
});

// Rate limiter más estricto para endpoints de depósito
const depositRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 10, // máximo 10 requests por minuto
    message: {
        error: 'Too many deposit requests',
        message: 'Por favor espera antes de hacer otra solicitud. Máximo 10 requests por minuto.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Wallet-Address']
};

app.use(cors(corsOptions));
app.use(express.json());

// Middleware para webhook de NOWPayments (necesita raw body)
app.use('/webhook/nowpayments', express.raw({ type: 'application/json' }));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Supabase client
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Initialize services
let depositListener;
let multiChainDepositListener;
let priceUpdater;
let claimService;
let vaultService;
let depositSyncService;
let liquidityManager;
let walletLinkService;
let tradingFundService;
let nowPaymentsService;
let moonPayService;
let mercadoPagoService;

// 🔒 SEGURIDAD: Validar variables de entorno críticas
function validateEnvironmentVariables() {
    console.log('[server] 🔒 Validating environment variables...');
    
    const required = [
        'ADMIN_WALLET_PRIVATE_KEY',
        'PLATFORM_WALLET_ADDRESS',
        'SUPABASE_SERVICE_ROLE_KEY'
    ];
    
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        const error = `❌ Missing required environment variables: ${missing.join(', ')}`;
        console.error(`[SECURITY] ${error}`);
        console.error(`[SECURITY] ⚠️ Server will start but some features may not work`);
        // No lanzar error - permitir que el servidor inicie para diagnóstico
        // Los servicios individuales manejarán sus propios errores
        return false;
    }
    
    // Validar formato de direcciones
    const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS;
    if (!PLATFORM_WALLET || !/^0x[a-fA-F0-9]{40}$/.test(PLATFORM_WALLET)) {
        const error = `❌ Invalid PLATFORM_WALLET_ADDRESS format: ${PLATFORM_WALLET || 'undefined'}`;
        console.error(`[SECURITY] ${error}`);
        console.error(`[SECURITY] ⚠️ Server will start but wallet operations may fail`);
        return false;
    }
    
    // Validar que las wallets no sean la misma (si están configuradas)
    if (process.env.VAULT_WALLET_ADDRESS) {
        if (process.env.VAULT_WALLET_ADDRESS.toLowerCase() === PLATFORM_WALLET.toLowerCase()) {
            console.warn('[SECURITY] ⚠️ WARNING: VAULT_WALLET_ADDRESS is the same as PLATFORM_WALLET_ADDRESS');
            console.warn('[SECURITY] ⚠️ This is not recommended for security. Consider using separate wallets.');
        }
    }
    
    // Validar formato de private keys (deben empezar con 0x y tener 66 caracteres)
    const ADMIN_KEY = process.env.ADMIN_WALLET_PRIVATE_KEY;
    if (ADMIN_KEY && !ADMIN_KEY.startsWith('0x') && ADMIN_KEY.length !== 64 && ADMIN_KEY.length !== 66) {
        console.warn('[SECURITY] ⚠️ WARNING: ADMIN_WALLET_PRIVATE_KEY format may be incorrect');
    }
    
    console.log('[server] ✅ Environment variables validated');
    console.log(`[server] 🔒 Platform Wallet: ${PLATFORM_WALLET}`);
    console.log(`[server] 🔒 Vault Wallet: ${process.env.VAULT_WALLET_ADDRESS || 'Not configured (using platform wallet)'}`);
    return true;
}

// Initialize all services
async function initializeServices() {
    try {
        // 🔒 SEGURIDAD: Validar variables de entorno antes de inicializar servicios
        const envValid = validateEnvironmentVariables();
        if (!envValid) {
            console.warn('[server] ⚠️ Environment variables validation failed, but continuing initialization...');
            console.warn('[server] ⚠️ Some services may not work correctly. Check your environment variables in Render.');
        }
        
        console.log('[server] Initializing automated services...');

        // Initialize price updater first (needed by other services)
        priceUpdater = new PriceUpdater();
        await priceUpdater.init();

        // Initialize deposit listener (Base network - legacy, keep for compatibility)
        depositListener = new DepositListener();
        await depositListener.init();

        // Initialize multi-chain deposit listener (all networks)
        // Wrap in try-catch to prevent server crash if initialization fails
        try {
            multiChainDepositListener = new MultiChainDepositListener();
            await multiChainDepositListener.init();
        } catch (multiChainError) {
            console.error('[server] ⚠️ Error initializing multi-chain listener:', multiChainError);
            console.error('[server] Stack:', multiChainError.stack);
            console.log('[server] Continuing with Base-only listener...');
            // Server continues with Base listener only
        }

        // Initialize claim service (puede fallar si ADMIN_WALLET_PRIVATE_KEY no está configurado)
        try {
            claimService = new ClaimService();
            console.log('[server] ✅ Claim service initialized');
        } catch (claimError) {
            console.error('[server] ⚠️ Error initializing claim service:', claimError.message);
            console.error('[server] ⚠️ Claim service requires ADMIN_WALLET_PRIVATE_KEY to be set');
            console.log('[server] Continuing without claim service...');
            // No fallar - el servicio se puede inicializar más tarde cuando se configure
            claimService = null;
        }

        // Initialize vault service (no requiere init(), se inicializa en constructor)
        try {
            vaultService = new VaultService();
            console.log('[server] ✅ Vault service initialized');
        } catch (vaultError) {
            console.error('[server] ⚠️ Error initializing vault service:', vaultError);
            console.log('[server] Vault service will be initialized on-demand');
            // No fallar - el servicio se puede inicializar bajo demanda
        }

        // Initialize deposit sync service (backup mechanism)
        depositSyncService = new DepositSyncService();
        await depositSyncService.init();

        // Initialize liquidity manager (manages USDC buffer and MTR pool)
        try {
            console.log('[server] 🔄 Initializing liquidity manager...');
            console.log('[server] SWAP_WALLET_PRIVATE_KEY configured:', !!process.env.SWAP_WALLET_PRIVATE_KEY);
            liquidityManager = new LiquidityManager();
            await liquidityManager.init();
            console.log('[server] ✅ Liquidity manager initialized');
        } catch (liquidityError) {
            console.error('[server] ⚠️ Error initializing liquidity manager:', liquidityError);
            console.error('[server] Error stack:', liquidityError.stack);
            console.log('[server] Continuing without liquidity manager...');
            // Non-critical - continue without it
        }

        // Initialize Wallet Link Service
        try {
            walletLinkService = new WalletLinkService();
            console.log('[server] ✅ Wallet Link Service initialized');
        } catch (walletLinkError) {
            console.error('[server] ⚠️ Error initializing wallet link service:', walletLinkError);
            console.log('[server] Continuing without wallet link service...');
            // Non-critical - continue without it
        }

        // Initialize Trading Fund Service (for fee distribution)
        try {
            tradingFundService = new TradingFundService();
            nowPaymentsService = new NOWPaymentsService();
            moonPayService = new MoonPayService();
            mercadoPagoService = new MercadoPagoService();
            console.log('[server] ✅ Trading Fund Service initialized');
        } catch (tradingFundError) {
            console.error('[server] ⚠️ Error initializing trading fund service:', tradingFundError);
            console.log('[server] Continuing without trading fund service (fees will go to vault only)...');
            // Non-critical - continue without it, fees will go to vault only
        }

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

        // Find user (standard flow - works for both PC and mobile)
        let { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('wallet_address', walletAddress)
            .single();
        
        // 🔗 NUEVO: Try wallet link as fallback (MOBILE ONLY - for internal wallet browsers)
        // This is detected by checking if user-agent indicates mobile device
        const userAgent = req.headers['user-agent'] || '';
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
        
        if ((!user || (userError && userError.code === 'PGRST116')) && isMobile && walletLinkService) {
            console.log('[server] [MOBILE] User not found in users table, checking wallet link...');
            const userIdFromLink = await walletLinkService.getUserIdFromWallet(walletAddress);
            if (userIdFromLink) {
                // User found via wallet link
                const { data: userData } = await supabase
                    .from('users')
                    .select('id')
                    .eq('id', userIdFromLink)
                    .single();
                if (userData) {
                    user = userData;
                    userError = null;
                    console.log('[server] [MOBILE] ✅ User found via wallet link:', userIdFromLink);
                }
            }
        }

        // Si el usuario no existe, crearlo automáticamente
        if (!user || (userError && userError.code === 'PGRST116')) {
            console.log('[server] Usuario no encontrado, creando automáticamente para wallet:', walletAddress);
            
            // Crear usuario nuevo
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert({
                    wallet_address: walletAddress,
                    created_at: new Date().toISOString()
                })
                .select('id')
                .single();

            if (createError) {
                console.error('[server] Error creando usuario:', createError);
                // Continuar con userId null si falla la creación
                return res.json({
                    credits: 0,
                    usdcValue: 0,
                    mtrPrice: priceUpdater.getCurrentPrice() || 0,
                    userId: null,
                    error: 'Error al crear usuario: ' + createError.message
                });
            }

            user = newUser;
            console.log('[server] ✅ Usuario creado automáticamente con ID:', user.id);

            // Crear registro de créditos inicial (0 créditos)
            const { error: creditsError } = await supabase
                .from('user_credits')
                .insert({
                    user_id: user.id,
                    credits: 0
                });

            if (creditsError) {
                console.error('[server] Error creando registro de créditos:', creditsError);
                // Continuar aunque falle la creación del registro de créditos
            }

            // 🔗 CRÍTICO: Vincular wallet en user_wallets automáticamente
            // Esto permite que el usuario opere usando solo su wallet como identidad (wallet-only mode)
            if (walletLinkService) {
                try {
                    const linkResult = await walletLinkService.linkWallet(
                        user.id,
                        walletAddress,
                        {
                            ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                            userAgent: req.headers['user-agent'] || 'unknown',
                            linkedVia: 'auto' // Auto-linked from wallet connection
                        }
                    );
                    if (linkResult.success) {
                        console.log(`[server] ✅ Wallet ${walletAddress} auto-linked to user ${user.id} (wallet-only mode)`);
                    }
                } catch (linkError) {
                    console.error('[server] Error auto-linking wallet:', linkError);
                    // Continuar aunque falle la vinculación
                }
            }
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
 * Get unified balance (fiat + onchain) for user by userId
 * Used for email-only users (no wallet)
 */
app.get('/api/user/balance/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;

        // Get user data with fiat and onchain balances
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('saldo_fiat, saldo_onchain, id')
            .eq('id', userId)
            .single();

        if (userError || !userData) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get credits from user_credits (legacy, for backwards compatibility)
        const { data: creditsData } = await supabase
            .from('user_credits')
            .select('credits')
            .eq('user_id', userId)
            .maybeSingle();

        const fiatBalance = parseFloat(userData.saldo_fiat || 0);
        const onchainBalance = parseFloat(userData.saldo_onchain || 0);
        const creditsBalance = parseFloat(creditsData?.credits || 0);
        
        // Unified balance = fiat + onchain + credits (credits are legacy)
        const totalBalance = fiatBalance + onchainBalance + creditsBalance;

        res.json({
            total_balance: totalBalance,
            fiat_balance: fiatBalance,
            onchain_balance: onchainBalance,
            credits_balance: creditsBalance, // Legacy
            userId: userId
        });
    } catch (error) {
        console.error('[server] Error getting unified balance:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Deduct credits (for betting)
 * Supports both userId and walletAddress for wallet-only operations
 * NEW: Supports fiat balance deduction
 */
app.post('/api/user/deduct-credits', async (req, res) => {
    try {
        const { userId, credits, walletAddress } = req.body;

        if (!credits || credits <= 0) {
            return res.status(400).json({ error: 'Invalid credits amount' });
        }

        let targetUserId = userId;

        // 🔗 NUEVO: Si no hay userId pero hay walletAddress, buscar userId desde wallet
        // Esto permite operaciones wallet-only (sin login con Google/Email)
        if (!targetUserId && walletAddress) {
            // Buscar usuario por wallet en users table
            const { data: userByWallet } = await supabase
                .from('users')
                .select('id')
                .eq('wallet_address', walletAddress.toLowerCase())
                .single();

            if (userByWallet) {
                targetUserId = userByWallet.id;
                console.log(`[server] [WALLET-ONLY] Found userId ${targetUserId} from wallet ${walletAddress}`);
            } else {
                // Intentar buscar en user_wallets (wallet link)
                if (walletLinkService) {
                    const userIdFromLink = await walletLinkService.getUserIdFromWallet(walletAddress);
                    if (userIdFromLink) {
                        targetUserId = userIdFromLink;
                        console.log(`[server] [WALLET-ONLY] Found userId ${targetUserId} from wallet link`);
                    }
                }
            }

            if (!targetUserId) {
                return res.status(400).json({ error: 'User not found. Connect wallet or login first.' });
            }
        }

        if (!targetUserId) {
            return res.status(400).json({ error: 'userId or walletAddress required' });
        }

        // Get current balance
        const { data: currentBalance } = await supabase
            .from('user_credits')
            .select('credits')
            .eq('user_id', targetUserId)
            .single();

        if (!currentBalance || currentBalance.credits < credits) {
            return res.status(400).json({ error: 'Insufficient credits' });
        }

        // Deduct credits
        const { error: deductError } = await supabase.rpc('decrement_user_credits', {
            user_id_param: targetUserId,
            credits_to_subtract: credits
        });

        if (deductError) {
            // Fallback: direct update
            const newBalance = currentBalance.credits - credits;
            await supabase
                .from('user_credits')
                .update({ credits: newBalance, updated_at: new Date().toISOString() })
                .eq('user_id', targetUserId);
        }

        res.json({ success: true, creditsDeducted: credits, userId: targetUserId });
    } catch (error) {
        console.error('[server] Error deducting credits:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Claim credits (convert to USDC)
 */
// 🔒 SEGURIDAD: Aplicar rate limiting al endpoint de claims
app.post('/api/claim', claimRateLimiter, async (req, res) => {
    // Verificar que claimService esté inicializado
    if (!claimService) {
        return res.status(503).json({ 
            error: 'Claim service not available',
            message: 'El servicio de claims no está disponible. Verifica que ADMIN_WALLET_PRIVATE_KEY esté configurado en Render.'
        });
    }
    try {
        const { userId, credits, walletAddress } = req.body;

        if (!userId || !credits || !walletAddress) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // 🔒 SEGURIDAD: Validar formato de wallet address
        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            console.error(`[SECURITY] Invalid wallet address format: ${walletAddress}`);
            return res.status(400).json({ error: 'Invalid wallet address format' });
        }

        // 🔒 SEGURIDAD CRÍTICA: Verificar que la wallet pertenece al usuario
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, wallet_address')
            .eq('id', userId)
            .single();

        if (userError || !user) {
            console.error(`[SECURITY] User not found: ${userId}`, userError);
            return res.status(404).json({ error: 'User not found' });
        }

        // 🔒 SEGURIDAD CRÍTICA: Verificar que la wallet del claim coincide con la wallet del usuario
        if (user.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
            // Registrar alerta de seguridad
            console.error(`[SECURITY ALERT] 🔴 Wallet mismatch detected:`);
            console.error(`  User ID: ${userId}`);
            console.error(`  User's wallet: ${user.wallet_address}`);
            console.error(`  Claimed wallet: ${walletAddress}`);
            console.error(`  IP: ${req.ip || req.headers['x-forwarded-for'] || 'unknown'}`);
            console.error(`  User-Agent: ${req.headers['user-agent'] || 'unknown'}`);
            
            // Registrar en base de datos para auditoría
            try {
                await supabase.from('security_alerts').insert([{
                    alert_type: 'WALLET_MISMATCH',
                    severity: 'high',
                    details: JSON.stringify({
                        userId: userId,
                        userWallet: user.wallet_address,
                        claimedWallet: walletAddress,
                        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                        userAgent: req.headers['user-agent'] || 'unknown',
                        timestamp: new Date().toISOString()
                    }),
                    created_at: new Date().toISOString()
                }]);
            } catch (alertError) {
                console.error('[SECURITY] Error logging security alert:', alertError);
            }
            
            return res.status(403).json({ 
                error: 'Wallet address does not match user account',
                security_alert: true 
            });
        }

        const MIN_CLAIM_AMOUNT = 1; // Mínimo para reclamar (mismo que apuesta mínima)
        if (credits < MIN_CLAIM_AMOUNT) {
            return res.status(400).json({ error: `Minimum claim: ${MIN_CLAIM_AMOUNT} credits` });
        }

        // 🔒 SEGURIDAD: Registrar intento de claim antes de procesar
        console.log(`[SECURITY] Claim request validated: User ${userId}, Wallet ${walletAddress}, Credits ${credits}`);

        const result = await claimService.processClaim(userId, credits, walletAddress, {
            ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown'
        });

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

        // Intentar inicializar el servicio si no está disponible
        if (!depositSyncService) {
            console.warn('[server] Deposit sync service not initialized, attempting to initialize...');
            try {
                depositSyncService = new DepositSyncService();
                await depositSyncService.init();
            } catch (initError) {
                console.error('[server] Failed to initialize deposit sync service:', initError);
                return res.status(503).json({ 
                    error: 'Deposit sync service not available',
                    message: 'El servicio de sincronización no está disponible. Intenta nuevamente en unos momentos.'
                });
            }
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
    let txHash;
    try {
        txHash = req.params.txHash;
        
        console.log('[diagnose] ========== NEW REQUEST ==========');
        console.log('[diagnose] Raw txHash from params:', txHash);
        console.log('[diagnose] Request headers:', JSON.stringify(req.headers));
        
        if (!txHash) {
            return res.status(400).json({
                error: 'Missing transaction hash',
                message: 'No se proporcionó un hash de transacción'
            });
        }
        
        // Limpiar y validar formato del hash
        const originalTxHash = txHash;
        txHash = txHash.trim().replace(/\s+/g, '').replace(/\//g, '').replace(/\n/g, '').replace(/-/g, '');
        
        console.log('[diagnose] Original txHash:', originalTxHash);
        console.log('[diagnose] Cleaned txHash:', txHash);
        console.log('[diagnose] TxHash length:', txHash.length);
        
        if (!txHash || !txHash.startsWith('0x')) {
            return res.status(400).json({ 
                error: 'Invalid transaction hash format',
                message: 'El hash de transacción debe comenzar con "0x"'
            });
        }
        
        if (txHash.length !== 66) {
            return res.status(400).json({ 
                error: 'Invalid transaction hash length',
                message: `El hash de transacción debe tener 66 caracteres (tiene ${txHash.length}). Verifica que copiaste el hash completo.`
            });
        }
        
        if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
            return res.status(400).json({ 
                error: 'Invalid transaction hash characters',
                message: 'El hash contiene caracteres no válidos. Solo debe contener números y letras hexadecimales (0-9, a-f, A-F).'
            });
        }
        
        const { createPublicClient, http, formatUnits } = require('viem');
        const { base } = require('viem/chains');

        const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS || '0x75376BC58830f27415402875D26B73A6BE8E2253';
        const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

        // ANTES de consultar blockchain, buscar depósitos recientes si hay wallet address
        const walletAddress = req.query.walletAddress || req.headers['x-wallet-address'];
        console.log('[diagnose] Checking for wallet address BEFORE blockchain query:', walletAddress);
        
        if (walletAddress) {
            console.log('[diagnose] Searching recent deposits for wallet BEFORE blockchain query:', walletAddress);
            
            try {
                // Buscar el usuario por wallet address
                const { data: user, error: userError } = await supabase
                    .from('users')
                    .select('id, wallet_address')
                    .eq('wallet_address', walletAddress.toLowerCase())
                    .single();
                
                if (user) {
                    console.log('[diagnose] User found:', user.id);
                    
                    // Buscar depósitos del usuario
                    const { data: recentDeposits, error: recentError } = await supabase
                        .from('deposits')
                        .select('*')
                        .eq('user_id', user.id)
                        .order('created_at', { ascending: false })
                        .limit(10);
                    
                    if (!recentError && recentDeposits && recentDeposits.length > 0) {
                        console.log('[diagnose] Found', recentDeposits.length, 'recent deposits for wallet');
                        
                        // Verificar si alguno de estos depósitos coincide con el hash (con variaciones)
                        const normalizedTxHash = txHash.toLowerCase();
                        const matchingDeposit = recentDeposits.find(d => 
                            d.tx_hash.toLowerCase() === normalizedTxHash ||
                            d.tx_hash.toLowerCase().includes(normalizedTxHash.substring(2, 20)) ||
                            normalizedTxHash.includes(d.tx_hash.toLowerCase().substring(2, 20))
                        );
                        
                        if (matchingDeposit) {
                            console.log('[diagnose] ✅ Found matching deposit by partial hash match');
                            return res.json({
                                processed: true,
                                deposit: matchingDeposit,
                                message: 'Deposit already processed (found by partial hash match)'
                            });
                        }
                        
                        // Si no hay coincidencia exacta, devolver los depósitos recientes
                        console.log('[diagnose] Returning recent deposits list (hash not found but deposits exist)');
                        return res.json({
                            processed: false,
                            hashNotFound: true,
                            recentDeposits: recentDeposits.map(d => ({
                                tx_hash: d.tx_hash,
                                amount: d.amount,
                                token: d.token,
                                credits_awarded: d.credits_awarded,
                                created_at: d.created_at,
                                processed_at: d.processed_at,
                                status: d.status
                            })),
                            message: 'Hash no encontrado, pero se encontraron depósitos recientes para esta wallet. Verifica si alguno de estos es el que buscas.'
                        });
                    } else {
                        console.log('[diagnose] No recent deposits found for wallet');
                    }
                } else {
                    console.log('[diagnose] User not found for wallet:', walletAddress);
                }
            } catch (walletSearchError) {
                console.error('[diagnose] Error searching wallet deposits:', walletSearchError);
                // Continuar con la búsqueda en blockchain
            }
        }

        // Configurar RPC con múltiples fallbacks
        const RPC_URLS = [
            process.env.BASE_RPC_URL,
            'https://mainnet.base.org',
            'https://base-mainnet.g.alchemy.com/v2/demo',
            'https://base.llamarpc.com'
        ].filter(Boolean);
        
        const rpcUrl = RPC_URLS[0];
        console.log('[diagnose] Using RPC URL:', rpcUrl);
        console.log('[diagnose] Transaction hash:', txHash);

        const publicClient = createPublicClient({
            chain: base,
            transport: http(rpcUrl)
        });

        // Intentar obtener el receipt de la transacción
        // Si no se encuentra, intentar buscar por logs directamente (puede ser que el receipt aún no esté disponible)
        let receipt = null;
        
        try {
            console.log('[diagnose] Fetching transaction receipt...');
            receipt = await publicClient.getTransactionReceipt({ hash: txHash });
            console.log('[diagnose] Receipt received:', receipt ? 'OK' : 'NULL');
            if (receipt) {
                console.log('[diagnose] Receipt status:', receipt.status);
                console.log('[diagnose] Block number:', receipt.blockNumber?.toString());
                console.log('[diagnose] Total logs:', receipt.logs?.length || 0);
            }
        } catch (rpcError) {
            console.error('[diagnose] Error fetching receipt:', rpcError);
            console.error('[diagnose] Error name:', rpcError.name);
            console.error('[diagnose] Error message:', rpcError.message);
            
            // Si el receipt no se encuentra, intentar buscar los logs directamente
            if (rpcError.name === 'TransactionReceiptNotFoundError' || 
                rpcError.name === 'TransactionNotFoundError' || 
                (rpcError.message && (rpcError.message.includes('not found') || rpcError.message.includes('could not be found')))) {
                
                console.log('[diagnose] Receipt not found, trying to find transaction by scanning recent blocks...');
                
                // Intentar buscar la transacción escaneando bloques recientes
                try {
                    const latestBlock = await publicClient.getBlockNumber();
                    console.log('[diagnose] Latest block:', latestBlock.toString());
                    
                    // Escanear los últimos 1000 bloques buscando la transacción
                    const fromBlock = latestBlock - BigInt(1000);
                    const toBlock = latestBlock;
                    
                    console.log('[diagnose] Scanning blocks', fromBlock.toString(), 'to', toBlock.toString());
                    
                    // Buscar logs de USDC Transfer a la plataforma
                    const logs = await publicClient.getLogs({
                        address: USDC_ADDRESS,
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
                    
                    console.log('[diagnose] Found', logs.length, 'USDC transfer logs to platform');
                    
                    // Buscar si alguna de estas transacciones coincide con nuestro hash
                    for (const log of logs) {
                        if (log.transactionHash.toLowerCase() === txHash.toLowerCase()) {
                            console.log('[diagnose] ✅ Found transaction in logs!');
                            // Reconstruir un receipt básico desde el log
                            receipt = {
                                status: 'success', // Asumimos éxito si está en los logs
                                blockNumber: log.blockNumber,
                                transactionHash: log.transactionHash,
                                logs: [log]
                            };
                            break;
                        }
                    }
                    
                    if (!receipt) {
                        console.log('[diagnose] Transaction not found in recent blocks');
                        const walletAddress = req.query.walletAddress || req.headers['x-wallet-address'];
                        let message = 'La transacción no se encontró en la red Base. ';
                        message += 'Verifica que el hash sea correcto y pertenezca a la red Base. ';
                        message += 'Si la transacción fue reciente, espera unos momentos e intenta nuevamente.';
                        
                        if (walletAddress) {
                            message += ' También es posible que la transacción esté en otra red (Ethereum, Polygon, etc.).';
                        }
                        
                        // Antes de devolver 404, verificar si la transacción podría estar en otra red
                        // Usar el multi-chain listener si está disponible
                        if (multiChainDepositListener) {
                            console.log('[diagnose] Transaction not found on Base, checking other networks via multi-chain listener...');
                            // El multi-chain listener debería detectar transacciones automáticamente
                            // Por ahora, devolvemos un mensaje más informativo
                            return res.status(404).json({ 
                                error: 'Transaction not found on Base',
                                message: message + ' El sistema multi-red está activo y detectará automáticamente depósitos de otras redes.',
                                suggestion: walletAddress ? 'Si realizaste un depósito desde otra red (Ethereum, Polygon, etc.), el sistema lo detectará automáticamente. También puedes buscar tus depósitos recientes.' : 'El sistema detectará automáticamente depósitos de otras redes.',
                                multiChainEnabled: true
                            });
                        } else {
                            return res.status(404).json({ 
                                error: 'Transaction not found',
                                message: message,
                                suggestion: walletAddress ? 'Busca tus depósitos recientes para encontrar la transacción correcta en Base.' : null,
                                multiChainEnabled: false
                            });
                        }
                    }
                } catch (scanError) {
                    console.error('[diagnose] Error scanning blocks:', scanError);
                    return res.status(404).json({ 
                        error: 'Transaction not found',
                        message: 'La transacción no se encontró en la red Base. Verifica que el hash sea correcto y pertenezca a la red Base.'
                    });
                }
            } else if (rpcError.name === 'TimeoutError' || rpcError.message?.includes('timeout')) {
                return res.status(504).json({ 
                    error: 'RPC Timeout',
                    message: 'El servidor RPC tardó demasiado en responder. Intenta nuevamente en unos momentos.'
                });
            } else if (rpcError.message && rpcError.message.includes('invalid transaction hash')) {
                return res.status(400).json({ 
                    error: 'Invalid transaction hash',
                    message: 'El hash de transacción proporcionado no es válido.'
                });
            } else {
                return res.status(500).json({ 
                    error: 'RPC Error',
                    message: 'Error al consultar la blockchain: ' + (rpcError.message || 'Error desconocido'),
                    details: process.env.NODE_ENV === 'development' ? {
                        name: rpcError.name,
                        code: rpcError.code,
                        message: rpcError.message
                    } : undefined
                });
            }
        }

        if (!receipt) {
            const walletAddress = req.query.walletAddress || req.headers['x-wallet-address'];
            let message = 'La transacción no existe en la red Base o aún no ha sido confirmada. ';
            message += 'Verifica que el hash pertenezca a la red Base y no a otra red como Ethereum.';
            
            return res.status(404).json({ 
                error: 'Transaction not found',
                message: message,
                suggestion: walletAddress ? 'Busca tus depósitos recientes para encontrar la transacción correcta.' : null
            });
        }

        if (receipt.status !== 'success') {
            return res.status(400).json({ 
                error: 'Transaction failed', 
                status: receipt.status,
                message: 'Esta transacción falló en la blockchain y no puede ser procesada como depósito.'
            });
        }

        // PRIMERO: Verificar si ya está procesado en la BD (más rápido y confiable)
        let existingDeposit;
        try {
            // Buscar por hash exacto
            const { data: depositByHash, error: hashError } = await supabase
                .from('deposits')
                .select('*, users!inner(wallet_address)')
                .eq('tx_hash', txHash)
                .single();
            
            if (hashError && hashError.code !== 'PGRST116') {
                console.error('[diagnose] Error checking existing deposit by hash:', hashError);
                throw hashError;
            }
            
            if (depositByHash) {
                console.log('[diagnose] ✅ Deposit found in database by hash:', {
                    id: depositByHash.id,
                    status: depositByHash.status,
                    credits: depositByHash.credits_awarded,
                    processedAt: depositByHash.processed_at,
                    wallet: depositByHash.users?.wallet_address
                });
                return res.json({
                    processed: true,
                    deposit: depositByHash,
                    message: 'Deposit already processed'
                });
            }
            
        } catch (dbError) {
            console.error('[diagnose] Database error:', dbError);
            return res.status(500).json({ 
                error: 'Database error',
                message: 'Error al consultar la base de datos: ' + (dbError.message || 'Error desconocido')
            });
        }
        
        console.log('[diagnose] Deposit not found in database, checking blockchain...');

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

        console.log('[diagnose] Total logs in receipt:', receipt.logs?.length || 0);
        
        // Filtrar logs de USDC Transfer
        const allTransferLogs = receipt.logs.filter(log => 
            log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()
        );
        
        console.log('[diagnose] USDC transfer logs found:', allTransferLogs.length);
        console.log('[diagnose] USDC address:', USDC_ADDRESS);
        console.log('[diagnose] Platform wallet:', PLATFORM_WALLET);
        
        // Si no hay logs de USDC, también buscar en MTR
        let transferLogs = allTransferLogs;
        if (transferLogs.length === 0) {
            const mtrLogs = receipt.logs.filter(log => 
                log.address.toLowerCase() === MTR_TOKEN_ADDRESS.toLowerCase()
            );
            console.log('[diagnose] MTR transfer logs found:', mtrLogs.length);
            if (mtrLogs.length > 0) {
                transferLogs = mtrLogs;
            }
        }

        const transfers = [];
        const tokenDecimals = transferLogs.length > 0 && transferLogs[0].address.toLowerCase() === MTR_TOKEN_ADDRESS.toLowerCase() ? 18 : 6;
        
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
                const amount = parseFloat(formatUnits(value, tokenDecimals));
                
                console.log('[diagnose] Transfer decoded:', { 
                    from, 
                    to, 
                    amount, 
                    token: log.address.toLowerCase() === USDC_ADDRESS.toLowerCase() ? 'USDC' : 'MTR'
                });

                if (to.toLowerCase() === PLATFORM_WALLET.toLowerCase()) {
                    transfers.push({
                        from,
                        to,
                        amount,
                        token: log.address.toLowerCase() === USDC_ADDRESS.toLowerCase() ? 'USDC' : 'MTR',
                        isPlatformDeposit: true
                    });
                    console.log('[diagnose] ✅ Platform deposit found:', { from, amount, token: transfers[transfers.length - 1].token });
                }
            } catch (e) {
                console.warn('[diagnose] Error decoding log:', e.message);
                console.warn('[diagnose] Log data:', { address: log.address, topics: log.topics?.length, data: log.data?.substring(0, 20) });
                // Skip invalid logs
            }
        }

        if (transfers.length === 0) {
            console.log('[diagnose] No platform deposits found in transaction');
            console.log('[diagnose] Transaction may not be a deposit to platform wallet');
            console.log('[diagnose] All logs in receipt:', receipt.logs.map(l => ({
                address: l.address,
                topics: l.topics?.length
            })));
            return res.status(400).json({ 
                error: 'No transfer to platform wallet found',
                message: 'Esta transacción no contiene una transferencia de USDC o MTR a la dirección de la plataforma. Verifica que el hash sea correcto y que la transacción sea un depósito a la plataforma.'
            });
        }

        const depositTransfer = transfers[0];
        const DEPOSIT_FEE_RATE = 0.05;
        const depositFee = depositTransfer.amount * DEPOSIT_FEE_RATE;
        
        // Calcular créditos según el token
        let credits;
        if (depositTransfer.token === 'USDC') {
            // USDC: 1 USDC = 1 crédito (después del fee)
            credits = depositTransfer.amount - depositFee;
        } else {
            // MTR: usar el rate actual desde la BD
            // Por ahora usar un rate por defecto, pero idealmente debería venir de la BD
            const MTR_RATE = 778; // 778 MTR = 1 crédito (debería venir de platform_settings)
            credits = (depositTransfer.amount - depositFee) / MTR_RATE;
        }
        
        console.log('[diagnose] Deposit calculation:', {
            token: depositTransfer.token,
            amount: depositTransfer.amount,
            fee: depositFee,
            credits: credits
        });

        console.log('[diagnose] Calculating deposit details:', {
            amount: depositTransfer.amount,
            fee: depositFee,
            credits: credits
        });

        // Check user
        let user = null;
        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, wallet_address')
                .eq('wallet_address', depositTransfer.from.toLowerCase())
                .single();
            
            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                console.error('[diagnose] Error checking user:', error);
                throw error;
            }
            
            user = data;
            console.log('[diagnose] User found:', user ? 'YES' : 'NO');
        } catch (dbError) {
            console.error('[diagnose] Database error checking user:', dbError);
            // No lanzar error aquí, solo loguear - el depósito puede procesarse sin usuario registrado
        }

        const responseData = {
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
        };
        
        console.log('[diagnose] Sending response:', {
            processed: responseData.processed,
            transferAmount: responseData.transfer.amount,
            credits: responseData.transfer.credits,
            userFound: !!responseData.user
        });

        res.json(responseData);

    } catch (error) {
        console.error('[diagnose] ========== UNEXPECTED ERROR ==========');
        console.error('[diagnose] Error name:', error.name);
        console.error('[diagnose] Error message:', error.message);
        console.error('[diagnose] Error code:', error.code);
        console.error('[diagnose] Error stack:', error.stack);
        console.error('[diagnose] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        console.error('[diagnose] ======================================');
        
        // Determinar tipo de error y responder apropiadamente
        let statusCode = 500;
        let errorMessage = 'Error inesperado al procesar la solicitud';
        
        if (error.name === 'TransactionNotFoundError' || error.message?.includes('not found')) {
            statusCode = 404;
            errorMessage = 'La transacción no se encontró en la red Base. Verifica el hash.';
        } else if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
            statusCode = 504;
            errorMessage = 'El servidor tardó demasiado en responder. Intenta nuevamente.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        res.status(statusCode).json({ 
            error: 'Internal server error', 
            message: errorMessage,
            details: process.env.NODE_ENV === 'development' ? {
                name: error.name,
                message: error.message,
                code: error.code,
                stack: error.stack
            } : undefined
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
 * Get user ID from wallet address (for internal wallet browsers)
 * This endpoint allows wallet-based authentication when Supabase session is not available
 */
app.get('/api/user/wallet/:walletAddress', async (req, res) => {
    try {
        const walletAddress = req.params.walletAddress.toLowerCase();

        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            return res.status(400).json({ error: 'Invalid wallet address format' });
        }

        if (!walletLinkService) {
            return res.status(503).json({ error: 'Wallet link service not available' });
        }

        const userId = await walletLinkService.getUserIdFromWallet(walletAddress);

        if (!userId) {
            return res.json({
                linked: false,
                userId: null,
                message: 'Wallet not linked to any user account'
            });
        }

        // Get user info
        const { data: user } = await supabase
            .from('users')
            .select('id, wallet_address, email')
            .eq('id', userId)
            .single();

        res.json({
            linked: true,
            userId: userId,
            walletAddress: walletAddress,
            userEmail: user?.email || null,
            message: 'Wallet is linked to a user account'
        });

    } catch (error) {
        console.error('[server] Error getting wallet link:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Link wallet to authenticated user
 * Requires Supabase authentication token
 * Also syncs wallet-only operations if user did operations before logging in
 */
app.post('/api/user/link-wallet', async (req, res) => {
    try {
        // Get Supabase auth token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const token = authHeader.replace('Bearer ', '');
        
        // Verify token and get user
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !authUser) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const { walletAddress } = req.body;

        if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            return res.status(400).json({ error: 'Invalid wallet address format' });
        }

        if (!walletLinkService) {
            return res.status(503).json({ error: 'Wallet link service not available' });
        }

        // 🔗 NUEVO: Sync wallet-only operations if user did operations before logging in
        const { syncWalletOnLogin } = require('./sync-wallet-on-login');
        try {
            const syncResult = await syncWalletOnLogin(authUser.id, walletAddress);
            console.log('[server] Wallet sync result:', syncResult);
        } catch (syncError) {
            console.warn('[server] Error syncing wallet operations (continuing anyway):', syncError.message);
            // Continue with linking even if sync fails
        }

        // Link wallet to authenticated user
        const result = await walletLinkService.linkWallet(
            authUser.id,
            walletAddress,
            {
                ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                userAgent: req.headers['user-agent'] || 'unknown',
                linkedVia: 'google' // Could be 'google', 'email', 'manual'
            }
        );

        if (!result.success) {
            return res.status(400).json({
                error: result.error || 'Failed to link wallet',
                existingUserId: result.existingUserId || null
            });
        }

        res.json({
            success: true,
            walletId: result.walletId,
            isPrimary: result.isPrimary,
            alreadyLinked: result.alreadyLinked || false,
            message: result.alreadyLinked 
                ? 'Wallet already linked to your account'
                : 'Wallet linked successfully'
        });

    } catch (error) {
        console.error('[server] Error linking wallet:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get all wallets linked to authenticated user
 */
app.get('/api/user/wallets', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !authUser) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        if (!walletLinkService) {
            return res.status(503).json({ error: 'Wallet link service not available' });
        }

        const wallets = await walletLinkService.getUserWallets(authUser.id);

        res.json({
            wallets: wallets,
            count: wallets.length
        });

    } catch (error) {
        console.error('[server] Error getting user wallets:', error);
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
        // Si el servicio no está inicializado, intentar inicializarlo ahora
        if (!vaultService) {
            console.warn('[server] Vault service not initialized, attempting to initialize...');
            try {
                vaultService = new VaultService();
                // VaultService no requiere init(), se inicializa en constructor
            } catch (initError) {
                console.error('[server] Failed to initialize vault service:', initError);
                return res.status(503).json({ 
                    error: 'Vault service not initialized',
                    message: 'El servicio del vault no está disponible. Verifica que las variables de entorno estén configuradas.'
                });
            }
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
        const { feeType, amount, matchId, source, sourceTxHash } = req.body;

        if (!feeType || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }

        if (!['deposit', 'bet', 'withdrawal'].includes(feeType)) {
            return res.status(400).json({ error: 'Invalid fee type' });
        }

        // NUEVO: Distribuir fee entre vault y trading fund (70-80% / 20-30%)
        if (tradingFundService) {
            try {
                const txHash = sourceTxHash || matchId || null;
                const distributionResult = await tradingFundService.distributeFee(amount, feeType, txHash);
                
                res.json({
                    success: true,
                    distributed: true,
                    vaultAmount: distributionResult.vaultAmount,
                    tradingFundAmount: distributionResult.tradingFundAmount,
                    vaultTxHash: distributionResult.vaultTxHash,
                    tradingFundTxHash: distributionResult.tradingFundTxHash,
                    errors: distributionResult.errors
                });
            } catch (distributionError) {
                console.error('[server] Error distributing fee:', distributionError);
                // Fallback: enviar todo al vault si distribución falla
                if (vaultService) {
                    const result = await vaultService.addFee(amount, feeType, null, matchId);
                    res.json({
                        success: true,
                        distributed: false,
                        fallback: true,
                        ...result
                    });
                } else {
                    throw new Error('Vault service not initialized and trading fund distribution failed');
                }
            }
        } else {
            // Fallback: enviar todo al vault si trading fund no está disponible
            if (!vaultService) {
                return res.status(503).json({ error: 'Vault service not initialized' });
            }

            const result = await vaultService.addFee(amount, feeType, null, matchId);

            res.json({
                success: true,
                distributed: false,
                fallback: true,
                ...result
            });
        }
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
 * NOWPayments Webhook Endpoint
 * POST /webhook/nowpayments
 * Receives IPN notifications from NOWPayments
 * IMPORTANT: This endpoint needs raw body for signature verification
 */
app.post('/webhook/nowpayments', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['x-nowpayments-sig'];
        const rawBody = req.body.toString();

        if (!signature) {
            console.error('[nowpayments-webhook] Missing signature header');
            return res.status(400).json({ error: 'Missing signature' });
        }

        // Verify signature
        if (!nowPaymentsService.verifyIPNSignature(rawBody, signature)) {
            console.error('[nowpayments-webhook] Invalid signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const paymentData = JSON.parse(rawBody);
        console.log('[nowpayments-webhook] Received payment notification:', {
            payment_id: paymentData.payment_id,
            status: paymentData.payment_status,
            amount: paymentData.pay_amount
        });

        // Process deposit
        const result = await nowPaymentsService.processDeposit(paymentData);

        // Return 200 OK quickly (don't wait for full processing)
        res.status(200).json({
            received: true,
            payment_id: paymentData.payment_id,
            processed: result.processed
        });

    } catch (error) {
        console.error('[nowpayments-webhook] Error processing webhook:', error);
        // Still return 200 to prevent NOWPayments from retrying
        res.status(200).json({
            received: true,
            error: error.message
        });
    }
});

/**
 * MoonPay Webhook Endpoint
 * POST /webhook/moonpay
 * Receives webhook notifications from MoonPay
 */
app.post('/webhook/moonpay', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['x-moonpay-signature'];
        const rawBody = req.body.toString();

        if (!signature && process.env.MOONPAY_SECRET_KEY) {
            console.warn('[moonpay-webhook] Missing signature header');
            // En sandbox puede no haber signature, continuar
        }

        // Verify signature if secret key is configured
        if (process.env.MOONPAY_SECRET_KEY && signature) {
            if (!moonPayService.verifyWebhookSignature(rawBody, signature)) {
                console.error('[moonpay-webhook] Invalid signature');
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }

        const transactionData = JSON.parse(rawBody);
        console.log('[moonpay-webhook] Received transaction notification:', {
            transaction_id: transactionData.id,
            status: transactionData.status,
            amount: transactionData.baseCurrencyAmount
        });

        // Process deposit
        const result = await moonPayService.processDeposit(transactionData);

        // Return 200 OK quickly
        res.status(200).json({
            received: true,
            transaction_id: transactionData.id,
            processed: result.processed
        });

    } catch (error) {
        console.error('[moonpay-webhook] Error processing webhook:', error);
        // Still return 200 to prevent MoonPay from retrying
        res.status(200).json({
            received: true,
            error: error.message
        });
    }
});

/**
 * Mercado Pago Webhook Endpoint
 * POST /webhook/mercadopago
 * Receives payment notifications from Mercado Pago
 */
app.post('/webhook/mercadopago', express.json(), async (req, res) => {
    try {
        const notification = req.body;
        console.log('[mercadopago-webhook] Received notification:', {
            type: notification.type,
            data_id: notification.data?.id
        });

        if (!mercadoPagoService) {
            console.error('[mercadopago-webhook] Mercado Pago service not initialized');
            return res.status(503).json({ error: 'Service not available' });
        }

        // Process deposit
        const result = await mercadoPagoService.processDeposit(notification);

        // Return 200 OK quickly
        res.status(200).json({
            received: true,
            processed: result.processed,
            payment_id: result.payment_id
        });

    } catch (error) {
        console.error('[mercadopago-webhook] Error processing webhook:', error);
        // Still return 200 to prevent Mercado Pago from retrying excessively
        res.status(200).json({
            received: true,
            error: error.message
        });
    }
});

/**
 * Create Mercado Pago Checkout Preference
 * POST /api/deposit/mercadopago/create
 * Creates a checkout preference for fiat deposit
 */
app.post('/api/deposit/mercadopago/create', async (req, res) => {
    try {
        const { amount, currency = 'COP', userId, email } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }

        if (!mercadoPagoService) {
            return res.status(503).json({ error: 'Mercado Pago service not available' });
        }

        const preference = await mercadoPagoService.createCheckoutPreference({
            amount,
            currency,
            userId,
            email,
            description: 'Depósito MusicToken Ring'
        });

        res.json(preference);

    } catch (error) {
        console.error('[mercadopago] Error creating checkout:', error);
        res.status(500).json({ error: error.message });
    }
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
 * CRÍTICO: Endpoint para servir credits-system.js sin caché
 * Esto evita que Render/CDN cachee el archivo
 * NOTA: No incluir header 'Expires' porque causa error CORS
 */
const fs = require('fs');
const path = require('path');

app.get('/src/credits-system.js', (req, res) => {
    try {
        // CRÍTICO: Intentar múltiples rutas posibles para encontrar el archivo
        // En Render, __dirname puede apuntar a diferentes lugares según cómo se despliegue
        const possiblePaths = [
            path.join(__dirname, '..', 'src', 'credits-system.js'), // Desarrollo local
            path.join(process.cwd(), 'src', 'credits-system.js'), // Render desde raíz
            path.join(__dirname, 'src', 'credits-system.js'), // Render desde backend/
            path.join(process.cwd(), 'backend', '..', 'src', 'credits-system.js'), // Render alternativo
            path.resolve(__dirname, '..', 'src', 'credits-system.js'), // Resolución absoluta desarrollo
            path.resolve(process.cwd(), 'src', 'credits-system.js'), // Resolución absoluta Render
            path.resolve(__dirname, '..', '..', 'src', 'credits-system.js'), // Render desde backend/ profundidad 2
            path.join(process.cwd(), '..', 'src', 'credits-system.js') // Render desde subdirectorio
        ];
        
        let fileContent = null;
        let filePath = null;
        
        // Logging para diagnóstico
        console.log('[server] 🔍 Buscando credits-system.js...');
        console.log('[server] __dirname:', __dirname);
        console.log('[server] process.cwd():', process.cwd());
        
        for (const tryPath of possiblePaths) {
            try {
                const normalizedPath = path.normalize(tryPath);
                console.log('[server] Intentando ruta:', normalizedPath);
                if (fs.existsSync(normalizedPath)) {
                    filePath = normalizedPath;
                    fileContent = fs.readFileSync(normalizedPath, 'utf8');
                    console.log('[server] ✅ credits-system.js encontrado en:', normalizedPath);
                    break;
                } else {
                    console.log('[server] ❌ No existe:', normalizedPath);
                }
            } catch (e) {
                console.log('[server] ⚠️ Error verificando ruta:', tryPath, e.message);
                // Continuar con la siguiente ruta
                continue;
            }
        }
        
        if (!fileContent) {
            console.error('[server] ❌ credits-system.js no encontrado en ninguna ruta probada');
            console.error('[server] Rutas intentadas:', possiblePaths.map(p => path.normalize(p)));
            console.error('[server] __dirname:', __dirname);
            console.error('[server] process.cwd():', process.cwd());
            // Intentar listar el directorio actual para diagnóstico
            try {
                const dirContents = fs.readdirSync(process.cwd());
                console.error('[server] Contenido de process.cwd():', dirContents);
            } catch (e) {
                console.error('[server] No se pudo leer process.cwd()');
            }
            try {
                const dirContents = fs.readdirSync(__dirname);
                console.error('[server] Contenido de __dirname:', dirContents);
            } catch (e) {
                console.error('[server] No se pudo leer __dirname');
            }
            return res.status(404).send('// credits-system.js not found on server');
        }
        
        // CRÍTICO: Headers para evitar caché completamente
        // NO incluir 'Expires' porque causa error CORS en preflight
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Cache-Bust', Date.now().toString());
        
        // CORS headers para permitir acceso desde el frontend
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        // Enviar el contenido
        res.send(fileContent);
    } catch (error) {
        console.error('[server] ❌ Error sirviendo credits-system.js:', error);
        console.error('[server] Error stack:', error.stack);
        res.status(500).send('// Error loading credits-system.js: ' + error.message);
    }
});

// OPTIONS handler para CORS preflight
app.options('/src/credits-system.js', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(200).end();
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
    console.log(`[server] Initializing services...`);
    try {
        await initializeServices();
        console.log(`[server] ✅ Server ready and all services initialized`);
    } catch (error) {
        console.error(`[server] ❌ Failed to initialize services:`, error);
        console.error(`[server] Server will continue but some features may not work`);
        // No exit - allow server to run even if services fail
    }
});

module.exports = app;
