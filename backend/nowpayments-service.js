/**
 * NOWPayments Integration Service
 * Handles deposits via widget and withdrawals via Mass Payouts API
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { TradingFundService } = require('./trading-fund-service');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// NOWPayments: claves solo vía entorno (NOWPAYMENTS_WEBHOOK_SECRET = firma IPN)
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || '';
const NOWPAYMENTS_IPN_SECRET =
    process.env.NOWPAYMENTS_WEBHOOK_SECRET ||
    process.env.IPN_SECRET ||
    process.env.NOWPAYMENTS_IPN_SECRET ||
    '';
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';
const TRADING_FUND_WALLET = process.env.TRADING_FUND_WALLET || '';
const CUSTODY_ENABLED = process.env.CUSTODY_ENABLED === 'true';
/** Retiros/premios: USDT TRC20 por defecto si Custody + Tron; override con NOWPAYOUT_CURRENCY */
const NOWPAYOUT_CURRENCY = process.env.NOWPAYOUT_CURRENCY || 'USDTTRC20';
const NOWPAYOUT_CHAIN = process.env.NOWPAYOUT_CHAIN || '';
/**
 * Piso en USD solicitado por el usuario (antes del ajuste de red). El servidor puede subir
 * ligeramente el importe enviado a NOWPayments (ver adjustUsdForNowpaymentsCryptoMinimum).
 */
const MIN_DEPOSIT_USD_FLOOR = 1;
const MIN_DEPOSIT_UNITS = Math.max(
    MIN_DEPOSIT_USD_FLOOR,
    parseFloat(process.env.NOWPAYMENTS_MIN_PAY_AMOUNT || String(MIN_DEPOSIT_USD_FLOOR)) ||
        MIN_DEPOSIT_USD_FLOOR
);
/** Moneda en la que el usuario paga (API /payment). NOWPayments exige pay_currency en muchas cuentas. */
const NOWPAYMENTS_PAY_CURRENCY =
    (process.env.NOWPAYMENTS_PAY_CURRENCY || 'usdttrc20').trim().toLowerCase();

/**
 * URL de checkout en respuestas POST/GET /v1/payment (nombres y nesting varían).
 */
function extractNowpaymentsCheckoutUrl(data) {
    if (!data || typeof data !== 'object') return null;
    const nested =
        data.data && typeof data.data === 'object' ? data.data : null;
    const layers = nested ? [data, nested] : [data];
    for (const layer of layers) {
        const candidates = [
            layer.invoice_url,
            layer.pay_url,
            layer.payment_url,
            layer.url,
            layer.invoiceUrl,
            layer.checkout_url,
            layer.payment_extra &&
                typeof layer.payment_extra === 'object' &&
                layer.payment_extra.invoice_url,
            layer.payment_extra &&
                typeof layer.payment_extra === 'object' &&
                layer.payment_extra.pay_url
        ];
        for (const c of candidates) {
            if (typeof c === 'string' && /^https?:\/\//i.test(c.trim())) {
                return c.trim();
            }
        }
    }
    return null;
}

/**
 * Si la extracción directa falla, busca cualquier URL https en campos típicos de checkout.
 */
function deepFindNowpaymentsCheckoutUrl(obj, depth) {
    const d = depth == null ? 0 : depth;
    if (d > 5 || !obj || typeof obj !== 'object') return null;
    for (const [k, v] of Object.entries(obj)) {
        const kl = k.toLowerCase();
        if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) {
            if (
                kl.includes('url') ||
                kl.includes('link') ||
                kl.includes('invoice') ||
                kl.includes('checkout')
            ) {
                return v.trim();
            }
        }
        if (v && typeof v === 'object') {
            const inner = deepFindNowpaymentsCheckoutUrl(v, d + 1);
            if (inner) return inner;
        }
    }
    return null;
}

/**
 * NOWPayments convierte price_amount USD a pay_currency; el monto cripto suele quedar
 * un poco por debajo del entero mínimo (ej. 4 USD → 3,995 USDT, mínimo 4). Subimos el USD
 * enviado con un pequeño colchón configurable.
 */
