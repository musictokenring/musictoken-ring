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
        let transferLogs = [];
        
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
                        return res.status(404).json({ 
                            error: 'Transaction not found',
                            message: 'La transacción no se encontró en la red Base. Verifica que el hash sea correcto y pertenezca a la red Base. Si la transacción fue reciente, espera unos momentos e intenta nuevamente.'
                        });
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
            
            // Si no se encuentra por hash, buscar depósitos recientes de la wallet del usuario
            // (útil si el hash está mal copiado pero el depósito existe)
            const walletAddress = req.query.walletAddress || req.headers['x-wallet-address'];
            if (walletAddress) {
                console.log('[diagnose] Hash not found, searching recent deposits for wallet:', walletAddress);
                
                const { data: recentDeposits, error: recentError } = await supabase
                    .from('deposits')
                    .select('*, users!inner(wallet_address)')
                    .eq('users.wallet_address', walletAddress.toLowerCase())
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
                    
                    // Si no hay coincidencia exacta, devolver los depósitos recientes para que el usuario pueda verificar
                    return res.json({
                        processed: false,
                        hashNotFound: true,
                        recentDeposits: recentDeposits.map(d => ({
                            tx_hash: d.tx_hash,
                            amount: d.amount,
                            token: d.token,
                            credits_awarded: d.credits_awarded,
                            created_at: d.created_at,
                            status: d.status
                        })),
                        message: 'Hash no encontrado, pero se encontraron depósitos recientes para esta wallet. Verifica si alguno de estos es el que buscas.'
                    });
                }
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
            transferLogs = mtrLogs;
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
