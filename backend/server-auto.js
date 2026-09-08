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
const { MercadoPagoService } = require('./mercadopago-service');
const { WithdrawalService, MIN_WITHDRAWAL_COP, VALID_PAYOUT_METHODS } = require('./withdrawal-service');
const { requireEvmPlatformWallet, getNowPaymentsSettlementAddress, isEvmAddress, resolveEvmPlatformWallet } = require('./platform-addresses');
const { createClient } = require('@supabase/supabase-js');
const {
    createCreditMutationGuard,
    createVaultFeeGuard,
    requireInternalSecret,
    verifyUserCanMutateCredits,
    resolvePublicUserId,
    resolveCreditsUserId,
    verifyUserInMatch,
    authorizeTournamentJoin
} = require('./auth-middleware');
const { startTournamentScheduler } = require('./tournament-scheduler');
const { deductUnifiedBalance } = require('./unified-balance');

const LEGACY_CHAIN_DEPOSITS = process.env.ENABLE_LEGACY_CHAIN_DEPOSITS === 'true';

function legacyDepositsGone(res) {
    return res.status(410).json({
        error: 'legacy_chain_deposits_disabled',
        message: 'Depósitos on-chain directos desactivados. Integración vía NOWPayments (Full API + IPN).'
    });
}

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
// BUG real reportado en vivo: el dueño no podía entrar a admin-retiros.html
// (panel para gestionar retiros COP a mano) desde
// https://musictoken-ring.vercel.app -- ese dominio faltaba en la lista de
// abajo, así que el navegador bloqueaba la respuesta antes de que el JS
// del panel la viera ("Failed to fetch"). Se agrega el dominio de Vercel
// explícito, y de paso se permite cualquier subdominio *.vercel.app (los
// previews de cada deploy/rama de Vercel usan una URL nueva cada vez --
// sin esto, cada preview nuevo repetiría el mismo problema).
const ALLOWED_CORS_ORIGINS = [
    'https://www.musictokenring.xyz',
    'https://musictokenring.xyz',
    'https://musictoken-ring.vercel.app',
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:3000',
    'http://localhost:8000',
    'http://127.0.0.1:8000'
];
const corsOptions = {
    origin: function (origin, callback) {
        // Sin header Origin (ej. curl, Postman, server-to-server) -- permitir.
        if (!origin) return callback(null, true);
        if (ALLOWED_CORS_ORIGINS.includes(origin)) return callback(null, true);
        if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return callback(null, true);
        console.warn('[cors] Origen rechazado:', origin);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Wallet-Address', 'X-Internal-Secret']
};

app.use(cors(corsOptions));
app.use(express.json());

// GET en IPN: el navegador no debe usar esta URL como checkout (solo POST firmado por NOWPayments).
app.get('/webhook/nowpayments', (req, res) => {
    res.status(200).json({
        ok: true,
        message:
            'IPN NOWPayments: solo acepta POST (notificaciones del servidor NOWPayments). No es la página de pago del usuario; el checkout es una URL en nowpayments.io devuelta por POST /api/payments/nowpayments/create.'
    });
});

// Middleware para webhook de NOWPayments (necesita raw body)
app.use('/webhook/nowpayments', express.raw({ type: 'application/json' }));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Supabase client
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Devuelve el id de la fila en public.users para un usuario ya autenticado
 * en Supabase Auth, CREÁNDOLA si todavía no existe.
 *
 * CRÍTICO: se descubrió en vivo (probando un depósito real) que una fila en
 * `users` solo se creaba automáticamente al unirse a un torneo
 * (tournament-battle.js::ensureCpuUsersExist es la única otra inserción, y
 * esa es solo para los bots CPU) — cualquier cuenta logueada por Google/email
 * que nunca jugó un torneo no tenía perfil, y por lo tanto cualquier ruta que
 * dependiera de `users` (depósitos NOWPayments/Mercado Pago, créditos)
 * fallaba con "usuario no encontrado" pese a tener sesión válida. Antes cada
 * ruta de depósito repetía su propia búsqueda por id/email sin crear la fila
 * si faltaba; ahora la crean todas a través de este helper único.
 */
async function ensureUserRow(authUser) {
    const { data: row } = await supabase.from('users').select('id').eq('id', authUser.id).maybeSingle();
    if (row?.id) return row.id;

    if (authUser.email) {
        const { data: byEmail } = await supabase
            .from('users')
            .select('id')
            .ilike('email', authUser.email)
            .maybeSingle();
        if (byEmail?.id) return byEmail.id;
    }

    const provider = authUser.app_metadata?.provider || 'email';
    const { data: created, error: createError } = await supabase
        .from('users')
        .insert([{
            id: authUser.id,
            email: authUser.email || null,
            wallet_address: null,
            auth_provider: provider,
            saldo_fiat: 0,
            saldo_onchain: 0,
            updated_at: new Date().toISOString()
        }])
        .select('id')
        .single();

    if (createError) {
        // Carrera posible: otra request creó la fila justo antes (23505 = unique_violation).
        if (createError.code === '23505') {
            const { data: retryRow } = await supabase.from('users').select('id').eq('id', authUser.id).maybeSingle();
            if (retryRow?.id) return retryRow.id;
        }
        console.error('[ensureUserRow] No se pudo crear la fila de usuario:', authUser.id, createError.message);
        return null;
    }
    console.log('[ensureUserRow] Fila de usuario creada automáticamente:', authUser.id, authUser.email);
    return created?.id || null;
}

const requireCreditMutationAuth = createCreditMutationGuard(supabase, {
    getUserIdFromWallet: (walletAddress) => {
        if (!walletLinkService) return null;
        return walletLinkService.getUserIdFromWallet(walletAddress);
    }
});
const requireVaultFeeAuth = createVaultFeeGuard(supabase);

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
let mercadoPagoService;
let withdrawalService;
let tournamentScheduler;

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
        return false;
    }

    const settlement = getNowPaymentsSettlementAddress();
    if (!settlement || !String(settlement).trim()) {
        console.error('[SECURITY] ❌ PLATFORM_WALLET_ADDRESS / NOWPAYMENTS_SETTLEMENT_ADDRESS vacío');
        return false;
    }

    if (LEGACY_CHAIN_DEPOSITS) {
        try {
            requireEvmPlatformWallet();
        } catch (e) {
            console.error('[SECURITY] ❌ ENABLE_LEGACY_CHAIN_DEPOSITS=true requiere EVM_PLATFORM_WALLET_ADDRESS (0x…) o PLATFORM_WALLET_ADDRESS en formato EVM');
            console.error('[SECURITY]', e.message);
            return false;
        }
    } else {
        if (!isEvmAddress(process.env.PLATFORM_WALLET_ADDRESS)) {
            console.log('[server] ℹ️ PLATFORM_WALLET_ADDRESS no es EVM (p. ej. Tron USDT) — OK para NOWPayments. On-chain Base usa EVM_PLATFORM_WALLET_ADDRESS si lo configuras.');
        }
    }
    
    if (process.env.VAULT_WALLET_ADDRESS && isEvmAddress(process.env.VAULT_WALLET_ADDRESS) && isEvmAddress(process.env.PLATFORM_WALLET_ADDRESS)) {
        if (process.env.VAULT_WALLET_ADDRESS.toLowerCase() === process.env.PLATFORM_WALLET_ADDRESS.toLowerCase()) {
            console.warn('[SECURITY] ⚠️ VAULT_WALLET_ADDRESS igual a PLATFORM_WALLET_ADDRESS (EVM)');
        }
    }
    
    // Validar formato de private keys (deben empezar con 0x y tener 66 caracteres)
    const ADMIN_KEY = process.env.ADMIN_WALLET_PRIVATE_KEY;
    if (ADMIN_KEY && !ADMIN_KEY.startsWith('0x') && ADMIN_KEY.length !== 64 && ADMIN_KEY.length !== 66) {
        console.warn('[SECURITY] ⚠️ WARNING: ADMIN_WALLET_PRIVATE_KEY format may be incorrect');
    }
    
    console.log('[server] ✅ Environment variables validated');
    console.log(`[server] 🔒 NOWPayments / liquidación: ${settlement}`);
    console.log(`[server] 🔒 EVM Base (swaps/listeners): ${resolveEvmPlatformWallet() || 'no configurada'}`);
    console.log(`[server] 🔒 Vault Wallet: ${process.env.VAULT_WALLET_ADDRESS || 'not set'}`);
    if (!process.env.BACKEND_INTERNAL_SECRET) {
        console.warn('[SECURITY] ⚠️ BACKEND_INTERNAL_SECRET not set — internal-only routes will reject requests');
    }
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

        if (LEGACY_CHAIN_DEPOSITS) {
            depositListener = new DepositListener();
            await depositListener.init();
            try {
                multiChainDepositListener = new MultiChainDepositListener();
                await multiChainDepositListener.init();
            } catch (multiChainError) {
                console.error('[server] ⚠️ Error initializing multi-chain listener:', multiChainError);
                console.error('[server] Stack:', multiChainError.stack);
                console.log('[server] Continuing with Base-only listener...');
            }
        } else {
            console.log('[server] Legacy chain deposit listeners off (ENABLE_LEGACY_CHAIN_DEPOSITS is not true).');
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

        if (LEGACY_CHAIN_DEPOSITS) {
            depositSyncService = new DepositSyncService();
            await depositSyncService.init();
        } else {
            console.log('[server] Deposit sync service skipped (legacy chain deposits disabled).');
        }

        // Liquidity manager: buffer USDC (Base) + pool MTR
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

        try {
            tradingFundService = new TradingFundService();
            console.log('[server] ✅ Trading Fund Service initialized');
        } catch (tradingFundError) {
            console.error('[server] ⚠️ Error initializing trading fund service:', tradingFundError);
            console.log('[server] Continuing without trading fund service...');
        }

        try {
            nowPaymentsService = new NOWPaymentsService();
            console.log('[server] ✅ NOWPayments service initialized');
        } catch (npError) {
            console.error('[server] ⚠️ Error initializing NOWPayments service:', npError.message);
        }

        try {
            if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
                mercadoPagoService = new MercadoPagoService();
                console.log('[server] ✅ Mercado Pago service initialized');
            } else {
                console.log('[server] ℹ️ MERCADOPAGO_ACCESS_TOKEN no configurado — Mercado Pago deshabilitado');
            }
        } catch (mpError) {
            console.error('[server] ⚠️ Error initializing Mercado Pago service:', mpError.message);
        }

        try {
            withdrawalService = new WithdrawalService(supabase);
            console.log('[server] ✅ Withdrawal service (retiros manuales COP) initialized');
        } catch (wsError) {
            console.error('[server] ⚠️ Error initializing withdrawal service:', wsError.message);
        }

        try {
            tournamentScheduler = startTournamentScheduler(supabase);
            console.log('[server] ✅ Tournament scheduler initialized');
        } catch (tournamentError) {
            console.error('[server] ⚠️ Error initializing tournament scheduler:', tournamentError.message);
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

        // 1 crédito = 1 USD nominal
        const usdcValue = credits;

        res.json({
            credits: Math.round(credits * 10000) / 10000, // 4 decimals
            usdcValue: Math.round(usdcValue * 100) / 100, // 2 decimals (igual a créditos)
            mtrPrice: null, // Ya no relevante
            rate: null, // Ya no se usa
            userId: user.id,
            note: '1 crédito = 1 USD nominal'
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
app.post('/api/user/deduct-credits', requireCreditMutationAuth, async (req, res) => {
    try {
        const { userId, credits, walletAddress } = req.body;

        if (!credits || credits <= 0) {
            return res.status(400).json({ error: 'Invalid credits amount' });
        }

        let targetUserId = userId;

        if (req.authUser) {
            const resolved = await resolveCreditsUserId(supabase, {
                getUserIdFromWallet: (addr) =>
                    walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
            }, req.authUser, walletAddress || null);
            targetUserId = resolved.userId;
        }

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

        if (req.authMode === 'user') {
            const allowed = await verifyUserCanMutateCredits(
                supabase,
                {
                    getUserIdFromWallet: (addr) =>
                        walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
                },
                req.authUser,
                { userId: targetUserId, walletAddress }
            );
            if (!allowed) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }

        // Balance unificado (misma fuente que muestra el frontend)
        const deduction = await deductUnifiedBalance(supabase, targetUserId, credits);
        if (!deduction.ok) {
            return res.status(400).json({
                error: deduction.error || 'Insufficient credits',
                total_balance: deduction.total,
                credits_balance: deduction.creditsBal,
                fiat_balance: deduction.fiat,
                onchain_balance: deduction.onchain
            });
        }

        res.json({
            success: true,
            creditsDeducted: credits,
            userId: targetUserId,
            breakdown: {
                fromCredits: deduction.fromCredits,
                fromFiat: deduction.fromFiat,
                fromOnchain: deduction.fromOnchain
            }
        });
    } catch (error) {
        console.error('[server] Error deducting credits:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Acredita el premio de una batalla al ganador -- reemplaza el RPC
 * increment_user_credits que game-engine.js llamaba DIRECTO desde el
 * cliente contra el id crudo de matches.player1_id/player2_id.
 *
 * BUG real reportado en vivo ("problemas con el balance al ganar la
 * batalla"): apostar SIEMPRE resta del id correcto -- /api/user/
 * deduct-credits ya resuelve con resolveCreditsUserId() (una cuenta con
 * wallet vinculada puede tener el saldo real bajo un id de fila `users`
 * distinto del id de sesión). Pero el PREMIO se sumaba directo, desde el
 * navegador, al id crudo guardado en el match -- para una cuenta así, el
 * RPC de verdad corría y de verdad sumaba créditos, pero a un id que el
 * balance en pantalla del usuario nunca lee. El dinero no desaparecía de
 * la base, pero era invisible: exactamente lo reportado.
 *
 * Nunca confía en lo que mande el cliente para decidir CUÁNTO ni A QUIÉN
 * acreditar -- relee el match real de la base y recalcula todo server-side,
 * para que esto no pueda usarse para acreditarse a sí mismo ni a nadie
 * créditos arbitrarios. Solo exige que quien llama sea uno de los dos
 * jugadores de ESE match (igual que requireVaultFeeAuth ya hace para el
 * fee de apuesta) -- cualquiera de los dos dispositivos puede ganar la
 * "carrera de resolución" del lado del cliente (ver endBattle en
 * game-engine.js) y terminar siendo quien llama acá.
 */
app.post('/api/matches/:matchId/award-winner', requireCreditMutationAuth, async (req, res) => {
    try {
        const { matchId } = req.params;
        if (!matchId) return res.status(400).json({ error: 'matchId requerido' });
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión para procesar el premio.' });

        const { data: match, error: matchError } = await supabase
            .from('matches')
            .select('id, status, winner, player1_id, player2_id, total_pot, match_type, stake_type, player1_song_id, player2_song_id')
            .eq('id', matchId)
            .maybeSingle();

        if (matchError || !match) {
            return res.status(404).json({ error: 'Match no encontrado' });
        }
        if (match.status !== 'finished' || match.winner == null) {
            return res.status(400).json({ error: 'El match todavía no tiene un ganador registrado' });
        }

        const inMatch = await verifyUserInMatch(supabase, req.authUser, matchId);
        if (!inMatch) {
            return res.status(403).json({ error: 'No participas en esta partida.' });
        }

        const winnerUserId = match.winner === 1 ? match.player1_id : match.player2_id;
        if (!winnerUserId) {
            return res.status(400).json({ error: 'Match sin ganador válido' });
        }

        const totalPot = parseFloat(match.total_pot || 0);
        const BET_FEE_RATE = 0.02;
        const platformFee = totalPot * BET_FEE_RATE;
        const winnerPayout = totalPot - platformFee;

        if (winnerPayout <= 0) {
            // Pozo en 0 (ej. batalla amistosa CPU sin rival humano a tiempo,
            // ver startQuickCpuFallback) -- nada que acreditar, no es un error.
            return res.json({ ok: true, winnerUserId, credited: 0, platformFee: 0 });
        }

        // Partida de prueba (bono): el premio se paga en bonus_credits,
        // JAMÁS en credits real -- por eso ni siquiera se resuelve con
        // resolveCreditsUserId() (esa lógica es para cuentas reales con
        // wallets vinculadas viejas; el sistema de bonos es nuevo, cada
        // cuenta tiene un solo id). Vencimiento fresco de 3 días para que
        // el ganador tenga tiempo de decidir si quiere recargar de verdad.
        if (match.stake_type === 'bonus') {
            const bonusExpiresAt = new Date(Date.now() + BONUS_INVITE_DEFAULT_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString();
            const { error: bonusCreditError } = await supabase.rpc('increment_bonus_credits', {
                user_id_param: winnerUserId,
                credits_to_add: winnerPayout,
                new_expires_at: bonusExpiresAt
            });
            if (bonusCreditError) {
                console.error('[award-winner] increment_bonus_credits falló:', bonusCreditError);
                return res.status(500).json({ error: 'No se pudo acreditar el premio de prueba' });
            }
            console.log(`[award-winner] match ${matchId} (bonus): acreditados ${winnerPayout} créditos de prueba a ${winnerUserId}`);
            return res.json({ ok: true, winnerUserId, credited: winnerPayout, platformFee, stakeType: 'bonus' });
        }

        const { data: winnerRow } = await supabase
            .from('users')
            .select('id, email, wallet_address')
            .eq('id', winnerUserId)
            .maybeSingle();

        const resolved = await resolveCreditsUserId(
            supabase,
            {
                getUserIdFromWallet: (addr) =>
                    walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
            },
            { id: winnerUserId, email: winnerRow?.email || null },
            winnerRow?.wallet_address || null
        );
        const targetUserId = resolved.userId;

        const { error: creditError } = await supabase.rpc('increment_user_credits', {
            user_id_param: targetUserId,
            credits_to_add: winnerPayout
        });

        if (creditError) {
            console.error('[award-winner] increment_user_credits falló:', creditError);
            return res.status(500).json({ error: 'No se pudo acreditar el premio' });
        }

        console.log(`[award-winner] match ${matchId}: acreditados ${winnerPayout} a ${targetUserId} (winnerUserId original: ${winnerUserId})`);

        // FASE 1 de regalías de artista -- best-effort, nunca bloquea el
        // premio real que ya se acreditó arriba. Si la canción ganadora
        // está reclamada y VERIFICADA por un artista, se le suma acá su
        // porcentaje del pozo a royalty_credits (acumulado, NO retirable
        // todavía -- ver artist-royalties-system.sql). Nunca corre para
        // partidas 'bonus' (pozo no es plata real).
        let royaltyInfo = null;
        try {
            const winningSongId = match.winner === 1 ? match.player1_song_id : match.player2_song_id;
            if (winningSongId) {
                const { data: claimedSong } = await supabase
                    .from('artist_songs')
                    .select('id, artist_id, wins_count, total_royalties_earned')
                    .eq('song_id', winningSongId)
                    .eq('status', 'verified')
                    .maybeSingle();

                if (claimedSong) {
                    const { data: artistRow } = await supabase
                        .from('artists')
                        .select('id, royalty_percent, royalty_credits')
                        .eq('id', claimedSong.artist_id)
                        .eq('verification_status', 'verified')
                        .maybeSingle();

                    if (artistRow) {
                        const royaltyAmount = totalPot * (parseFloat(artistRow.royalty_percent) / 100);
                        if (royaltyAmount > 0) {
                            await supabase.from('artists').update({
                                royalty_credits: parseFloat(artistRow.royalty_credits) + royaltyAmount
                            }).eq('id', artistRow.id);

                            await supabase.from('artist_songs').update({
                                wins_count: (claimedSong.wins_count || 0) + 1,
                                total_royalties_earned: parseFloat(claimedSong.total_royalties_earned || 0) + royaltyAmount
                            }).eq('id', claimedSong.id);

                            await supabase.from('artist_royalty_ledger').insert([{
                                artist_id: artistRow.id,
                                artist_song_id: claimedSong.id,
                                match_id: matchId,
                                amount: royaltyAmount,
                                total_pot: totalPot
                            }]);

                            royaltyInfo = { artistId: artistRow.id, amount: royaltyAmount };
                            console.log(`[award-winner] 🎵 Regalía de impulso: ${royaltyAmount.toFixed(4)} al artista ${artistRow.id} (canción ${winningSongId}, match ${matchId})`);
                        }
                    }
                }
            }
        } catch (royaltyError) {
            console.error('[award-winner] Error acreditando regalía de artista (no bloquea el premio):', royaltyError);
        }

        res.json({ ok: true, winnerUserId: targetUserId, credited: winnerPayout, platformFee, royalty: royaltyInfo });
    } catch (error) {
        console.error('[award-winner] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Reembolsa créditos al propio usuario que llama (cancelar un Desafío
 * Social, salir de una Sala Privada antes de que alguien se una, o
 * revertir una apuesta que no llegó a completarse). Reemplaza el RPC
 * increment_user_credits que game-engine.js llamaba DIRECTO desde el
 * cliente con el userId resuelto por CreditsSystem.getUserId() -- esa
 * función prioriza session.user.id sin comparar si otro id (una wallet
 * vinculada con historial propio) tiene más saldo real. Mismo patrón de
 * bug que award-winner arriba, versión "reembolsarme a mí mismo" en vez
 * de "pagarle a otro jugador" -- mismo fix: resolver con
 * resolveCreditsUserId() antes de acreditar, igual que ya hace
 * /api/user/deduct-credits para la resta simétrica de este mismo monto.
 *
 * verifyUserCanMutateCredits() (misma que ya usa deduct-credits) evita
 * que el walletAddress que mande el cliente pueda dirigir el reembolso a
 * una cuenta ajena -- el id resuelto tiene que ser el propio del que
 * llama, o una wallet de verdad vinculada a esa cuenta.
 */
app.post('/api/user/refund-credits', requireCreditMutationAuth, async (req, res) => {
    try {
        const { credits, walletAddress } = req.body;

        if (!credits || credits <= 0) {
            return res.status(400).json({ error: 'Invalid credits amount' });
        }
        if (!req.authUser) {
            return res.status(401).json({ error: 'Inicia sesión para procesar el reembolso.' });
        }

        const resolved = await resolveCreditsUserId(
            supabase,
            {
                getUserIdFromWallet: (addr) =>
                    walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
            },
            req.authUser,
            walletAddress || null
        );
        const targetUserId = resolved.userId;

        if (req.authMode === 'user') {
            const allowed = await verifyUserCanMutateCredits(
                supabase,
                {
                    getUserIdFromWallet: (addr) =>
                        walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
                },
                req.authUser,
                { userId: targetUserId, walletAddress }
            );
            if (!allowed) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }

        const { error: creditError } = await supabase.rpc('increment_user_credits', {
            user_id_param: targetUserId,
            credits_to_add: credits
        });

        if (creditError) {
            console.error('[refund-credits] increment_user_credits falló:', creditError);
            return res.status(500).json({ error: 'No se pudo procesar el reembolso' });
        }

        res.json({ ok: true, userId: targetUserId, credited: credits });
    } catch (error) {
        console.error('[refund-credits] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Claim credits (liquidación a wallet según claim-service)
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
        if (!LEGACY_CHAIN_DEPOSITS) return legacyDepositsGone(res);
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
    if (!LEGACY_CHAIN_DEPOSITS) return legacyDepositsGone(res);
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

        const PLATFORM_WALLET = requireEvmPlatformWallet();
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

        // Configurar RPC: oficial Base + fallback alternativo (sin proveedores de terceros con API key)
        const RPC_URLS = [
            process.env.BASE_RPC_URL,
            'https://mainnet.base.org',
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
                    
                    // Logs Transfer del contrato USDC (Base) hacia la plataforma
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
                    
                    console.log('[diagnose] Found', logs.length, 'USDC (Base) transfer logs to platform');
                    
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
        
        // Filtrar logs Transfer del token USDC (Base)
        const allTransferLogs = receipt.logs.filter(log => 
            log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()
        );
        
        console.log('[diagnose] USDC (Base) transfer logs found:', allTransferLogs.length);
        console.log('[diagnose] USDC contract:', USDC_ADDRESS);
        console.log('[diagnose] Platform wallet:', PLATFORM_WALLET);
        
        // Si no hay logs USDC, buscar MTR
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
                message: 'Esta transacción no contiene una transferencia de USDC (Base) o MTR a la dirección de la plataforma. Verifica el hash y que sea un depósito válido.'
            });
        }

        const depositTransfer = transfers[0];
        const DEPOSIT_FEE_RATE = 0.05;
        const depositFee = depositTransfer.amount * DEPOSIT_FEE_RATE;
        
        // Calcular créditos según el token
        let credits;
        if (depositTransfer.token === 'USDC') {
            // USDC Base: 1:1 nominal tras fee
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
app.post('/api/deposits/sync', requireInternalSecret, async (req, res) => {
    try {
        if (!LEGACY_CHAIN_DEPOSITS) return legacyDepositsGone(res);
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
app.post('/api/deposits/sync-transaction', requireInternalSecret, async (req, res) => {
    try {
        if (!LEGACY_CHAIN_DEPOSITS) return legacyDepositsGone(res);
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
app.post('/api/deposits/process', requireInternalSecret, async (req, res) => {
    try {
        if (!LEGACY_CHAIN_DEPOSITS) return legacyDepositsGone(res);
        const { txHash, walletAddress } = req.body;

        if (!txHash || !walletAddress) {
            return res.status(400).json({ error: 'txHash and walletAddress required' });
        }

        // Verify transaction first
        const { createPublicClient, http, formatUnits } = require('viem');
        const { base } = require('viem/chains');
        
        const PLATFORM_WALLET = requireEvmPlatformWallet();
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
            return res.status(400).json({ error: 'No USDC (Base) transfer to platform wallet found' });
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
app.post('/api/user/add-credits', requireInternalSecret, async (req, res) => {
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
 * Estado real de un Desafío Social + auto-expiración con reembolso.
 *
 * Bug encontrado en vivo (30-ago): la tabla social_challenges ya definía
 * expires_at (7 días) y hasta un status 'expired' permitido por su CHECK
 * constraint, pero NADA en el código lo usaba -- ni el link que abre el
 * desafiado, ni el que acepta, revisaban la fecha. Un desafío vencido de
 * semanas seguía tratándose como válido, y si nadie lo aceptaba nunca, los
 * créditos del que desafió quedaban descontados para siempre sin
 * reembolso. Había incluso una función SQL cleanup_expired_challenges()
 * ya escrita para esto, pero nunca conectada a nada, y que tampoco
 * reembolsaba.
 *
 * Por qué es una ruta de backend y no un UPDATE directo desde el cliente:
 * la política RLS de social_challenges solo deja actualizar filas propias
 * ("auth.uid() = challenger_id AND status = 'pending'") -- pero quien abre
 * el link casi siempre es la OTRA persona, no el creador. Necesita
 * privilegios de service role para resolver el estado real sin importar
 * quién esté mirando.
 *
 * GET (no requiere el secreto interno -- lo llama cualquier usuario que
 * abre un link de desafío, o que revisa sus propios desafíos pendientes).
 * Es seguro: la única mutación posible es transicionar ESTE MISMO desafío
 * de 'pending' a 'expired' exactamente cuando su propio expires_at ya
 * pasó, y reembolsar exactamente su propio bet_amount al challenger_id
 * que ya tenía -- no hay forma de acreditarle nada a nadie más ni de
 * elegir el monto.
 */
app.get('/api/challenges/:challengeId/status', async (req, res) => {
    try {
        const { challengeId } = req.params;
        if (!challengeId) {
            return res.status(400).json({ error: 'challengeId requerido' });
        }

        const { data: challenge, error: fetchError } = await supabase
            .from('social_challenges')
            .select('*')
            .eq('challenge_id', challengeId)
            .maybeSingle();

        if (fetchError) {
            console.error('[challenges/status] Error consultando:', fetchError.message);
            return res.status(500).json({ error: 'No se pudo consultar el desafío.' });
        }
        if (!challenge) {
            return res.status(404).json({ error: 'not_found' });
        }

        const isPastExpiry = challenge.status === 'pending'
            && challenge.expires_at
            && new Date(challenge.expires_at).getTime() < Date.now();

        if (isPastExpiry) {
            const betAmount = Number(challenge.bet_amount);
            // Un desafío de prueba (bono) vencido se reembolsa en
            // bonus_credits -- nunca en credits real, aunque la apuesta
            // "parezca" un número de crédito normal.
            const isBonusChallenge = challenge.stake_type === 'bonus';
            const bonusRefundExpiresAt = new Date(Date.now() + BONUS_INVITE_DEFAULT_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString();

            // Mismo orden seguro que cancelSocialChallenge() en el cliente:
            // reembolsar primero, y solo si el UPDATE atómico condicionado
            // a status='pending' efectivamente "gana la carrera" (nadie más
            // lo aceptó/canceló/expiró mientras tanto) dar el reembolso por
            // bueno. Si el UPDATE no afecta ninguna fila, revertir el
            // reembolso para no acreditar doble.
            const { error: creditError } = isBonusChallenge
                ? await supabase.rpc('increment_bonus_credits', {
                    user_id_param: challenge.challenger_id,
                    credits_to_add: betAmount,
                    new_expires_at: bonusRefundExpiresAt
                })
                : await supabase.rpc('increment_user_credits', {
                    user_id_param: challenge.challenger_id,
                    credits_to_add: betAmount
                });

            if (creditError) {
                console.error('[challenges/status] Error reembolsando desafío vencido:', challengeId, creditError.message);
                // No se pudo reembolsar -- no marcar como expirado todavía,
                // mejor reintentar en la próxima consulta que devolver un
                // desafío "vencido" sin haber devuelto el crédito.
            } else {
                const { data: updated, error: updateError } = await supabase
                    .from('social_challenges')
                    .update({ status: 'expired' })
                    .eq('challenge_id', challengeId)
                    .eq('status', 'pending')
                    .select('*')
                    .maybeSingle();

                if (updateError) {
                    console.error('[challenges/status] Error marcando expirado:', challengeId, updateError.message);
                }

                if (updated) {
                    challenge.status = 'expired';
                    console.log('[challenges] ⏰ Desafío expirado y reembolsado:', challengeId, '→', betAmount, 'créditos a', challenge.challenger_id);
                } else {
                    // Alguien ganó la carrera (o el UPDATE falló) -- revertir
                    // el reembolso recién dado para no duplicar crédito, y
                    // releer el estado real vigente.
                    if (isBonusChallenge) {
                        await supabase.rpc('decrement_bonus_credits', {
                            user_id_param: challenge.challenger_id,
                            credits_to_subtract: betAmount
                        });
                    } else {
                        await supabase.rpc('decrement_user_credits', {
                            user_id_param: challenge.challenger_id,
                            credits_to_subtract: betAmount
                        });
                    }
                    const { data: fresh } = await supabase
                        .from('social_challenges')
                        .select('*')
                        .eq('challenge_id', challengeId)
                        .maybeSingle();
                    if (fresh) Object.assign(challenge, fresh);
                }
            }
        }

        res.json({
            challenge_id: challenge.challenge_id,
            status: challenge.status,
            created_at: challenge.created_at,
            expires_at: challenge.expires_at,
            bet_amount: challenge.bet_amount,
            challenger_song_name: challenge.challenger_song_name,
            challenger_song_artist: challenge.challenger_song_artist,
            challenger_song_image: challenge.challenger_song_image,
            genre_label: challenge.genre_label || null,
            stake_type: challenge.stake_type || 'real'
        });
    } catch (error) {
        console.error('[challenges/status] error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Agent-native ops: internal payout trigger, called ONLY by the GCP CFO
 * agent (agents/cfo_agent.py) after it has already validated the payment,
 * the wallet-of-record, and per-tx/daily caps. This route re-validates the
 * wallet server-side too (defense in depth — never trust the caller's
 * amount/user pairing blindly) and reuses sendPrize(), the same
 * already-audited payout path used elsewhere, instead of introducing a new
 * one. Protected by requireInternalSecret (BACKEND_INTERNAL_SECRET), same
 * mechanism as the other /api/internal-style routes above.
 */
const _agentPayoutIdempotency = new Set(); // best-effort, in-process guard;
// CFO agent already enforces the authoritative idempotency check in Firestore.

app.post('/api/internal/agent-payout', requireInternalSecret, async (req, res) => {
    try {
        const { userId, amountUsd, reason, idempotencyKey } = req.body;

        if (!userId || !amountUsd || amountUsd <= 0) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }
        if (idempotencyKey) {
            if (_agentPayoutIdempotency.has(idempotencyKey)) {
                return res.json({ success: true, duplicate: true });
            }
            _agentPayoutIdempotency.add(idempotencyKey);
        }

        // Wallet of record ONLY from Supabase — never trust a wallet passed in the body.
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, wallet_address')
            .eq('id', userId)
            .single();

        if (userError || !user || !user.wallet_address) {
            return res.status(404).json({ error: 'User or wallet not found' });
        }

        const { sendPrize } = require('./prize-service');
        const result = await sendPrize(user.wallet_address, amountUsd);

        console.log('[agent-payout]', { userId, amountUsd, reason, result });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[server] Error in agent-payout:', error);
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
 * Saldo ESTIMADO de la cuenta real de Mercado Pago (pesos colombianos).
 *
 * CRÍTICO — por qué "estimado" y no "verificado": a diferencia del vault
 * cripto (verificable en vivo contra la blockchain, on-chain, sin tener
 * que confiar en nuestra palabra), Mercado Pago NO tiene una API pública
 * de "saldo actual en tiempo real" — solo un sistema de reportes contables
 * asíncrono, con datos de hasta un día de rezago (webhook + hasta 60 días
 * hacia atrás). No sirve para mostrar "el saldo ahora mismo".
 *
 * Se descartó a propósito un "vault en pesos" como sub-contador separado
 * (ver mercadopago-service.js): toda la plata de pesos —lo que se le debe
 * a los usuarios en créditos y la ganancia de la plataforma— ya está junta
 * en una única cuenta real de Mercado Pago, no hay una wallet separada que
 * fondear como sí pasa con cripto.
 *
 * Entonces esto es un ESTIMADO calculado con nuestros propios registros:
 *   saldo estimado = suma de depósitos NETOS reales confirmados (ya
 *                     descontada la comisión real de Mercado Pago, no la
 *                     bruta que pagó el usuario)
 *                   − suma de retiros/pagos en COP ya realizados
 *
 * Hoy el segundo término siempre es 0 — todavía no existe ningún mecanismo
 * que pague en pesos a un usuario (necesitaría algo como Wompi, ver
 * discusión sobre Nequi/Bre-B). El día que exista, hay que sumar acá la
 * resta de esos pagos reales — dejado listo para eso, no hay que rediseñar
 * el cálculo entero.
 *
 * Puede desviarse de la realidad si pasa algo por fuera de nuestro código
 * (un reembolso manual desde el panel de Mercado Pago, un contracargo,
 * etc.) — el dato 100% confiable siempre es la app real de Mercado Pago.
 */
app.get('/api/vault/balance-cop-estimate', async (req, res) => {
    try {
        const { data: deposits, error } = await supabase
            .from('deposits')
            .select('usdc_value_at_deposit')
            .ilike('network', 'mercadopago-cop%')
            .eq('status', 'processed');

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        // usdc_value_at_deposit = neto en USD de cada depósito (ya descontada
        // la comisión real de Mercado Pago). CRÍTICO: NO se usa la columna
        // `rate_used` para reconvertir a COP — es DECIMAL de poca precisión
        // y trunca tasas USD/COP (~0.00027) a 0.00, lo que habría dado un
        // estimado de $0 pese a depósitos reales (encontrado probando esto
        // en vivo). En cambio, se suma el neto en USD de todos los depósitos
        // y se convierte UNA sola vez con la tasa ACTUAL — es una
        // aproximación (no la tasa exacta de cada día), aceptable porque
        // esto ya está etiquetado como estimado, no como dato verificado.
        const totalNetUsd = (deposits || []).reduce((sum, row) => sum + (parseFloat(row.usdc_value_at_deposit) || 0), 0);

        let copPerUsd = 4000; // fallback conservador si la API de tasa falla
        try {
            const { getCopPerUsd } = require('./mercadopago-service');
            copPerUsd = await getCopPerUsd();
        } catch (rateErr) {
            console.warn('[server] No se pudo obtener tasa USD/COP para el estimado del vault, usando fallback:', rateErr.message);
        }

        const totalDepositsCop = totalNetUsd * copPerUsd;

        // CRÍTICO (2026-08-23): ya existe el mecanismo real de pago manual en
        // pesos (withdrawal_requests_cop, ver withdrawal-service.js) — se
        // resta acá la suma de lo ya efectivamente pagado (status='paid').
        // Encontrado por el usuario probando un retiro real de punta a
        // punta: pagó de verdad y el estimado no bajó nada, seguía mostrando
        // el total bruto de depósitos como si ese dinero siguiera disponible.
        const { data: paidWithdrawals, error: withdrawalsError } = await supabase
            .from('withdrawal_requests_cop')
            .select('amount_cop')
            .eq('status', 'paid');

        if (withdrawalsError) {
            console.warn('[server] No se pudo obtener retiros pagados para el estimado del vault:', withdrawalsError.message);
        }

        const totalWithdrawalsCop = (paidWithdrawals || []).reduce((sum, row) => sum + (parseFloat(row.amount_cop) || 0), 0);

        res.json({
            estimatedBalanceCop: Math.round((totalDepositsCop - totalWithdrawalsCop) * 100) / 100,
            depositsCount: (deposits || []).length,
            paidWithdrawalsCount: (paidWithdrawals || []).length,
            isEstimate: true
        });
    } catch (error) {
        console.error('[server] Error estimating Mercado Pago balance:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Add fee to vault
 */
app.post('/api/vault/add-fee', requireVaultFeeAuth, async (req, res) => {
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
 * Config pública del widget NOWPayments (iframe).
 * La clave del embed es la misma API key del panel NOWPayments (pública en el iframe).
 * IPN / firma sigue siendo solo en servidor (NOWPAYMENTS_WEBHOOK_SECRET).
 * Por defecto: donation-widget — es el embed documentado y suele cargar con solo api_key.
 * payment-widget puede quedarse en spinner si la cuenta no tiene habilitado el flujo Payment Link / comercio.
 * Para forzar pago comercial: NOWPAYMENTS_EMBED_TYPE=payment-widget
 */
app.get('/api/public/nowpayments-widget-config', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const embedKey =
        process.env.NOWPAYMENTS_EMBED_PUBLIC_KEY ||
        process.env.NOWPAYMENTS_PUBLIC_KEY ||
        process.env.NOWPAYMENTS_API_KEY ||
        '';
    const rawType = (process.env.NOWPAYMENTS_EMBED_TYPE || 'donation-widget').toLowerCase();
    const allowed = ['donation-widget', 'payment-widget'];
    const embedType = allowed.includes(rawType) ? rawType : 'donation-widget';
    if (!embedKey) {
        return res.status(503).json({
            ok: false,
            error: 'NOWPayments no configurado (falta NOWPAYMENTS_API_KEY o NOWPAYMENTS_EMBED_PUBLIC_KEY)',
            embedUrl: null,
            embedUrlFiat: null
        });
    }
    const qs = new URLSearchParams({ api_key: embedKey });
    const cur = (process.env.NOWPAYMENTS_EMBED_CURRENCY || '').trim().toLowerCase();
    if (cur) {
        qs.set('currency', cur);
    }
    const base = `https://nowpayments.io/embeds/${embedType}`;
    const embedUrl = `${base}?${qs.toString()}`;
    const baseUrl =
        process.env.BACKEND_URL ||
        process.env.RENDER_EXTERNAL_URL ||
        'https://musictoken-ring.onrender.com';
    const ipnUrl = `${String(baseUrl).replace(/\/$/, '')}/webhook/nowpayments`;
    res.json({
        ok: true,
        embedUrl,
        embedUrlFiat: embedUrl,
        ipnUrl,
        embedType
    });
});

/**
 * Pago comercial NOWPayments: POST /v1/payment (documentación API).
 * Requiere Authorization: Bearer (Supabase). Body: { price_amount: number (USD) }.
 */
const createNowpaymentsPaymentHandler = async (req, res) => {
    try {
        if (!nowPaymentsService) {
            return res.status(503).json({ error: 'NOWPayments service unavailable' });
        }
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const token = authHeader.replace('Bearer ', '');
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !authUser) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const publicUserId = await ensureUserRow(authUser);
        if (!publicUserId) {
            return res.status(400).json({
                error: 'Usuario no encontrado. Regístrate o inicia sesión en la plataforma antes de pagar.'
            });
        }

        const raw = req.body && (req.body.price_amount ?? req.body.amount);
        const priceAmountUsd = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
        if (!Number.isFinite(priceAmountUsd)) {
            return res.status(400).json({ error: 'price_amount inválido (USD)' });
        }

        const origin = (req.headers.origin || '').replace(/\/$/, '');
        const fallbackOrigin = 'https://musictokenring.xyz';
        const baseFront = origin || fallbackOrigin;
        const successUrl =
            (req.body && req.body.success_url) || `${baseFront}/?np_payment=success`;
        const cancelUrl = (req.body && req.body.cancel_url) || `${baseFront}/?np_payment=cancel`;

        const payCurrency =
            req.body && req.body.pay_currency ? String(req.body.pay_currency).trim() : undefined;

        const result = await nowPaymentsService.createCommercialPayment({
            publicUserId,
            priceAmountUsd,
            successUrl,
            cancelUrl,
            payCurrency
        });
        res.json({ ok: true, ...result });
    } catch (e) {
        console.error('[nowpayments-create]', e);
        const code =
            typeof e.clientStatus === 'number' && e.clientStatus >= 400 && e.clientStatus < 600
                ? e.clientStatus
                : 400;
        res.status(code).json({
            ok: false,
            error: e.message || 'Error creating payment',
            npStatus: typeof e.npStatus === 'number' ? e.npStatus : undefined
        });
    }
};

/**
 * Hub de torneos: 14 géneros, Express (10 min) + Grand Prix semanal.
 */
app.get('/api/tournaments/hub', async (req, res) => {
    try {
        if (!tournamentScheduler?.service) {
            return res.status(503).json({ ok: false, error: 'Tournament service unavailable' });
        }
        const syncSlots = req.query.sync === '1';
        const payload = await tournamentScheduler.service.getHubPayload({ syncSlots });
        res.json(payload);
    } catch (error) {
        console.error('[server] tournaments hub error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post('/api/tournaments/hub/sync', async (req, res) => {
    try {
        if (!tournamentScheduler?.service) {
            return res.status(503).json({ ok: false, error: 'Tournament service unavailable' });
        }
        const payload = await tournamentScheduler.service.getHubPayload({ syncSlots: true });
        res.json(payload);
    } catch (error) {
        console.error('[server] tournaments hub sync error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post('/api/tournaments/genre/:genreId/ensure-express', async (req, res) => {
    try {
        if (!tournamentScheduler?.service) {
            return res.status(503).json({ ok: false, error: 'Tournament service unavailable' });
        }
        const result = await tournamentScheduler.service.ensureExpressForGenrePublic(req.params.genreId);
        if (!result.ok) {
            return res.status(400).json(result);
        }
        res.json(result);
    } catch (error) {
        console.error('[server] ensure-express error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.get('/api/tournaments/genre/:genreId', async (req, res) => {
    try {
        if (!tournamentScheduler?.service) {
            return res.status(503).json({ ok: false, error: 'Tournament service unavailable' });
        }
        const detail = await tournamentScheduler.service.getGenreDetail(req.params.genreId);
        if (!detail) {
            return res.status(404).json({ ok: false, error: 'Género no encontrado' });
        }
        res.json({ ok: true, ...detail });
    } catch (error) {
        console.error('[server] tournaments genre error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.get('/api/tournaments/:id/bracket', async (req, res) => {
    try {
        if (!tournamentScheduler?.service) {
            return res.status(503).json({ ok: false, error: 'Tournament service unavailable' });
        }
        const payload = await tournamentScheduler.service.getBracketPayload(
            req.params.id,
            { readOnly: true }
        );
        if (!payload.ok) {
            return res.status(404).json(payload);
        }
        res.json(payload);
    } catch (error) {
        console.error('[server] tournaments bracket error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

async function handleTournamentJoinRequest(req, res, tournamentId, genreId) {
    if (!tournamentScheduler?.service) {
        return res.status(503).json({ ok: false, error: 'Tournament service unavailable' });
    }
    const walletAddress = (req.body?.walletAddress || '').trim() || null;
    const participantUserId = await resolvePublicUserId(supabase, req.authUser);

    if (walletLinkService && walletAddress && /^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        try {
            await walletLinkService.linkWallet(participantUserId, walletAddress, {
                ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
                userAgent: req.headers['user-agent'] || 'unknown',
                linkedVia: 'tournament_join'
            });
        } catch (linkErr) {
            console.warn('[tournament] wallet link on join:', linkErr.message);
        }
    }

    const resolved = await resolveCreditsUserId(supabase, {
        getUserIdFromWallet: (addr) =>
            walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
    }, req.authUser, walletAddress);

    const authz = await authorizeTournamentJoin(
        supabase,
        req.authUser,
        resolved,
        walletAddress
    );

    if (!authz.ok) {
        console.warn('[tournament] join forbidden:', {
            reason: authz.reason,
            resolvedUserId: resolved.userId,
            participantUserId,
            wallet: walletAddress ? walletAddress.slice(0, 10) + '...' : null
        });
        const msg = authz.reason === 'wallet_required'
            ? 'Conecta tu wallet antes de inscribirte.'
            : 'No se pudo validar tu wallet. Reconéctala e intenta de nuevo.';
        return res.status(403).json({ error: msg, reason: authz.reason });
    }

    console.log('[tournament] join debit:', resolved.userId, 'player:', authz.participantUserId, 'balance:', resolved.total);

    const result = await tournamentScheduler.service.joinTournament(
        resolved.userId,
        tournamentId,
        req.body?.song || null,
        resolved.userId,
        {
            genreId: genreId || null,
            preferredTournamentId: tournamentId || req.body?.tournamentId || null,
            displayName: (
                req.authUser?.user_metadata?.full_name ||
                req.authUser?.user_metadata?.name ||
                (req.authUser?.email ? req.authUser.email.split('@')[0] : null) ||
                'Jugador'
            )
        }
    );
    if (!result.ok) {
        return res.status(400).json({
            ...result,
            resolved_user_id: resolved.userId,
            resolved_balance: resolved.total
        });
    }
    return res.json(result);
}

app.post('/api/tournaments/express/join', requireCreditMutationAuth, async (req, res) => {
    try {
        const genreId = (req.body?.genreId || '').trim();
        if (!genreId) {
            return res.status(400).json({ ok: false, error: 'genreId requerido para Express' });
        }
        await handleTournamentJoinRequest(req, res, null, genreId);
    } catch (error) {
        console.error('[server] express join error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post('/api/tournaments/:id/join', requireCreditMutationAuth, async (req, res) => {
    try {
        await handleTournamentJoinRequest(
            req,
            res,
            req.params.id,
            req.body?.genreId || null
        );
    } catch (error) {
        console.error('[server] tournaments join error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post('/api/tournaments/:id/kick', async (req, res) => {
    try {
        if (!tournamentScheduler?.service) {
            return res.status(503).json({ ok: false, error: 'Tournament service unavailable' });
        }
        const lifecycle = await tournamentScheduler.service.advanceTournamentLifecycle(req.params.id);
        const { data: t } = await supabase
            .from('tournaments')
            .select('id, status, genre_id, registration_closes_at')
            .eq('id', req.params.id)
            .maybeSingle();
        res.json({ ok: true, lifecycle, tournament: t });
    } catch (error) {
        console.error('[server] tournaments kick error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post('/api/tournaments/:id/start-battle', async (req, res) => {
    try {
        if (!tournamentScheduler?.service) {
            return res.status(503).json({ ok: false, error: 'Tournament service unavailable' });
        }
        const payload = await tournamentScheduler.service.getBracketPayload(req.params.id);
        if (!payload.ok) {
            return res.status(404).json(payload);
        }
        res.json(payload);
    } catch (error) {
        console.error('[server] tournaments start-battle error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post('/api/tournaments/:id/abandon', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!tournamentScheduler?.service) {
            return res.status(503).json({ ok: false, error: 'Tournament service unavailable' });
        }
        const resolved = await resolveCreditsUserId(req);
        if (!resolved?.userId) {
            return res.status(401).json({ ok: false, error: 'Sesión no válida' });
        }
        const result = await tournamentScheduler.service.abandonTournament(
            resolved.userId,
            req.params.id
        );
        if (!result.ok) {
            return res.status(400).json(result);
        }
        return res.json(result);
    } catch (error) {
        console.error('[server] tournaments abandon error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post('/api/tournaments/:id/advance-playback', async (req, res) => {
    try {
        if (!tournamentScheduler?.service) {
            return res.status(503).json({ ok: false, error: 'Tournament service unavailable' });
        }
        const duelIndex = Number(req.body?.duelIndex);
        const payload = await tournamentScheduler.service.advanceTournamentPlayback(
            req.params.id,
            Number.isFinite(duelIndex) ? duelIndex : 0
        );
        if (!payload.ok) {
            return res.status(400).json(payload);
        }
        res.json(payload);
    } catch (error) {
        console.error('[server] tournaments advance-playback error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.get('/api/tournaments/:id', async (req, res) => {
    try {
        if (!tournamentScheduler?.service) {
            return res.status(503).json({ ok: false, error: 'Tournament service unavailable' });
        }
        const tournament = await tournamentScheduler.service.getTournamentById(req.params.id);
        if (!tournament) {
            return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
        }
        res.json({ ok: true, tournament });
    } catch (error) {
        console.error('[server] tournaments get error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post('/api/payments/nowpayments/create', depositRateLimiter, createNowpaymentsPaymentHandler);
app.post('/nowpayments/create', depositRateLimiter, createNowpaymentsPaymentHandler);

/**
 * Verificación sin auth: confirma que el deploy incluye la ruta de pagos NOWPayments.
 * Si ves 404 aquí, Render aún no tiene el último código (redeploy desde GitHub).
 */
app.get('/api/payments/nowpayments/create', (req, res) => {
    res.json({
        ok: true,
        message:
            'Ruta activa. POST + Bearer + JSON { "price_amount": 10 }. Opcional: "pay_currency" (default servidor: NOWPAYMENTS_PAY_CURRENCY, ej. usdttrc20).',
        postPath: '/api/payments/nowpayments/create',
        renderGitCommit: process.env.RENDER_GIT_COMMIT || null,
        renderService: process.env.RENDER_SERVICE_NAME || null
    });
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
        cors: 'enabled',
        renderGitCommit: process.env.RENDER_GIT_COMMIT || null,
        nowpaymentsCreateGetProbe: '/api/payments/nowpayments/create (GET para verificar deploy)'
    });
});

/**
 * NOWPayments Webhook Endpoint
 * POST /webhook/nowpayments
 * IPN: body JSON crudo; firma x-nowpayments-sig verificada con HMAC-SHA512 (NOWPaymentsService.verifyIPNSignature).
 * Tras OK: NOWPaymentsService.processDeposit → increment_user_credits + registro en deposits.
 */
app.post('/webhook/nowpayments', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        if (!nowPaymentsService) {
            console.error('[nowpayments-webhook] Service not initialized');
            return res.status(503).json({ error: 'NOWPayments service unavailable' });
        }
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

app.post('/webhook/moonpay', express.raw({ type: 'application/json' }), (req, res) => {
    res.status(410).json({ error: 'legacy_moonpay_disabled', message: 'MoonPay retirado; usar NOWPayments.' });
});

/**
 * Webhook de Mercado Pago (IPN). Público en internet por definición — por
 * eso la firma x-signature SIEMPRE se valida antes de procesar nada (ver
 * mercadopago-service.js::verifyWebhookSignature). data.id llega como query
 * param en la URL que Mercado Pago llama (a veces también en el body).
 */
app.post('/webhook/mercadopago', express.json(), async (req, res) => {
    try {
        if (!mercadoPagoService) {
            console.error('[mercadopago-webhook] Service not initialized');
            return res.status(503).json({ error: 'Mercado Pago service unavailable' });
        }

        const dataId = req.query['data.id'] || req.query.id || req.body?.data?.id;
        const signatureOk = mercadoPagoService.verifyWebhookSignature(req.headers, dataId);
        if (!signatureOk) {
            console.error('[mercadopago-webhook] Firma inválida o faltante — notificación rechazada');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const notification = {
            type: req.body?.type || req.query.type,
            data: { id: dataId }
        };
        console.log('[mercadopago-webhook] Notificación válida:', notification);

        const result = await mercadoPagoService.processDeposit(notification);

        // Responder 200 rápido (Mercado Pago espera respuesta dentro de ~22s)
        res.status(200).json({ received: true, processed: result.processed });
    } catch (error) {
        console.error('[mercadopago-webhook] Error procesando webhook:', error);
        // 200 igual, para que Mercado Pago no reintente infinito un error nuestro;
        // el log ya quedó arriba para investigar.
        res.status(200).json({ received: true, error: error.message });
    }
});

/**
 * Crea una preferencia de checkout de Mercado Pago (PSE/Nequi/tarjeta en COP).
 * Requiere Authorization: Bearer (Supabase), mismo patrón que NOWPayments.
 * Body: { amount_usd: number }.
 */
app.post('/api/deposit/mercadopago/create', depositRateLimiter, async (req, res) => {
    try {
        if (!mercadoPagoService) {
            return res.status(503).json({ error: 'Mercado Pago service unavailable' });
        }
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const token = authHeader.replace('Bearer ', '');
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !authUser) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const publicUserId = await ensureUserRow(authUser);
        if (!publicUserId) {
            return res.status(400).json({
                error: 'Usuario no encontrado. Regístrate o inicia sesión en la plataforma antes de pagar.'
            });
        }

        // Acepta el monto en COP (recargas colombianas, PSE/Nequi) o en USD
        // (resto de la app) — ver mercadopago-service.js::createCheckoutPreference.
        const rawCop = req.body && req.body.amount_cop;
        const rawUsd = req.body && (req.body.amount_usd ?? req.body.price_amount);
        const params = { userId: publicUserId, email: authUser.email, description: 'MusicToken Ring — depósito de saldo' };
        if (rawCop != null) {
            const amountCop = typeof rawCop === 'string' ? parseFloat(rawCop) : Number(rawCop);
            if (!Number.isFinite(amountCop) || amountCop < 10000) {
                return res.status(400).json({ error: 'amount_cop inválido (mínimo 10.000 COP)' });
            }
            params.amountCop = amountCop;
        } else {
            const amountUsd = typeof rawUsd === 'string' ? parseFloat(rawUsd) : Number(rawUsd);
            if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
                return res.status(400).json({ error: 'amount_usd inválido' });
            }
            params.amountUsd = amountUsd;
        }

        const result = await mercadoPagoService.createCheckoutPreference(params);
        res.json({ ok: true, ...result });
    } catch (e) {
        console.error('[mercadopago-create]', e);
        res.status(500).json({ ok: false, error: e.message || 'Error creando el pago' });
    }
});

// --------------------------------------------------------------------------
// Retiros manuales en pesos (COP). No hay desembolso automático (ver
// withdrawal-service.js) — esto descuenta el saldo de forma atómica y avisa
// al operador por Telegram para que pague a mano. Reusa claimRateLimiter
// (5 solicitudes / 15 min): es literalmente un retiro, mismo criterio que
// los retiros cripto.
// --------------------------------------------------------------------------
app.post('/api/withdrawals/cop/request', claimRateLimiter, requireCreditMutationAuth, async (req, res) => {
    try {
        if (!withdrawalService) {
            return res.status(503).json({ error: 'Withdrawal service unavailable' });
        }
        const { amount_cop, payout_method, payout_details, walletAddress } = req.body;

        if (!req.authUser) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Mismo patrón que /api/user/deduct-credits: la cuenta con saldo real
        // puede estar bajo un id distinto al de la sesión (cuentas con wallet
        // vinculada) — resolveCreditsUserId elige la correcta.
        const resolved = await resolveCreditsUserId(supabase, {
            getUserIdFromWallet: (addr) =>
                walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
        }, req.authUser, walletAddress || null);

        const request = await withdrawalService.createWithdrawalRequest({
            userId: resolved.userId,
            email: req.authUser.email,
            amountCop: amount_cop,
            payoutMethod: payout_method,
            payoutDetails: payout_details
        });

        res.json({ ok: true, request });
    } catch (e) {
        console.error('[withdrawals-cop-request]', e);
        res.status(400).json({ ok: false, error: e.message || 'Error creando la solicitud de retiro' });
    }
});

app.get('/api/withdrawals/cop/mine', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!withdrawalService) {
            return res.status(503).json({ error: 'Withdrawal service unavailable' });
        }
        if (!req.authUser) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const walletAddress = req.query.walletAddress || null;
        const resolved = await resolveCreditsUserId(supabase, {
            getUserIdFromWallet: (addr) =>
                walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
        }, req.authUser, walletAddress);

        const requests = await withdrawalService.listUserWithdrawalRequests(resolved.userId);
        res.json({ ok: true, requests, minWithdrawalCop: MIN_WITHDRAWAL_COP, validPayoutMethods: VALID_PAYOUT_METHODS });
    } catch (e) {
        console.error('[withdrawals-cop-mine]', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// Panel de administración (solo el operador, protegido con BACKEND_INTERNAL_SECRET —
// misma clave que ya se usa para llamadas backend-to-backend, ver auth-middleware.js).
app.get('/api/admin/withdrawals/cop', requireInternalSecret, async (req, res) => {
    try {
        if (!withdrawalService) {
            return res.status(503).json({ error: 'Withdrawal service unavailable' });
        }
        const requests = await withdrawalService.listPendingWithdrawalRequests();
        res.json({ ok: true, requests });
    } catch (e) {
        console.error('[admin-withdrawals-cop-list]', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.post('/api/admin/withdrawals/cop/:id/mark-paid', requireInternalSecret, async (req, res) => {
    try {
        if (!withdrawalService) {
            return res.status(503).json({ error: 'Withdrawal service unavailable' });
        }
        const updated = await withdrawalService.markWithdrawalPaid(req.params.id, req.body?.notes);
        res.json({ ok: true, request: updated });
    } catch (e) {
        console.error('[admin-withdrawals-cop-mark-paid]', e);
        res.status(400).json({ ok: false, error: e.message });
    }
});

app.post('/api/admin/withdrawals/cop/:id/reject', requireInternalSecret, async (req, res) => {
    try {
        if (!withdrawalService) {
            return res.status(503).json({ error: 'Withdrawal service unavailable' });
        }
        const updated = await withdrawalService.rejectWithdrawalRequest(req.params.id, req.body?.notes);
        res.json({ ok: true, request: updated });
    } catch (e) {
        console.error('[admin-withdrawals-cop-reject]', e);
        res.status(400).json({ ok: false, error: e.message });
    }
});

// ============================================================
// SISTEMA DE CRÉDITOS DE PRUEBA (BONOS) -- ver bonus-credits-system.sql
// Dos billeteras separadas por usuario: `credits` (real, de siempre,
// retirable) y `bonus_credits` (de prueba, con vencimiento, NUNCA
// retirable -- ni como saldo propio ni como premio ganado con ella).
// Todo lo admin vive detrás de requireInternalSecret, mismo panel
// que ya usás para los retiros COP.
// ============================================================

const BONUS_MIN_AMOUNT = 1;
const BONUS_MAX_AMOUNT = 100000; // tope de sanidad del formulario, no un límite de negocio
const BONUS_MAX_EXPIRES_DAYS = 90;
const BONUS_INVITE_DEFAULT_EXPIRES_DAYS = 3;

async function resolveUserIdForAdmin(identifier) {
    if (!identifier) return null;
    const raw = String(identifier).trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
        const { data } = await supabase.from('users').select('id').eq('id', raw).maybeSingle();
        if (data) return data.id;
    }
    if (raw.includes('@')) {
        const { data } = await supabase.from('users').select('id').ilike('email', raw).maybeSingle();
        if (data) return data.id;
    }
    const { data: byWallet } = await supabase.from('users').select('id').ilike('wallet_address', raw).maybeSingle();
    if (byWallet) return byWallet.id;
    return null;
}

/**
 * Otorga un bono de prueba manual -- panel admin, pestaña "Bonos".
 * Solo toca bonus_credits, jamás credits real.
 */
app.post('/api/admin/bonus/grant', requireInternalSecret, async (req, res) => {
    try {
        const { identifier, amount, expiresInDays, note, bonusType, adminLabel } = req.body;

        const parsedAmount = Number(amount);
        const parsedDays = Number(expiresInDays);
        if (!identifier) return res.status(400).json({ ok: false, error: 'Falta identifier (email, wallet o user id)' });
        if (!Number.isFinite(parsedAmount) || parsedAmount < BONUS_MIN_AMOUNT || parsedAmount > BONUS_MAX_AMOUNT) {
            return res.status(400).json({ ok: false, error: `Monto inválido (entre ${BONUS_MIN_AMOUNT} y ${BONUS_MAX_AMOUNT})` });
        }
        if (!Number.isFinite(parsedDays) || parsedDays <= 0 || parsedDays > BONUS_MAX_EXPIRES_DAYS) {
            return res.status(400).json({ ok: false, error: `Días de vencimiento inválidos (entre 1 y ${BONUS_MAX_EXPIRES_DAYS})` });
        }
        const type = bonusType === 'social_challenge_invite' ? 'social_challenge_invite' : 'platform_trial';

        const userId = await resolveUserIdForAdmin(identifier);
        if (!userId) return res.status(404).json({ ok: false, error: 'No se encontró ningún usuario con ese email/wallet/id' });

        const expiresAt = new Date(Date.now() + parsedDays * 24 * 60 * 60 * 1000).toISOString();

        const { error: rpcError } = await supabase.rpc('increment_bonus_credits', {
            user_id_param: userId,
            credits_to_add: parsedAmount,
            new_expires_at: expiresAt
        });
        if (rpcError) {
            console.error('[admin-bonus-grant] increment_bonus_credits falló:', rpcError);
            return res.status(500).json({ ok: false, error: 'No se pudo otorgar el bono' });
        }

        const { error: logError } = await supabase.from('bonus_grants').insert([{
            user_id: userId,
            amount: parsedAmount,
            bonus_type: type,
            granted_by: adminLabel || 'admin',
            note: note || null,
            expires_at: expiresAt,
            status: 'active'
        }]);
        if (logError) {
            console.warn('[admin-bonus-grant] No se pudo registrar en bonus_grants (el bono ya se otorgó igual):', logError.message);
        }

        const { data: updated } = await supabase.from('user_credits').select('bonus_credits, bonus_expires_at').eq('user_id', userId).maybeSingle();

        res.json({ ok: true, userId, granted: parsedAmount, expiresAt, currentBonusBalance: updated?.bonus_credits ?? null });
    } catch (error) {
        console.error('[admin-bonus-grant] Error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/** Lista los bonos otorgados recientemente -- panel admin, pestaña "Bonos". */
app.get('/api/admin/bonus/list', requireInternalSecret, async (req, res) => {
    try {
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
        const { data: grants, error } = await supabase
            .from('bonus_grants')
            .select('id, user_id, amount, bonus_type, granted_by, note, expires_at, status, created_at')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;

        const userIds = [...new Set((grants || []).map(g => g.user_id))];
        let usersById = {};
        if (userIds.length) {
            const { data: users } = await supabase.from('users').select('id, email, wallet_address').in('id', userIds);
            usersById = Object.fromEntries((users || []).map(u => [u.id, u]));
        }

        const rows = (grants || []).map(g => ({
            ...g,
            user_email: usersById[g.user_id]?.email || null,
            user_wallet: usersById[g.user_id]?.wallet_address || null
        }));

        res.json({ ok: true, grants: rows });
    } catch (error) {
        console.error('[admin-bonus-list] Error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * Revoca el saldo de prueba activo de un usuario (ej. abuso detectado).
 * No borra el historial, solo pone bonus_credits en 0 y marca sus
 * bonus_grants activos como 'revoked'.
 */
app.post('/api/admin/bonus/revoke', requireInternalSecret, async (req, res) => {
    try {
        const { userId, identifier } = req.body;
        const targetUserId = userId || await resolveUserIdForAdmin(identifier);
        if (!targetUserId) return res.status(400).json({ ok: false, error: 'Falta userId o identifier' });

        const { error: zeroError } = await supabase
            .from('user_credits')
            .update({ bonus_credits: 0, bonus_expires_at: null, updated_at: new Date().toISOString() })
            .eq('user_id', targetUserId);
        if (zeroError) throw zeroError;

        await supabase.from('bonus_grants').update({ status: 'revoked' }).eq('user_id', targetUserId).eq('status', 'active');

        res.json({ ok: true, userId: targetUserId });
    } catch (error) {
        console.error('[admin-bonus-revoke] Error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/**
 * Foto de contabilidad en vivo -- productiza la auditoría manual de hoy
 * (AUDITORIA-CONCILIACION-2026-09.sql) como endpoint reusable. Todo de
 * solo lectura, nada muta acá.
 */
app.get('/api/admin/accounting/overview', requireInternalSecret, async (req, res) => {
    try {
        const [
            creditsAgg, fiatAgg, onchainAgg, depositsAllTime, deposits30d,
            withdrawalsAgg, vaultRow, activeBonusCount, matchesFinished
        ] = await Promise.all([
            supabase.from('user_credits').select('credits, bonus_credits'),
            supabase.from('users').select('saldo_fiat'),
            supabase.from('users').select('saldo_onchain'),
            supabase.from('deposits').select('amount, credits_awarded, token, status'),
            supabase.from('deposits').select('amount, credits_awarded, token, status').gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
            supabase.from('withdrawal_requests_cop').select('amount_cop, amount_usd_equivalent, status'),
            supabase.from('vault_balance').select('*').limit(1).maybeSingle(),
            supabase.from('bonus_grants').select('id', { count: 'exact', head: true }).eq('status', 'active'),
            supabase.from('matches').select('id', { count: 'exact', head: true }).eq('status', 'finished')
        ]);

        const sum = (rows, field) => (rows || []).reduce((acc, r) => acc + (parseFloat(r[field]) || 0), 0);

        const withdrawalsByStatus = {};
        (withdrawalsAgg.data || []).forEach(w => {
            const s = w.status || 'unknown';
            withdrawalsByStatus[s] = withdrawalsByStatus[s] || { count: 0, cop: 0, usd: 0 };
            withdrawalsByStatus[s].count += 1;
            withdrawalsByStatus[s].cop += parseFloat(w.amount_cop) || 0;
            withdrawalsByStatus[s].usd += parseFloat(w.amount_usd_equivalent) || 0;
        });

        res.json({
            ok: true,
            generatedAt: new Date().toISOString(),
            realCreditsOutstanding: sum(creditsAgg.data, 'credits'),
            bonusCreditsOutstanding: sum(creditsAgg.data, 'bonus_credits'),
            saldoFiatTotal: sum(fiatAgg.data, 'saldo_fiat'),
            saldoOnchainTotal: sum(onchainAgg.data, 'saldo_onchain'),
            // CRÍTICO: deposits.amount está en la moneda ORIGINAL de cada
            // pasarela -- COP crudo para Mercado Pago, USD para
            // NOWPayments/cripto -- misma columna, dos monedas distintas sin
            // convertir (confirmado en mercadopago-service.js/
            // nowpayments-service.js). Sumarla directo mezclaba pesos con
            // dólares y mostraba un total sin sentido. credits_awarded sí
            // está en USD nominal siempre (1 crédito = $1), para cualquier
            // pasarela -- es la columna correcta para un total en dólares.
            deposits: {
                allTimeCount: (depositsAllTime.data || []).length,
                allTimeUsd: sum((depositsAllTime.data || []).filter(d => d.status === 'processed'), 'credits_awarded'),
                last30dCount: (deposits30d.data || []).length,
                last30dUsd: sum((deposits30d.data || []).filter(d => d.status === 'processed'), 'credits_awarded')
            },
            withdrawalsByStatus,
            vaultBalance: vaultRow.data || null,
            activeBonusGrants: activeBonusCount.count || 0,
            matchesFinished: matchesFinished.count || 0
        });
    } catch (error) {
        console.error('[admin-accounting-overview] Error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/** Descuenta bonus_credits del usuario autenticado (equivalente a deduct-credits, pero de prueba). */
app.post('/api/user/deduct-bonus-credits', requireCreditMutationAuth, async (req, res) => {
    try {
        const { credits, walletAddress } = req.body;
        if (!credits || credits <= 0) return res.status(400).json({ error: 'Invalid credits amount' });
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });

        const resolved = await resolveCreditsUserId(supabase, {
            getUserIdFromWallet: (addr) => walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
        }, req.authUser, walletAddress || null);
        const targetUserId = resolved.userId;

        if (req.authMode === 'user') {
            const allowed = await verifyUserCanMutateCredits(supabase, {
                getUserIdFromWallet: (addr) => walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
            }, req.authUser, { userId: targetUserId, walletAddress });
            if (!allowed) return res.status(403).json({ error: 'Forbidden' });
        }

        const { data: deductedOk, error: rpcError } = await supabase.rpc('decrement_bonus_credits', {
            user_id_param: targetUserId,
            credits_to_subtract: credits
        });
        if (rpcError) {
            console.error('[deduct-bonus-credits] decrement_bonus_credits falló:', rpcError);
            return res.status(500).json({ error: 'No se pudo descontar el bono' });
        }
        if (!deductedOk) {
            return res.status(400).json({ error: 'Saldo de prueba insuficiente o vencido' });
        }

        res.json({ success: true, userId: targetUserId, creditsDeducted: credits });
    } catch (error) {
        console.error('[deduct-bonus-credits] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/** Reembolsa bonus_credits al usuario autenticado (ej. cancelar un reto de prueba). */
app.post('/api/user/refund-bonus-credits', requireCreditMutationAuth, async (req, res) => {
    try {
        const { credits, walletAddress, expiresInDays } = req.body;
        if (!credits || credits <= 0) return res.status(400).json({ error: 'Invalid credits amount' });
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });

        const resolved = await resolveCreditsUserId(supabase, {
            getUserIdFromWallet: (addr) => walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
        }, req.authUser, walletAddress || null);
        const targetUserId = resolved.userId;

        if (req.authMode === 'user') {
            const allowed = await verifyUserCanMutateCredits(supabase, {
                getUserIdFromWallet: (addr) => walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
            }, req.authUser, { userId: targetUserId, walletAddress });
            if (!allowed) return res.status(403).json({ error: 'Forbidden' });
        }

        const days = Number(expiresInDays) > 0 ? Number(expiresInDays) : BONUS_INVITE_DEFAULT_EXPIRES_DAYS;
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        const { error: rpcError } = await supabase.rpc('increment_bonus_credits', {
            user_id_param: targetUserId,
            credits_to_add: credits,
            new_expires_at: expiresAt
        });
        if (rpcError) {
            console.error('[refund-bonus-credits] increment_bonus_credits falló:', rpcError);
            return res.status(500).json({ error: 'No se pudo procesar el reembolso de prueba' });
        }

        res.json({ ok: true, userId: targetUserId, credited: credits });
    } catch (error) {
        console.error('[refund-bonus-credits] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Crea un Desafío Social con dinero real -- reemplaza el patrón viejo del
 * cliente (insertar la fila con bet_amount, DESPUÉS descontar créditos, y
 * si falla el descuento, borrar la fila). Ese patrón dejaba una ventana
 * real: nada impedía mandar el INSERT directo a la API de Supabase con
 * cualquier bet_amount, SIN pasar nunca por el descuento -- RLS ya
 * restringe que solo puedas crear un desafío con tu propio challenger_id,
 * pero eso no valida que el monto que declarás haya salido de verdad de tu
 * saldo. Acá el descuento y la creación son un solo paso atómico
 * server-side: el desafío solo existe si el descuento real ya se aplicó.
 * Mismo patrón que ya se usó hoy para el equivalente con bono
 * (/api/social-challenges/bonus/create).
 */
app.post('/api/social-challenges/create', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });
        const { song, betAmount, genreId, genreLabel, walletAddress } = req.body;
        if (!song || !song.id || !song.name || !song.artist) {
            return res.status(400).json({ error: 'Falta información de la canción' });
        }
        const normalizedBet = Math.max(1, Math.round(Number(betAmount) || 1));

        const resolved = await resolveCreditsUserId(supabase, {
            getUserIdFromWallet: (addr) => walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
        }, req.authUser, walletAddress || null);
        const challengerId = resolved.userId;

        const deduction = await deductUnifiedBalance(supabase, challengerId, normalizedBet);
        if (!deduction.ok) {
            return res.status(400).json({
                error: deduction.error || 'Créditos insuficientes',
                total_balance: deduction.total,
                credits_balance: deduction.creditsBal,
                fiat_balance: deduction.fiat,
                onchain_balance: deduction.onchain
            });
        }

        const genChallengeId = () => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let id = '';
            for (let i = 0; i < 12; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
            return id;
        };

        const challengeRow = {
            challenge_id: genChallengeId(),
            challenger_id: challengerId,
            challenger_song_id: song.id,
            challenger_song_name: song.name,
            challenger_song_artist: song.artist,
            challenger_song_image: song.image || null,
            challenger_song_preview: song.preview || null,
            bet_amount: normalizedBet,
            status: 'pending',
            stake_type: 'real',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
        if (genreId) {
            challengeRow.genre_id = genreId;
            challengeRow.genre_label = genreLabel || genreId;
        }

        let { data: challenge, error: insertError } = await supabase
            .from('social_challenges')
            .insert([challengeRow])
            .select()
            .single();

        // Igual que createSocialChallenge() en game-engine.js: si la
        // migración de género todavía no corrió, reintentar sin esas
        // columnas en vez de romper la creación por un dato opcional.
        if (insertError && genreId && String(insertError.message || '').indexOf('genre') !== -1) {
            delete challengeRow.genre_id;
            delete challengeRow.genre_label;
            ({ data: challenge, error: insertError } = await supabase
                .from('social_challenges')
                .insert([challengeRow])
                .select()
                .single());
        }

        if (insertError) {
            // Ya se descontó de verdad -- si falla crear el desafío, devolver
            // el crédito (a la billetera real, siempre a `credits` por
            // simplicidad -- una reversión perfecta por fuente exacta no
            // vale la complejidad para este camino de error, raro por
            // definición).
            await supabase.rpc('increment_user_credits', {
                user_id_param: challengerId,
                credits_to_add: normalizedBet
            }).catch(() => {});
            console.error('[social-create] Error creando el desafío:', insertError);
            return res.status(500).json({ error: 'No se pudo crear el desafío' });
        }

        res.json({ ok: true, challenge });
    } catch (error) {
        console.error('[social-create] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Modo Rápido: entrar a la cola de emparejamiento. Mismo problema que
 * social_challenges, encontrado auditando la mecánica de resolución de
 * batallas -- de hecho, PEOR: acá ni hace falta que nadie intente hacer
 * trampa. joinQuickMatch() en el cliente insertaba la fila de la cola con
 * bet_amount pero NUNCA descontaba nada en ese momento (el comentario del
 * código decía explícitamente "el crédito real recién se descuenta al
 * formarse un match humano") -- pero esa deducción solo corre del lado de
 * quien ENCUENTRA rival (createMatch descuenta bet1, el suyo). A quien
 * ya estaba esperando en la cola nunca se le descontó nada, en ningún
 * punto del código -- juega gratis y cobra el premio completo con dinero
 * que nunca puso, en CUALQUIER Modo Rápido real entre dos humanos, sin
 * que nadie busque explotarlo. Acá se descuenta y se anota en la cola en
 * un solo paso atómico, así el bet_amount que otro dispositivo lea de
 * esta fila siempre está respaldado por un descuento real.
 */
app.post('/api/matchmaking/join', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });
        const { song, betAmount, walletAddress } = req.body;
        if (!song || !song.id || !song.name || !song.artist) {
            return res.status(400).json({ error: 'Falta información de la canción' });
        }
        const normalizedBet = Math.max(1, Math.round(Number(betAmount) || 1));

        const resolved = await resolveCreditsUserId(supabase, {
            getUserIdFromWallet: (addr) => walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
        }, req.authUser, walletAddress || null);
        const userId = resolved.userId;

        // Limpiar cualquier fila vieja de este usuario antes de agregar una
        // nueva (mismo criterio que ya tenía el cliente) -- si quedó una de
        // una búsqueda anterior sin reembolsar, reembolsarla primero para no
        // perder ese crédito.
        const { data: staleRows } = await supabase
            .from('matchmaking_queue')
            .select('id, bet_amount')
            .eq('user_id', userId);
        if (staleRows && staleRows.length) {
            for (const row of staleRows) {
                const staleAmount = parseFloat(row.bet_amount) || 0;
                if (staleAmount > 0) {
                    await supabase.rpc('increment_user_credits', { user_id_param: userId, credits_to_add: staleAmount }).catch(() => {});
                }
            }
            await supabase.from('matchmaking_queue').delete().eq('user_id', userId);
        }

        const deduction = await deductUnifiedBalance(supabase, userId, normalizedBet);
        if (!deduction.ok) {
            return res.status(400).json({
                error: deduction.error || 'Créditos insuficientes',
                total_balance: deduction.total,
                credits_balance: deduction.creditsBal,
                fiat_balance: deduction.fiat,
                onchain_balance: deduction.onchain
            });
        }

        const { data: queueRow, error: insertError } = await supabase
            .from('matchmaking_queue')
            .insert([{
                user_id: userId,
                song_id: song.id,
                song_name: song.name,
                song_artist: song.artist,
                song_image: song.image || null,
                song_preview: song.preview || null,
                bet_amount: normalizedBet
            }])
            .select()
            .single();

        if (insertError) {
            // Ya se descontó de verdad -- si falla el insert, devolver el crédito.
            await supabase.rpc('increment_user_credits', { user_id_param: userId, credits_to_add: normalizedBet }).catch(() => {});
            console.error('[matchmaking-join] Error insertando en la cola:', insertError);
            return res.status(500).json({ error: 'No se pudo entrar a la cola' });
        }

        res.json({ ok: true, queueRow });
    } catch (error) {
        console.error('[matchmaking-join] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Modo Rápido: salir de la cola (cancelar búsqueda, o timeout de 60s antes
 * de caer a CPU) -- reembolsa la apuesta real que se descontó al entrar
 * (ver /api/matchmaking/join). Idempotente: si no había fila (ya se había
 * emparejado, o ya se había ido), no hace nada y no reembolsa dos veces.
 */
app.post('/api/matchmaking/leave', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });
        const { walletAddress } = req.body;

        const resolved = await resolveCreditsUserId(supabase, {
            getUserIdFromWallet: (addr) => walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
        }, req.authUser, walletAddress || null);
        const userId = resolved.userId;

        const { data: deleted, error: deleteError } = await supabase
            .from('matchmaking_queue')
            .delete()
            .eq('user_id', userId)
            .select('bet_amount');

        if (deleteError) {
            console.error('[matchmaking-leave] Error:', deleteError);
            return res.status(500).json({ error: 'No se pudo salir de la cola' });
        }

        let refunded = 0;
        for (const row of deleted || []) {
            const amount = parseFloat(row.bet_amount) || 0;
            if (amount > 0) {
                const { error: refundError } = await supabase.rpc('increment_user_credits', { user_id_param: userId, credits_to_add: amount });
                if (!refundError) refunded += amount;
            }
        }

        res.json({ ok: true, refunded });
    } catch (error) {
        console.error('[matchmaking-leave] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Borra la fila de matchmaking_queue de OTRO jugador, sin reembolsar --
 * solo para el caso de "encontré rival en la cola y le armé el match" (ver
 * joinQuickMatch en game-engine.js). El cliente no puede hacer este borrado
 * directo (RLS de matchmaking_queue restringe a "auth.uid() = user_id",
 * correcto para todo lo demás, pero acá justamente hace falta borrar la
 * fila de OTRO usuario) -- antes ese DELETE fallaba en silencio y la fila
 * quedaba pegada; la próxima vez que ese jugador buscara partida, la
 * limpieza de filas viejas la habría reembolsado de nuevo, duplicando el
 * crédito. Nunca reembolsa: la apuesta de esa fila ya se usó de verdad en
 * el match que se acaba de formar, no fue abandonada. Exige que el
 * queueRowId corresponda de verdad a uno de los dos jugadores del matchId
 * dado, y que quien llama sea el otro jugador -- no borra cualquier fila a
 * pedido de cualquiera.
 */
app.post('/api/matchmaking/clear-matched', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });
        const { queueRowId, matchId } = req.body;
        if (!queueRowId || !matchId) return res.status(400).json({ error: 'Falta queueRowId o matchId' });

        const inMatch = await verifyUserInMatch(supabase, req.authUser, matchId);
        if (!inMatch) return res.status(403).json({ error: 'No participas en esa partida.' });

        const { data: match } = await supabase
            .from('matches')
            .select('player1_id, player2_id')
            .eq('id', matchId)
            .maybeSingle();
        if (!match) return res.status(404).json({ error: 'Match no encontrado' });

        const { data: queueRow } = await supabase
            .from('matchmaking_queue')
            .select('id, user_id')
            .eq('id', queueRowId)
            .maybeSingle();
        if (!queueRow) return res.json({ ok: true, alreadyGone: true });

        // La fila de la cola tiene que ser de uno de los dos jugadores de
        // ESTE match específico -- si no, no se toca.
        if (queueRow.user_id !== match.player1_id && queueRow.user_id !== match.player2_id) {
            return res.status(403).json({ error: 'Esa fila no corresponde a este match' });
        }

        await supabase.from('matchmaking_queue').delete().eq('id', queueRowId);
        res.json({ ok: true });
    } catch (error) {
        console.error('[matchmaking-clear-matched] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// SALA PRIVADA -- MODO TORNEO (mini-torneo eliminatorio privado)
// ============================================================
// Pedido explícito del usuario: cupo de invitados (3-16), arranca solo
// al llenarse el cupo, o antes si el 100% de los presentes vota
// "arrancar ya" (ver private-tournament-rooms.sql para el esquema y el
// razonamiento de RLS). TODO el dinero se mueve acá, nunca desde el
// cliente -- mismo criterio que el resto de los modos reales tras la
// auditoría de esta sesión.
const PRIVATE_TOURNAMENT_FEE_RATE = 0.02; // mismo 2% que el resto de la plataforma

function generatePrivateTournamentCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

// Baraja (Fisher-Yates) y empareja: si la cantidad es impar, el último
// de la lista mezclada queda con "bye" (avanza sin jugar esa ronda) --
// nunca se rellena con CPU acá, a propósito, porque se supone que son
// invitados reales.
function pairForBracketRound(ids) {
    const shuffled = [...ids];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const pairs = [];
    let bye = null;
    for (let i = 0; i < shuffled.length; i += 2) {
        if (i + 1 < shuffled.length) pairs.push([shuffled[i], shuffled[i + 1]]);
        else bye = shuffled[i];
    }
    return { pairs, bye };
}

// Arma una ronda nueva a partir de la lista de "sobrevivientes" (ids de
// participantes que siguen en pie) -- crea las filas reales en "matches"
// para cada par (reusando el mismo motor de batalla que Sala Privada
// 1 vs 1) y sus filas de seguimiento en private_tournament_matches. Las
// filas "bye" quedan resolved=true de una, con su ganador ya puesto.
async function startPrivateTournamentRound(room, survivorIds, participantsById, round) {
    const { pairs, bye } = pairForBracketRound(survivorIds);
    const rows = [];

    for (let i = 0; i < pairs.length; i++) {
        const [p1, p2] = pairs[i];
        const s1 = participantsById[p1];
        const s2 = participantsById[p2];
        const matchInsert = {
            match_type: 'private_bracket',
            // No reusar room.room_code tal cual: no hay garantía de que esa
            // columna sea única en "matches" a nivel de base de datos, y acá
            // se van a insertar VARIAS filas (una por cada par, en cada
            // ronda) -- si hubiera una constraint unique, la segunda fila
            // fallaría. Un sufijo por ronda/posición lo evita sin tocar el
            // esquema existente.
            room_code: `${room.room_code}-R${round}-${i}`,
            player1_id: p1,
            player1_song_id: s1.song_id,
            player1_song_name: s1.song_name,
            player1_song_artist: s1.song_artist,
            player1_song_image: s1.song_image,
            player1_avatar: s1.avatar || null,
            player1_bet: 0,
            player2_id: p2,
            player2_song_id: s2.song_id,
            player2_song_name: s2.song_name,
            player2_song_artist: s2.song_artist,
            player2_song_image: s2.song_image,
            player2_avatar: s2.avatar || null,
            player2_bet: 0,
            total_pot: 0, // el pozo real vive en private_tournament_rooms.total_pot, se paga una sola vez al final
            status: 'ready'
        };
        const { data: matchRow, error: matchError } = await supabase.from('matches').insert([matchInsert]).select().single();
        if (matchError) {
            console.error('[private-tournament] Error creando match de ronda:', matchError);
            continue;
        }
        rows.push({ room_id: room.id, round, match_id: matchRow.id, player1_id: p1, player2_id: p2, is_bye: false, resolved: false });
    }

    if (bye != null) {
        rows.push({ room_id: room.id, round, match_id: null, player1_id: bye, player2_id: null, is_bye: true, resolved: true, winner_id: bye });
    }

    if (rows.length) {
        await supabase.from('private_tournament_matches').insert(rows);
    }
    await supabase.from('private_tournament_rooms').update({ current_round: round }).eq('id', room.id);
}

// Arranca el bracket completo (ronda 1) -- se llama al llenarse el cupo,
// o al lograrse unanimidad en la votación.
async function startPrivateTournamentBracket(room) {
    const { data: participants } = await supabase
        .from('private_tournament_participants')
        .select('*')
        .eq('room_id', room.id)
        .eq('eliminated', false);
    if (!participants || participants.length < 2) return;

    const participantsById = {};
    participants.forEach(p => { participantsById[p.user_id] = p; });
    const ids = participants.map(p => p.user_id);

    // CRÍTICO: dos caminos distintos pueden disparar esto casi al mismo
    // tiempo (el cupo se llena justo cuando también se completa la
    // votación unánime) -- sin este guard, ambos armarían la ronda 1 por
    // duplicado. El UPDATE solo afecta la fila si todavía sigue en
    // 'waiting'; el segundo llamado ve 0 filas afectadas y no hace nada más.
    const { data: claimed } = await supabase
        .from('private_tournament_rooms')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', room.id)
        .eq('status', 'waiting')
        .select()
        .maybeSingle();

    if (!claimed) return;

    await startPrivateTournamentRound(room, ids, participantsById, 1);
}

/**
 * Crea una Sala Privada modo Torneo. Descuenta el bono de entrada del
 * creador ANTES de crear la sala (mismo criterio que todo lo demás en
 * esta sesión) y lo anota como primer participante.
 */
app.post('/api/private-tournaments/create', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });
        const { song, betAmount, avatar, capacity, walletAddress } = req.body;
        if (!song || !song.id || !song.name || !song.artist) {
            return res.status(400).json({ error: 'Falta información de la canción' });
        }
        const normalizedBet = Math.max(1, Math.round(Number(betAmount) || 1));
        const normalizedCapacity = Math.min(16, Math.max(3, Math.round(Number(capacity) || 4)));

        const resolved = await resolveCreditsUserId(supabase, {
            getUserIdFromWallet: (addr) => walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
        }, req.authUser, walletAddress || null);
        const userId = resolved.userId;

        const deduction = await deductUnifiedBalance(supabase, userId, normalizedBet);
        if (!deduction.ok) {
            return res.status(400).json({ error: deduction.error || 'Créditos insuficientes' });
        }

        let roomCode = generatePrivateTournamentCode();
        // Reintentar si por casualidad el código ya existe (extremadamente
        // improbable con 32^6 combinaciones, pero barato de cubrir).
        for (let attempt = 0; attempt < 5; attempt++) {
            const { data: existing } = await supabase.from('private_tournament_rooms').select('id').eq('room_code', roomCode).maybeSingle();
            if (!existing) break;
            roomCode = generatePrivateTournamentCode();
        }

        const { data: room, error: roomError } = await supabase.from('private_tournament_rooms').insert([{
            room_code: roomCode,
            creator_id: userId,
            capacity: normalizedCapacity,
            bet_amount: normalizedBet,
            total_pot: normalizedBet
        }]).select().single();

        if (roomError) {
            await supabase.rpc('increment_user_credits', { user_id_param: userId, credits_to_add: normalizedBet }).catch(() => {});
            console.error('[private-tournament-create] Error creando sala:', roomError);
            return res.status(500).json({ error: 'No se pudo crear la sala' });
        }

        const { error: participantError } = await supabase.from('private_tournament_participants').insert([{
            room_id: room.id,
            user_id: userId,
            song_id: song.id,
            song_name: song.name,
            song_artist: song.artist,
            song_image: song.image || null,
            avatar: avatar || null
        }]);

        if (participantError) {
            await supabase.rpc('increment_user_credits', { user_id_param: userId, credits_to_add: normalizedBet }).catch(() => {});
            await supabase.from('private_tournament_rooms').delete().eq('id', room.id);
            console.error('[private-tournament-create] Error anotando al creador:', participantError);
            return res.status(500).json({ error: 'No se pudo crear la sala' });
        }

        res.json({ ok: true, room });
    } catch (error) {
        console.error('[private-tournament-create] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Unirse a una Sala Privada modo Torneo ya creada. La apuesta es SIEMPRE
 * la que fijó el creador (room.bet_amount) -- el cliente no puede elegir
 * la suya, así el pozo siempre queda consistente entre todos.
 */
app.post('/api/private-tournaments/:roomCode/join', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });
        const { roomCode } = req.params;
        const { song, avatar, walletAddress } = req.body;
        if (!song || !song.id || !song.name || !song.artist) {
            return res.status(400).json({ error: 'Falta información de la canción' });
        }

        const { data: room } = await supabase.from('private_tournament_rooms').select('*').eq('room_code', roomCode).maybeSingle();
        if (!room) return res.status(404).json({ error: 'Sala no encontrada' });
        if (room.status !== 'waiting') return res.status(400).json({ error: 'Esa sala ya no está esperando invitados.' });

        const { data: existingParticipants, error: countError } = await supabase
            .from('private_tournament_participants')
            .select('user_id')
            .eq('room_id', room.id);
        if (countError) return res.status(500).json({ error: 'No se pudo verificar la sala' });
        if (existingParticipants.length >= room.capacity) {
            return res.status(400).json({ error: 'La sala ya está llena.' });
        }

        const resolved = await resolveCreditsUserId(supabase, {
            getUserIdFromWallet: (addr) => walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
        }, req.authUser, walletAddress || null);
        const userId = resolved.userId;

        if (existingParticipants.some(p => p.user_id === userId)) {
            return res.status(400).json({ error: 'Ya estás anotado en esta sala.' });
        }

        const deduction = await deductUnifiedBalance(supabase, userId, room.bet_amount);
        if (!deduction.ok) {
            return res.status(400).json({ error: deduction.error || 'Créditos insuficientes' });
        }

        const { error: insertError } = await supabase.from('private_tournament_participants').insert([{
            room_id: room.id,
            user_id: userId,
            song_id: song.id,
            song_name: song.name,
            song_artist: song.artist,
            song_image: song.image || null,
            avatar: avatar || null
        }]);
        if (insertError) {
            await supabase.rpc('increment_user_credits', { user_id_param: userId, credits_to_add: room.bet_amount }).catch(() => {});
            console.error('[private-tournament-join] Error anotando participante:', insertError);
            return res.status(500).json({ error: 'No se pudo unir a la sala' });
        }

        // Pedido explícito del usuario: si alguien nuevo entra, el conteo de
        // "listos para arrancar" se resetea -- nadie puede quedar afuera de
        // la decisión de arrancar antes de tiempo por haberse unido tarde.
        await supabase.from('private_tournament_participants').update({ ready_vote: false }).eq('room_id', room.id);
        await supabase.from('private_tournament_rooms').update({ total_pot: Number(room.total_pot) + Number(room.bet_amount) }).eq('id', room.id);

        const newCount = existingParticipants.length + 1;
        if (newCount >= room.capacity) {
            const { data: freshRoom } = await supabase.from('private_tournament_rooms').select('*').eq('id', room.id).single();
            await startPrivateTournamentBracket(freshRoom);
        }

        res.json({ ok: true });
    } catch (error) {
        console.error('[private-tournament-join] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Votar "quiero arrancar con los presentes" / "prefiero esperar el cupo
 * completo". Si el 100% de los presentes (mínimo 2) vota que sí, arranca
 * solo, sin que nadie tenga que confirmar nada más.
 */
app.post('/api/private-tournaments/:roomCode/vote-ready', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });
        const { roomCode } = req.params;
        const { ready, walletAddress } = req.body;

        const { data: room } = await supabase.from('private_tournament_rooms').select('*').eq('room_code', roomCode).maybeSingle();
        if (!room) return res.status(404).json({ error: 'Sala no encontrada' });
        if (room.status !== 'waiting') return res.status(400).json({ error: 'Esta sala ya arrancó o cerró.' });

        const resolved = await resolveCreditsUserId(supabase, {
            getUserIdFromWallet: (addr) => walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
        }, req.authUser, walletAddress || null);
        const userId = resolved.userId;

        const { data: updatedParticipant, error: updateError } = await supabase
            .from('private_tournament_participants')
            .update({ ready_vote: !!ready })
            .eq('room_id', room.id)
            .eq('user_id', userId)
            .select('id')
            .maybeSingle();
        if (updateError || !updatedParticipant) {
            return res.status(403).json({ error: 'No estás anotado en esta sala.' });
        }

        const { data: participants } = await supabase.from('private_tournament_participants').select('*').eq('room_id', room.id);
        const allReady = participants.length >= 2 && participants.every(p => p.ready_vote === true);
        if (allReady) {
            await startPrivateTournamentBracket(room);
        }

        res.json({ ok: true, allReady });
    } catch (error) {
        console.error('[private-tournament-vote] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Estado completo de la sala (participantes, votos, bracket) -- lectura
 * pública, sondeada por el cliente cada pocos segundos mientras la sala
 * está abierta o el torneo en curso.
 */
app.get('/api/private-tournaments/:roomCode/state', async (req, res) => {
    try {
        const { roomCode } = req.params;
        const { data: room } = await supabase.from('private_tournament_rooms').select('*').eq('room_code', roomCode).maybeSingle();
        if (!room) return res.status(404).json({ error: 'Sala no encontrada' });

        const { data: participants } = await supabase
            .from('private_tournament_participants')
            .select('*')
            .eq('room_id', room.id)
            .order('joined_at', { ascending: true });

        // Sintaxis de embed de PostgREST: "matches(...)" alcanza sola para
        // resolver la FK (private_tournament_matches.match_id -> matches.id)
        // porque es la única relación entre estas dos tablas -- no hace
        // falta (ni es correcto) escribir "matches:match_id(...)" acá, eso
        // mezclaría el nombre de columna donde va un nombre de relación.
        const { data: bracketRows } = await supabase
            .from('private_tournament_matches')
            .select('*, matches (id, status, winner, player1_song_name, player1_song_image, player2_song_name, player2_song_image)')
            .eq('room_id', room.id)
            .order('round', { ascending: true });

        res.json({ ok: true, room, participants: participants || [], bracket: bracketRows || [] });
    } catch (error) {
        console.error('[private-tournament-state] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Cancelar la sala mientras sigue en 'waiting' (el creador se arrepiente,
 * o nadie más se unió) -- reembolsa a TODOS los que ya se habían anotado,
 * no solo al creador.
 */
app.post('/api/private-tournaments/:roomCode/cancel', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });
        const { roomCode } = req.params;
        const { walletAddress } = req.body;

        const { data: room } = await supabase.from('private_tournament_rooms').select('*').eq('room_code', roomCode).maybeSingle();
        if (!room) return res.status(404).json({ error: 'Sala no encontrada' });

        const resolved = await resolveCreditsUserId(supabase, {
            getUserIdFromWallet: (addr) => walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
        }, req.authUser, walletAddress || null);
        if (resolved.userId !== room.creator_id) {
            return res.status(403).json({ error: 'Solo quien creó la sala puede cancelarla.' });
        }
        if (room.status !== 'waiting') {
            return res.status(400).json({ error: 'Esta sala ya arrancó, no se puede cancelar.' });
        }

        const { data: participants } = await supabase.from('private_tournament_participants').select('user_id').eq('room_id', room.id);
        for (const p of (participants || [])) {
            await supabase.rpc('increment_user_credits', { user_id_param: p.user_id, credits_to_add: room.bet_amount }).catch(() => {});
        }

        await supabase.from('private_tournament_rooms').update({ status: 'cancelled' }).eq('id', room.id);
        res.json({ ok: true });
    } catch (error) {
        console.error('[private-tournament-cancel] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Procesa el resultado de UNA batalla de ronda del bracket. Se llama
 * desde AMBOS dispositivos al terminar la batalla (mismo patrón que el
 * resto de la app) -- "resolved=false -> true" con UPDATE condicionado
 * es la carrera atómica que garantiza que esto corre exactamente una vez
 * por partido, sea cual dispositivo llegue primero.
 */
app.post('/api/private-tournaments/matches/:matchId/resolve-round', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });
        const { matchId } = req.params;

        const { data: bracketMatch } = await supabase.from('private_tournament_matches').select('*').eq('match_id', matchId).maybeSingle();
        if (!bracketMatch) return res.status(404).json({ error: 'No es una batalla de torneo privado.' });

        const { data: room } = await supabase.from('private_tournament_rooms').select('*').eq('id', bracketMatch.room_id).single();

        if (bracketMatch.resolved) {
            // Ya lo procesó el otro dispositivo -- devolver el estado actual
            // sin volver a tocar nada (elimina/paga/avanza UNA sola vez).
            return res.json({ ok: true, alreadyResolved: true, room });
        }

        const { data: realMatch } = await supabase.from('matches').select('id, status, winner, player1_id, player2_id').eq('id', matchId).single();
        if (!realMatch || realMatch.status !== 'finished' || realMatch.winner == null) {
            return res.status(400).json({ error: 'Esa batalla todavía no terminó.' });
        }
        const winnerId = realMatch.winner === 1 ? realMatch.player1_id : realMatch.player2_id;
        const loserId = realMatch.winner === 1 ? realMatch.player2_id : realMatch.player1_id;

        // Carrera atómica: solo el dispositivo que efectivamente cambie esta
        // fila de resolved=false a true sigue adelante y procesa la
        // eliminación/avance/pago. El otro simplemente devuelve el estado ya
        // actualizado que dejó el primero.
        const { data: claimed, error: claimError } = await supabase
            .from('private_tournament_matches')
            .update({ resolved: true, winner_id: winnerId })
            .eq('id', bracketMatch.id)
            .eq('resolved', false)
            .select('id')
            .maybeSingle();

        if (claimError || !claimed) {
            const { data: freshRoom } = await supabase.from('private_tournament_rooms').select('*').eq('id', room.id).single();
            return res.json({ ok: true, alreadyResolved: true, room: freshRoom });
        }

        if (loserId) {
            await supabase.from('private_tournament_participants').update({ eliminated: true }).eq('room_id', room.id).eq('user_id', loserId);
        }

        const { data: roundRows } = await supabase
            .from('private_tournament_matches')
            .select('*')
            .eq('room_id', room.id)
            .eq('round', bracketMatch.round);
        const stillPending = roundRows.some(r => !r.resolved);

        if (stillPending) {
            return res.json({ ok: true, room, roundComplete: false });
        }

        // Ronda completa -- juntar a los sobrevivientes (ganadores de todos
        // los emparejamientos y "byes" de esta ronda).
        const survivorIds = roundRows.map(r => r.winner_id).filter(Boolean);

        // CRÍTICO: cuando la ronda tiene MÁS de un emparejamiento (ej. 4
        // jugadores, 2 batallas en paralelo), los dos partidos pueden
        // terminar casi al mismo tiempo -- cada uno gana SU PROPIA carrera
        // de arriba (son filas distintas), así que los dos dispositivos
        // que resuelven el ÚLTIMO partido de cada emparejamiento llegan
        // hasta acá y los dos ven "stillPending = false" al mismo tiempo.
        // Sin un guard atómico separado, los dos armarían la ronda
        // siguiente (o pagarían al campeón) DOS VECES. Se resuelve igual
        // que arriba: un UPDATE condicionado a que el estado no haya
        // cambiado todavía -- solo el que gane esta segunda carrera avanza
        // de verdad.
        if (survivorIds.length <= 1) {
            const championId = survivorIds[0] || null;
            const { data: claimedFinish } = await supabase
                .from('private_tournament_rooms')
                .update({ status: 'finished', winner_id: championId, finished_at: new Date().toISOString() })
                .eq('id', room.id)
                .eq('status', 'in_progress')
                .select()
                .maybeSingle();

            if (!claimedFinish) {
                // El otro dispositivo ya cerró el torneo -- no pagar de nuevo.
                const { data: freshRoom } = await supabase.from('private_tournament_rooms').select('*').eq('id', room.id).single();
                return res.json({ ok: true, roundComplete: true, tournamentFinished: true, championId, room: freshRoom });
            }

            const platformFee = Number(room.total_pot) * PRIVATE_TOURNAMENT_FEE_RATE;
            const winnerPayout = Number(room.total_pot) - platformFee;
            if (championId) {
                await supabase.rpc('increment_user_credits', { user_id_param: championId, credits_to_add: winnerPayout }).catch((e) => {
                    console.error('[private-tournament-resolve] No se pudo pagar al campeón:', e);
                });
            }
            return res.json({ ok: true, roundComplete: true, tournamentFinished: true, championId, winnerPayout, room: claimedFinish });
        }

        const nextRound = bracketMatch.round + 1;
        const { data: claimedAdvance } = await supabase
            .from('private_tournament_rooms')
            .update({ current_round: nextRound })
            .eq('id', room.id)
            .eq('current_round', bracketMatch.round)
            .select()
            .maybeSingle();

        if (!claimedAdvance) {
            // El otro dispositivo ya armó la ronda siguiente -- no duplicarla.
            const { data: freshRoom } = await supabase.from('private_tournament_rooms').select('*').eq('id', room.id).single();
            return res.json({ ok: true, roundComplete: true, tournamentFinished: false, room: freshRoom });
        }

        const { data: participants } = await supabase.from('private_tournament_participants').select('*').eq('room_id', room.id);
        const participantsById = {};
        participants.forEach(p => { participantsById[p.user_id] = p; });

        await startPrivateTournamentRound(room, survivorIds, participantsById, nextRound);
        const { data: advancedRoom } = await supabase.from('private_tournament_rooms').select('*').eq('id', room.id).single();
        res.json({ ok: true, roundComplete: true, tournamentFinished: false, room: advancedRoom });
    } catch (error) {
        console.error('[private-tournament-resolve] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Crea un Desafío Social financiado con bonus_credits. A diferencia del
 * flujo normal (insert desde el cliente + deducción aparte), esto corre
 * enteramente server-side: nunca confía en que el cliente ya insertó la
 * fila ni en qué stake_type dice tener -- descuenta el bono ANTES de
 * crear el desafío, así nunca queda un desafío "bonus" sin respaldo real.
 */
app.post('/api/social-challenges/bonus/create', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });
        const { song, betAmount, genreId, genreLabel, walletAddress } = req.body;
        if (!song || !song.id || !song.name || !song.artist) {
            return res.status(400).json({ error: 'Falta información de la canción' });
        }
        const normalizedBet = Math.max(1, Math.round(Number(betAmount) || 1));

        const resolved = await resolveCreditsUserId(supabase, {
            getUserIdFromWallet: (addr) => walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
        }, req.authUser, walletAddress || null);
        const challengerId = resolved.userId;

        const { data: deductedOk, error: deductError } = await supabase.rpc('decrement_bonus_credits', {
            user_id_param: challengerId,
            credits_to_subtract: normalizedBet
        });
        if (deductError) {
            console.error('[social-bonus-create] decrement_bonus_credits falló:', deductError);
            return res.status(500).json({ error: 'No se pudo descontar el bono de prueba' });
        }
        if (!deductedOk) {
            return res.status(400).json({ error: 'No tenés saldo de prueba suficiente (o venció). Pedile a un admin que te otorgue uno nuevo.' });
        }

        const genChallengeId = () => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let id = '';
            for (let i = 0; i < 12; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
            return id;
        };

        const challengeRow = {
            challenge_id: genChallengeId(),
            challenger_id: challengerId,
            challenger_song_id: song.id,
            challenger_song_name: song.name,
            challenger_song_artist: song.artist,
            challenger_song_image: song.image || null,
            challenger_song_preview: song.preview || null,
            bet_amount: normalizedBet,
            status: 'pending',
            stake_type: 'bonus',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
        if (genreId) {
            challengeRow.genre_id = genreId;
            challengeRow.genre_label = genreLabel || genreId;
        }

        let { data: challenge, error: insertError } = await supabase
            .from('social_challenges')
            .insert([challengeRow])
            .select()
            .single();

        // Igual que createSocialChallenge() en game-engine.js: si la
        // migración de género todavía no corrió, reintentar sin esas
        // columnas en vez de romper la creación por un dato opcional.
        if (insertError && genreId && String(insertError.message || '').indexOf('genre') !== -1) {
            delete challengeRow.genre_id;
            delete challengeRow.genre_label;
            ({ data: challenge, error: insertError } = await supabase
                .from('social_challenges')
                .insert([challengeRow])
                .select()
                .single());
        }

        if (insertError) {
            // Ya se descontó el bono -- si falla crear el desafío, devolverlo.
            await supabase.rpc('increment_bonus_credits', {
                user_id_param: challengerId,
                credits_to_add: normalizedBet,
                new_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            }).catch(() => {});
            console.error('[social-bonus-create] Error creando el desafío:', insertError);
            return res.status(500).json({ error: 'No se pudo crear el desafío de prueba' });
        }

        res.json({ ok: true, challenge });
    } catch (error) {
        console.error('[social-bonus-create] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Antes de aceptar un Desafío Social 'bonus', el invitado puede no tener
 * (o no tener suficiente) saldo de prueba -- ni siquiera cuenta, si es la
 * primera vez que entra. Este endpoint lo revisa y, si hace falta, le
 * otorga automáticamente un bono exacto para poder aceptar (registrado en
 * bonus_grants con granted_by='system_auto', para que quede auditado
 * igual que uno manual). No acepta el desafío por sí solo -- el cliente
 * sigue llamando después al flujo normal de aceptar, ya con saldo.
 */
app.post('/api/social-challenges/:challengeId/ensure-bonus-balance', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });
        const { challengeId } = req.params;
        const { walletAddress } = req.body;

        const { data: challenge, error: challengeError } = await supabase
            .from('social_challenges')
            .select('id, challenge_id, status, bet_amount, stake_type')
            .eq('challenge_id', challengeId)
            .maybeSingle();
        if (challengeError || !challenge) return res.status(404).json({ error: 'Desafío no encontrado' });
        if (challenge.stake_type !== 'bonus') {
            return res.json({ ok: true, toppedUp: false, reason: 'not_a_bonus_challenge' });
        }
        if (challenge.status !== 'pending') {
            return res.status(400).json({ error: 'Este desafío ya no está pendiente' });
        }

        const resolved = await resolveCreditsUserId(supabase, {
            getUserIdFromWallet: (addr) => walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null
        }, req.authUser, walletAddress || null);
        const accepterId = resolved.userId;

        const { data: creditsRow } = await supabase
            .from('user_credits')
            .select('bonus_credits, bonus_expires_at')
            .eq('user_id', accepterId)
            .maybeSingle();

        const currentBonus = parseFloat(creditsRow?.bonus_credits || 0);
        const expired = creditsRow?.bonus_expires_at && new Date(creditsRow.bonus_expires_at) < new Date();
        const needed = parseFloat(challenge.bet_amount);

        if (!expired && currentBonus >= needed) {
            return res.json({ ok: true, toppedUp: false });
        }

        const topUpAmount = expired ? needed : (needed - currentBonus);
        const expiresAt = new Date(Date.now() + BONUS_INVITE_DEFAULT_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const { error: rpcError } = await supabase.rpc('increment_bonus_credits', {
            user_id_param: accepterId,
            credits_to_add: topUpAmount,
            new_expires_at: expiresAt
        });
        if (rpcError) {
            console.error('[ensure-bonus-balance] increment_bonus_credits falló:', rpcError);
            return res.status(500).json({ error: 'No se pudo preparar tu saldo de prueba' });
        }

        await supabase.from('bonus_grants').insert([{
            user_id: accepterId,
            amount: topUpAmount,
            bonus_type: 'social_challenge_invite',
            granted_by: 'system_auto',
            note: `Auto-otorgado al abrir el desafío de prueba ${challengeId}`,
            expires_at: expiresAt,
            status: 'active'
        }]);

        res.json({ ok: true, toppedUp: true, amount: topUpAmount, expiresAt });
    } catch (error) {
        console.error('[ensure-bonus-balance] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// ARTISTAS -- FASE 1 (ver artist-royalties-system.sql)
// Registro + reclamo de canciones + regalías de impulso acumuladas por
// batalla real ganada. royalty_credits es un acumulado NO retirable
// todavía -- award-winner (arriba) lo va sumando solo cuando la canción
// ganadora está reclamada y VERIFICADA. La verificación (de artista y de
// cada canción) es manual, vía el panel admin, con requireInternalSecret
// -- ningún cliente puede auto-verificarse ni tocar royalty_credits.
// ============================================================

/** Registra al usuario autenticado como artista (queda en 'pending' hasta revisión manual). */
app.post('/api/artists/register', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });
        const { displayName, contactEmail, spotifyUrl, instagramUrl } = req.body;
        if (!displayName || !String(displayName).trim()) {
            return res.status(400).json({ error: 'Falta el nombre artístico' });
        }

        const { data: existing } = await supabase
            .from('artists')
            .select('id')
            .eq('user_id', req.authUser.id)
            .maybeSingle();
        if (existing) {
            return res.status(400).json({ error: 'Ya tenés un perfil de artista registrado' });
        }

        const { data: artist, error } = await supabase
            .from('artists')
            .insert([{
                user_id: req.authUser.id,
                display_name: String(displayName).trim().slice(0, 120),
                contact_email: contactEmail || req.authUser.email || null,
                spotify_url: spotifyUrl || null,
                instagram_url: instagramUrl || null,
                verification_status: 'pending'
            }])
            .select()
            .single();

        if (error) {
            console.error('[artists-register] Error:', error);
            return res.status(500).json({ error: 'No se pudo registrar el perfil de artista' });
        }

        res.json({ ok: true, artist });
    } catch (error) {
        console.error('[artists-register] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/** Reclama una canción (mismo song_id de Deezer que usan las batallas). Queda en 'pending' hasta revisión. */
app.post('/api/artists/claim-song', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });
        const { songId, songName, songArtist, songImage } = req.body;
        if (!songId || !songName || !songArtist) {
            return res.status(400).json({ error: 'Falta songId, songName o songArtist' });
        }

        const { data: artist } = await supabase
            .from('artists')
            .select('id')
            .eq('user_id', req.authUser.id)
            .maybeSingle();
        if (!artist) {
            return res.status(400).json({ error: 'Registrate como artista primero (/api/artists/register)' });
        }

        const { data: alreadyClaimed } = await supabase
            .from('artist_songs')
            .select('id, artist_id')
            .eq('song_id', songId)
            .maybeSingle();
        if (alreadyClaimed) {
            return res.status(400).json({
                error: alreadyClaimed.artist_id === artist.id
                    ? 'Ya reclamaste esta canción'
                    : 'Esta canción ya fue reclamada por otro perfil de artista'
            });
        }

        const { data: song, error } = await supabase
            .from('artist_songs')
            .insert([{
                artist_id: artist.id,
                song_id: songId,
                song_name: String(songName).slice(0, 200),
                song_artist: String(songArtist).slice(0, 200),
                song_image: songImage || null,
                status: 'pending'
            }])
            .select()
            .single();

        if (error) {
            console.error('[artists-claim-song] Error:', error);
            return res.status(500).json({ error: 'No se pudo reclamar la canción' });
        }

        res.json({ ok: true, song });
    } catch (error) {
        console.error('[artists-claim-song] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/** Perfil propio del artista autenticado: datos, canciones reclamadas, regalías acumuladas. */
app.get('/api/artists/me', requireCreditMutationAuth, async (req, res) => {
    try {
        if (!req.authUser) return res.status(401).json({ error: 'Inicia sesión primero.' });

        const { data: artist } = await supabase
            .from('artists')
            .select('*')
            .eq('user_id', req.authUser.id)
            .maybeSingle();
        if (!artist) {
            return res.json({ ok: true, artist: null, songs: [] });
        }

        const { data: songs } = await supabase
            .from('artist_songs')
            .select('*')
            .eq('artist_id', artist.id)
            .order('created_at', { ascending: false });

        res.json({ ok: true, artist, songs: songs || [] });
    } catch (error) {
        console.error('[artists-me] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/** Panel admin: artistas y canciones esperando revisión manual. */
app.get('/api/admin/artists/pending', requireInternalSecret, async (req, res) => {
    try {
        const { data: pendingArtists } = await supabase
            .from('artists')
            .select('*')
            .eq('verification_status', 'pending')
            .order('created_at', { ascending: false });

        const { data: pendingSongs } = await supabase
            .from('artist_songs')
            .select('*, artists(display_name, user_id)')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        res.json({ ok: true, artists: pendingArtists || [], songs: pendingSongs || [] });
    } catch (error) {
        console.error('[admin-artists-pending] Error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/** Panel admin: aprobar/rechazar un perfil de artista. */
app.post('/api/admin/artists/:id/verify', requireInternalSecret, async (req, res) => {
    try {
        const { id } = req.params;
        const { approve, note } = req.body;
        const status = approve ? 'verified' : 'rejected';

        const { data: artist, error } = await supabase
            .from('artists')
            .update({
                verification_status: status,
                verification_note: note || null,
                verified_at: approve ? new Date().toISOString() : null
            })
            .eq('id', id)
            .select()
            .single();

        if (error) return res.status(500).json({ ok: false, error: error.message });
        res.json({ ok: true, artist });
    } catch (error) {
        console.error('[admin-artists-verify] Error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

/** Panel admin: aprobar/rechazar el reclamo de una canción. */
app.post('/api/admin/artist-songs/:id/verify', requireInternalSecret, async (req, res) => {
    try {
        const { id } = req.params;
        const { approve } = req.body;
        const status = approve ? 'verified' : 'rejected';

        const { data: song, error } = await supabase
            .from('artist_songs')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) return res.status(500).json({ ok: false, error: error.message });
        res.json({ ok: true, song });
    } catch (error) {
        console.error('[admin-artist-songs-verify] Error:', error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

try {
    const { registerPrizeRoutes } = require('./prize-api');
    registerPrizeRoutes(app, supabase);
    console.log('[server] Registered POST /api/prizes/send (wallet validado contra participantes del match)');
} catch (prizeRegErr) {
    console.warn('[server] Prize routes not registered:', prizeRegErr.message);
}

try {
    const { registerBattleBetsRoutes } = require('./battle-bets-api');
    registerBattleBetsRoutes(app, supabase, walletLinkService);
    console.log('[server] Registered POST /api/battles/:battleId/bet and /settle (modelo 80/10/10)');
} catch (battleBetsRegErr) {
    console.warn('[server] Battle bets routes not registered:', battleBetsRegErr.message);
}

try {
    const { registerSiweRoutes } = require('./siwe-auth');
    registerSiweRoutes(app, walletLinkService);
    console.log('[server] Registered POST /api/auth/wallet/nonce and /verify (login por firma de wallet)');
} catch (siweRegErr) {
    console.warn('[server] SIWE routes not registered:', siweRegErr.message);
}

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
            price: '/api/price',
            nowpaymentsIpn: '/webhook/nowpayments',
            nowpaymentsWidgetConfig: '/api/public/nowpayments-widget-config',
            nowpaymentsCreatePayment: 'POST /api/payments/nowpayments/create (alias: POST /nowpayments/create)',
            prizeSend: '/api/prizes/send'
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
        originalUrl: req.originalUrl,
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