function adjustUsdForNowpaymentsCryptoMinimum(usd) {
    const n = Number(usd);
    if (!Number.isFinite(n) || n <= 0) return n;
    const pct =
        parseFloat(process.env.NOWPAYMENTS_MIN_PAY_BUFFER_PCT || '0.008') || 0.008;
    const flat =
        parseFloat(process.env.NOWPAYMENTS_MIN_PAY_BUFFER_USD || '0.06') || 0.06;
    const out = n * (1 + Math.max(0, pct)) + Math.max(0, flat);
    return Math.round(out * 100) / 100;
}

const { isValidPayoutAddress } = require('./platform-addresses');

// Fee distribution: 75% vault, 25% trading fund
const VAULT_FEE_PERCENTAGE = 75;
const TRADING_FUND_FEE_PERCENTAGE = 25;

// Deposit fee: 5%
const DEPOSIT_FEE_RATE = 0.05;
// Credit rate: 95% of deposit (after 5% fee)
const CREDIT_RATE = 0.95;

class NOWPaymentsService {
    constructor() {
        this.tradingFundService = new TradingFundService();
    }

    normalizeIncomingAmount(data) {
        const candidates = [
            data.actually_paid,
            data.pay_amount,
            data.price_amount,
            data.outcome_amount
        ];
        for (const c of candidates) {
            const n = parseFloat(c);
            if (Number.isFinite(n) && n > 0) return n;
        }
        return 0;
    }

    isFinishedPaymentStatus(status) {
        const s = (status || '').toLowerCase();
        return s === 'finished' || s === 'confirmed' || s === 'completed';
    }

    /**
     * Extrae UUID de usuario desde order_id (API comercial usa mtr_<uuid>_<ts> o solo uuid).
     * @param {string|null|undefined} orderId
     * @returns {string|null}
     */
    parseUserIdFromOrderId(orderId) {
        if (orderId == null || orderId === '') return null;
        const s = String(orderId).trim();
        const m = s.match(
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
        );
        return m ? m[0] : null;
    }

