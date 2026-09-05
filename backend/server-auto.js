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
const corsOptions = {
    origin: [
        'https://www.musictokenring.xyz',
        'https://musictokenring.xyz',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:5500',
        'http://127.0.0.1:3000',
        'http://localhost:8000',
        'http://127.0.0.1:8000'
    ],
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
            .select('id, status, winner, player1_id, player2_id, total_pot, match_type')
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
        res.json({ ok: true, winnerUserId: targetUserId, credited: winnerPayout, platformFee });
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

            // Mismo orden seguro que cancelSocialChallenge() en el cliente:
            // reembolsar primero, y solo si el UPDATE atómico condicionado
            // a status='pending' efectivamente "gana la carrera" (nadie más
            // lo aceptó/canceló/expiró mientras tanto) dar el reembolso por
            // bueno. Si el UPDATE no afecta ninguna fila, revertir el
            // reembolso para no acreditar doble.
            const { error: creditError } = await supabase.rpc('increment_user_credits', {
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
                    await supabase.rpc('decrement_user_credits', {
                        user_id_param: challenge.challenger_id,
                        credits_to_subtract: betAmount
                    });
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
            genre_label: challenge.genre_label || null
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