    /**
     * Pago comercial vía API oficial POST /v1/payment (Postman / documentación NOWPayments).
     * Devuelve URL de checkout (invoice) para iframe o nueva pestaña.
     * @param {Object} p
     * @param {string} p.publicUserId - users.id (UUID)
     * @param {number} p.priceAmountUsd
     * @param {string} p.successUrl
     * @param {string} p.cancelUrl
     * @param {string} [p.payCurrency] - override opcional (default NOWPAYMENTS_PAY_CURRENCY)
     * @returns {Promise<{ payment_id: string|number, pay_url: string, order_id: string }>}
     */
    async createCommercialPayment({
        publicUserId,
        priceAmountUsd,
        successUrl,
        cancelUrl,
        payCurrency
    }) {
        if (!NOWPAYMENTS_API_KEY) {
            throw new Error('NOWPayments API key not configured');
        }
        const amount = Number(priceAmountUsd);
        if (!Number.isFinite(amount) || amount < MIN_DEPOSIT_UNITS) {
            throw new Error(`Minimum amount is ${MIN_DEPOSIT_UNITS} USD`);
        }
        if (amount > 500000) {
            throw new Error('Amount exceeds maximum (500000 USD)');
        }
        const requestedUsd = amount;
        const priceAmountToSend = adjustUsdForNowpaymentsCryptoMinimum(amount);
        const baseUrl =
            process.env.BACKEND_URL ||
            process.env.RENDER_EXTERNAL_URL ||
            'https://musictoken-ring.onrender.com';
        const ipnUrl = `${String(baseUrl).replace(/\/$/, '')}/webhook/nowpayments`;
        const orderId = `mtr_${publicUserId}_${Date.now()}`;
        const payCur = (payCurrency && String(payCurrency).trim()) || NOWPAYMENTS_PAY_CURRENCY;
        if (!payCur) {
            throw new Error('pay_currency is required (set NOWPAYMENTS_PAY_CURRENCY on server)');
        }
        const buildPaymentBody = (usd) => ({
            price_amount: usd,
            price_currency: 'usd',
            pay_currency: payCur,
            ipn_callback_url: ipnUrl,
            order_id: orderId,
            order_description: 'MusicToken Ring — depósito de saldo',
            success_url: successUrl,
            cancel_url: cancelUrl,
            is_fixed_rate: false,
            is_fee_paid_by_user: false
        });
        let priceAmountFinal = priceAmountToSend;
        let body = buildPaymentBody(priceAmountFinal);
        let res = await fetch(`${NOWPAYMENTS_API_URL}/payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': NOWPAYMENTS_API_KEY
            },
            body: JSON.stringify(body)
        });
        let data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg0 =
                data.message ||
                data.error ||
                (typeof data === 'string' ? data : JSON.stringify(data));
            if (/less than minimal/i.test(String(msg0))) {
                priceAmountFinal = Math.round((priceAmountFinal * 1.05 + 0.2) * 100) / 100;
                body = buildPaymentBody(priceAmountFinal);
                res = await fetch(`${NOWPAYMENTS_API_URL}/payment`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': NOWPAYMENTS_API_KEY
                    },
                    body: JSON.stringify(body)
                });
                data = await res.json().catch(() => ({}));
            }
        }
        if (!res.ok) {
            const msg =
                data.message ||
                data.error ||
                (typeof data === 'string' ? data : JSON.stringify(data));
            throw new Error(`NOWPayments: ${res.status} ${msg}`);
        }
        let payUrl =
            extractNowpaymentsCheckoutUrl(data) || deepFindNowpaymentsCheckoutUrl(data);
        const paymentId = data.payment_id;
        if (!payUrl && paymentId != null && paymentId !== '') {
            const resPoll = await fetch(
                `${NOWPAYMENTS_API_URL}/payment/${encodeURIComponent(String(paymentId))}`,
                {
                    method: 'GET',
                    headers: { 'x-api-key': NOWPAYMENTS_API_KEY }
                }
            );
            const polled = await resPoll.json().catch(() => ({}));
            if (resPoll.ok) {
                payUrl =
                    extractNowpaymentsCheckoutUrl(polled) ||
                    deepFindNowpaymentsCheckoutUrl(polled);
            } else {
                console.error(
                    '[nowpayments] GET /payment/:id failed:',
                    resPoll.status,
                    polled
                );
            }
        }
        if (!payUrl) {
            console.error(
                '[nowpayments] Sin URL de checkout. POST keys:',
                Object.keys(data),
                'sample:',
                JSON.stringify(data).slice(0, 1200)
            );
            throw new Error('NOWPayments did not return invoice_url / pay_url');
        }
        return {
            payment_id: data.payment_id,
            pay_url: payUrl,
            order_id: orderId,
            payment_status: data.payment_status,
            requested_price_amount_usd: requestedUsd,
            price_amount_usd: priceAmountFinal
        };
    }

    /**
     * IPN NOWPayments: HMAC-SHA512 del body en crudo con NOWPAYMENTS_WEBHOOK_SECRET;
     * comparación timing-safe del hex en x-nowpayments-sig.
     * @param {string} payload - Raw request body
     * @param {string} signature - x-nowpayments-sig header
     * @returns {boolean}
     */
    verifyIPNSignature(payload, signature) {
        if (!NOWPAYMENTS_IPN_SECRET || !signature) {
            console.error('[nowpayments] ⚠️ IPN secret or signature missing');
            return false;
        }

        const hmac = crypto.createHmac('sha512', NOWPAYMENTS_IPN_SECRET);
        hmac.update(typeof payload === 'string' ? payload : String(payload));
        const expectedHex = hmac.digest('hex');
        const sig = String(signature).trim();
        const a = Buffer.from(sig, 'hex');
        const b = Buffer.from(expectedHex, 'hex');
        if (a.length !== b.length || a.length === 0) {
            return false;
        }
        return crypto.timingSafeEqual(a, b);
    }

    /**
     * Process deposit webhook notification
     * @param {Object} paymentData - Payment data from NOWPayments
     * @returns {Promise<Object>}
     */
    async processDeposit(paymentData) {
        try {
            console.log('[nowpayments] Processing deposit:', {
                payment_id: paymentData.payment_id,
                status: paymentData.payment_status,
                amount: paymentData.pay_amount,
                currency: paymentData.pay_currency
            });

            if (!this.isFinishedPaymentStatus(paymentData.payment_status)) {
                console.log('[nowpayments] Payment not finished, status:', paymentData.payment_status);
                return { processed: false, reason: 'Payment not finished' };
            }

            // Check idempotency (prevent duplicate processing)
            const { data: existingDeposit } = await supabase
                .from('deposits')
                .select('id')
                .eq('tx_hash', paymentData.payment_id)
                .maybeSingle();

            if (existingDeposit) {
                console.log('[nowpayments] Deposit already processed:', paymentData.payment_id);
                return { processed: false, reason: 'Already processed', deposit: existingDeposit };
            }

            // CRÍTICO: Extract user identifiers from payment metadata
            // NOWPayments widget passes email/wallet/order_id (user_id) in the payment
            const userEmail = paymentData.email || paymentData.pay_currency_extra_id || null;
            const userWallet = paymentData.wallet || paymentData.pay_currency_extra_id || null;
            const userIdFromOrder = this.parseUserIdFromOrderId(paymentData.order_id);

            const depositAmount = this.normalizeIncomingAmount(paymentData);
            if (depositAmount < MIN_DEPOSIT_UNITS) {
                throw new Error(`Deposit amount too small (min ${MIN_DEPOSIT_UNITS})`);
            }

            const depositFee = depositAmount * DEPOSIT_FEE_RATE; // 5%
            const creditsAwarded = depositAmount * CREDIT_RATE; // 95%

            // Distribute fee: 75% vault, 25% trading fund
            const vaultFeeAmount = depositFee * (VAULT_FEE_PERCENTAGE / 100);
            const tradingFundFeeAmount = depositFee * (TRADING_FUND_FEE_PERCENTAGE / 100);

            // CRÍTICO: Find user by user_id (order_id), email, or wallet
            // PRIORIDAD: user_id > email > wallet
            let userId = null;
            
            // PRIORIDAD 1: Si viene user_id directamente (order_id), usarlo
            if (userIdFromOrder) {
                const { data: user } = await supabase
                    .from('users')
                    .select('id')
                    .eq('id', userIdFromOrder)
                    .maybeSingle();
                
                if (user) {
                    userId = user.id;
                    console.log('[nowpayments] ✅ Usuario encontrado por user_id:', userId);
                }
            }
            
            // PRIORIDAD 2: Buscar por email si no se encontró por user_id
            if (!userId && userEmail) {
                const { data: user } = await supabase
                    .from('users')
                    .select('id')
                    .ilike('email', userEmail)
                    .maybeSingle();

                if (user) {
                    userId = user.id;
                    console.log('[nowpayments] ✅ Usuario encontrado por email:', userEmail);
                }
            }
            
            // PRIORIDAD 3: Buscar por wallet si no se encontró por email
            if (!userId && userWallet) {
                const { data: user } = await supabase
                    .from('users')
                    .select('id')
                    .ilike('wallet_address', userWallet)
                    .maybeSingle();

                if (user) {
                    userId = user.id;
                    console.log('[nowpayments] ✅ Usuario encontrado por wallet:', userWallet);
                }
            }

            // CRÍTICO: Si no se encuentra usuario, RECHAZAR el pago
            // NO crear depósitos pendientes - el usuario DEBE estar autenticado antes de pagar
            if (!userId) {
                console.error('[nowpayments] ❌ PAGO RECHAZADO: Usuario no encontrado', {
                    userEmail,
                    userWallet,
                    userIdFromOrder,
                    payment_id: paymentData.payment_id
                });
                
                // Registrar el rechazo para auditoría
                await supabase
                    .from('deposits')
                    .insert({
                        tx_hash: paymentData.payment_id,
                        wallet_address: userWallet || null,
                        amount: depositAmount,
                        token: (paymentData.pay_currency || 'USDT').toString().slice(0, 32),
                        credits_awarded: 0,
                        status: 'rejected_no_user',
                        payment_id: paymentData.payment_id,
                        payment_data: {
                            ...paymentData,
                            rejection_reason: 'User not authenticated or not found in system',
                            user_email: userEmail,
                            user_wallet: userWallet,
                            user_id_from_order: userIdFromOrder
                        },
                        created_at: new Date().toISOString()
                    });

                return {
                    processed: false,
                    reason: 'User not authenticated',
                    rejected: true,
                    message: 'Payment rejected: User must be authenticated before making a deposit. Please contact support if you believe this is an error.'
                };
            }

            // Award credits to user
            const { error: creditError } = await supabase.rpc('increment_user_credits', {
                user_id_param: userId,
                amount_param: creditsAwarded
            });

            if (creditError) {
                throw new Error(`Failed to award credits: ${creditError.message}`);
            }

            // Record deposit
            const { data: deposit, error: depositError } = await supabase
                .from('deposits')
                .insert({
                    tx_hash: paymentData.payment_id,
                    wallet_address: userWallet || null,
                    user_id: userId,
                    amount: depositAmount,
                    token: (paymentData.pay_currency || 'USDT').toString().slice(0, 32),
                    credits_awarded: creditsAwarded,
                    fee_amount: depositFee,
                    vault_fee: vaultFeeAmount,
                    trading_fund_fee: tradingFundFeeAmount,
                    status: 'processed',
                    payment_id: paymentData.payment_id,
                    payment_data: paymentData,
                    processed_at: new Date().toISOString(),
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (depositError) {
                throw new Error(`Failed to record deposit: ${depositError.message}`);
            }

            // Update vault balance (DB tracking)
            const { error: vaultError } = await supabase.rpc('update_vault_balance', {
                amount_param: vaultFeeAmount,
                transaction_type_param: 'deposit_fee'
            });

            if (vaultError) {
                console.error('[nowpayments] Failed to update vault balance:', vaultError);
                // Non-critical, continue
            }

            // Update trading fund balance (DB tracking)
            if (TRADING_FUND_WALLET && tradingFundFeeAmount > 0) {
                const { error: tradingFundError } = await supabase.rpc('update_trading_fund_balance', {
                    amount_param: tradingFundFeeAmount,
                    transaction_type_param: 'deposit_fee'
                });

                if (tradingFundError) {
                    console.error('[nowpayments] Failed to update trading fund balance:', tradingFundError);
                    // Non-critical, continue
                }
            }

            console.log('[nowpayments] ✅ Deposit processed successfully:', {
                payment_id: paymentData.payment_id,
                userId,
                creditsAwarded,
                depositFee,
                vaultFee: vaultFeeAmount,
                tradingFundFee: tradingFundFeeAmount
            });

            return {
                processed: true,
                deposit,
                creditsAwarded,
                fee: depositFee
            };

        } catch (error) {
            console.error('[nowpayments] ❌ Error processing deposit:', error);
            throw error;
        }
    }

    /**
     * Create withdrawal payout via Mass Payouts API
     * @param {string} userWallet - User wallet address
     * @param {number} creditsAmount - Amount in credits to withdraw
     * @param {string} userId - User ID
     * @returns {Promise<Object>}
     */
    async createWithdrawal(userWallet, creditsAmount, userId) {
        try {
            console.log('[nowpayments] Creating withdrawal:', {
                userWallet,
                creditsAmount,
                userId
            });

            if (!isValidPayoutAddress(userWallet)) {
                throw new Error('Invalid payout address (use Base 0x… o Tron T…)');
            }

            // Validate user balance
            const { data: userCredits } = await supabase
                .from('user_credits')
                .select('credits')
                .eq('user_id', userId)
                .single();

            if (!userCredits || userCredits.credits < creditsAmount) {
                throw new Error('Insufficient credits');
            }

            // Validate vault balance (DB tracking)
            const { data: vaultBalance } = await supabase
                .from('vault_balance')
                .select('balance')
                .single();

            const usdcAmount = creditsAmount; // 1 crédito = 1 USD nominal (USDC en Base si NOWPAYOUT_USE_USDC_BASE)
            const withdrawalFee = usdcAmount * DEPOSIT_FEE_RATE; // 5%
            const payoutAmount = usdcAmount - withdrawalFee; // 95% USD nominal

            if (!vaultBalance || vaultBalance.balance < usdcAmount) {
                throw new Error('Insufficient vault balance');
            }

            // Distribute fee: 75% vault, 25% trading fund
            const vaultFeeAmount = withdrawalFee * (VAULT_FEE_PERCENTAGE / 100);
            const tradingFundFeeAmount = withdrawalFee * (TRADING_FUND_FEE_PERCENTAGE / 100);

            const payoutBody =
                process.env.NOWPAYOUT_USE_USDC_BASE === 'true'
                    ? {
                          currency: 'USDC',
                          chain: 'BASE',
                          recipients: [
                              { address: userWallet, amount: payoutAmount.toFixed(6) }
                          ]
                      }
                    : {
                          currency: NOWPAYOUT_CURRENCY,
                          ...(NOWPAYOUT_CHAIN ? { chain: NOWPAYOUT_CHAIN } : {}),
                          recipients: [
                              { address: userWallet, amount: payoutAmount.toFixed(8) }
                          ]
                      };

            if (CUSTODY_ENABLED) {
                console.log('[nowpayments] Custody payout currency:', payoutBody.currency);
            }

            const payoutResponse = await fetch(`${NOWPAYMENTS_API_URL}/payout/create`, {
                method: 'POST',
                headers: {
                    'x-api-key': NOWPAYMENTS_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payoutBody)
            });

            if (!payoutResponse.ok) {
                const errorData = await payoutResponse.json().catch(() => ({}));
                throw new Error(`NOWPayments API error: ${payoutResponse.status} - ${JSON.stringify(errorData)}`);
            }

            const payoutData = await payoutResponse.json();
            const payoutId = payoutData.payout_id || payoutData.id;

            console.log('[nowpayments] Payout created:', payoutId);

            // Deduct credits from user
            const { error: deductError } = await supabase.rpc('increment_user_credits', {
                user_id_param: userId,
                amount_param: -creditsAmount // Negative to deduct
            });

            if (deductError) {
                throw new Error(`Failed to deduct credits: ${deductError.message}`);
            }

            // Record withdrawal claim
            const { data: claim, error: claimError } = await supabase
                .from('claims')
                .insert({
                    user_id: userId,
                    wallet_address: userWallet,
                    amount_mtr: creditsAmount,
                    amount_usdc: payoutAmount,
                    fee_amount: withdrawalFee,
                    vault_fee: vaultFeeAmount,
                    trading_fund_fee: tradingFundFeeAmount,
                    status: 'processing',
                    payout_id: payoutId,
                    payout_data: payoutData,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (claimError) {
                throw new Error(`Failed to record claim: ${claimError.message}`);
            }

            // Update vault balance (deduct payout amount + add vault fee)
            const vaultNetChange = -payoutAmount + vaultFeeAmount;
            const { error: vaultError } = await supabase.rpc('update_vault_balance', {
                amount_param: vaultNetChange,
                transaction_type_param: 'withdrawal'
            });

            if (vaultError) {
                console.error('[nowpayments] Failed to update vault balance:', vaultError);
                // Non-critical, continue
            }

            // Update trading fund balance
            if (TRADING_FUND_WALLET && tradingFundFeeAmount > 0) {
                const { error: tradingFundError } = await supabase.rpc('update_trading_fund_balance', {
                    amount_param: tradingFundFeeAmount,
                    transaction_type_param: 'withdrawal_fee'
                });

                if (tradingFundError) {
                    console.error('[nowpayments] Failed to update trading fund balance:', tradingFundError);
                    // Non-critical, continue
                }
            }

            // Start polling payout status
            this.pollPayoutStatus(payoutId, claim.id, userId);

            return {
                success: true,
                payoutId,
                claim,
                payoutAmount,
                fee: withdrawalFee
            };

        } catch (error) {
            console.error('[nowpayments] ❌ Error creating withdrawal:', error);
            throw error;
        }
    }

    /**
     * Envío desde Custody (premios): no descuenta créditos de usuario en Supabase.
     */
    async createCustodyPayout(recipientAddress, amountUsd, metadata = {}) {
        if (!NOWPAYMENTS_API_KEY) {
            throw new Error('NOWPAYMENTS_API_KEY is required');
        }
        if (!CUSTODY_ENABLED) {
            console.warn('[nowpayments] CUSTODY_ENABLED is not true — el payout puede fallar en NOWPayments');
        }
        if (!isValidPayoutAddress(recipientAddress)) {
            throw new Error('Invalid recipient for Custody payout');
        }
        const amt = Number(amountUsd);
        if (!Number.isFinite(amt) || amt <= 0) {
            throw new Error('Invalid payout amount');
        }
        const payoutBody =
            process.env.NOWPAYOUT_USE_USDC_BASE === 'true'
                ? {
                      currency: 'USDC',
                      chain: 'BASE',
                      recipients: [{ address: recipientAddress, amount: amt.toFixed(6) }]
                  }
                : {
                      currency: NOWPAYOUT_CURRENCY,
                      ...(NOWPAYOUT_CHAIN ? { chain: NOWPAYOUT_CHAIN } : {}),
                      recipients: [{ address: recipientAddress, amount: amt.toFixed(8) }]
                  };

        const payoutResponse = await fetch(`${NOWPAYMENTS_API_URL}/payout/create`, {
            method: 'POST',
            headers: {
                'x-api-key': NOWPAYMENTS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ...payoutBody, metadata })
        });

        if (!payoutResponse.ok) {
            const err = await payoutResponse.json().catch(() => ({}));
            throw new Error(`NOWPayments Custody payout: ${payoutResponse.status} ${JSON.stringify(err)}`);
        }
        const data = await payoutResponse.json();
        const payoutId = data.payout_id || data.id;
        console.log('[nowpayments] Custody payout created:', payoutId, metadata);
        return { payoutId, data };
    }

    /**
     * Poll payout status until finished
     * @param {string} payoutId - Payout ID from NOWPayments
     * @param {number} claimId - Claim ID in database
     * @param {string} userId - User ID
     */
    async pollPayoutStatus(payoutId, claimId, userId) {
        const maxAttempts = 60; // 5 minutes max (5s intervals)
        let attempts = 0;

        const poll = async () => {
            try {
                attempts++;

                const response = await fetch(`${NOWPAYMENTS_API_URL}/payout/${payoutId}`, {
                    method: 'GET',
                    headers: {
                        'x-api-key': NOWPAYMENTS_API_KEY
                    }
                });

                if (!response.ok) {
                    throw new Error(`Failed to get payout status: ${response.status}`);
                }

                const payoutData = await response.json();
                const status = payoutData.payout_status || payoutData.status;

                console.log('[nowpayments] Payout status:', {
                    payoutId,
                    status,
                    attempt: attempts
                });

                if (status === 'finished' || status === 'completed') {
                    // Update claim status
                    await supabase
                        .from('claims')
                        .update({
                            status: 'completed',
                            completed_at: new Date().toISOString(),
                            payout_data: payoutData
                        })
                        .eq('id', claimId);

                    console.log('[nowpayments] ✅ Payout completed:', payoutId);
                    return;
                }

                if (status === 'failed' || status === 'error') {
                    // Refund credits
                    await supabase.rpc('increment_user_credits', {
                        user_id_param: userId,
                        amount_param: payoutData.amount || 0
                    });

                    await supabase
                        .from('claims')
                        .update({
                            status: 'failed',
                            payout_data: payoutData
                        })
                        .eq('id', claimId);

                    console.error('[nowpayments] ❌ Payout failed:', payoutId);
                    return;
                }

                // Continue polling if not finished
                if (attempts < maxAttempts) {
                    setTimeout(poll, 5000); // Poll every 5 seconds
                } else {
                    console.error('[nowpayments] ⚠️ Payout polling timeout:', payoutId);
                }

            } catch (error) {
                console.error('[nowpayments] Error polling payout status:', error);
                if (attempts < maxAttempts) {
                    setTimeout(poll, 5000);
                }
            }
        };

        // Start polling after 5 seconds
        setTimeout(poll, 5000);
    }
}

module.exports = { NOWPaymentsService };
