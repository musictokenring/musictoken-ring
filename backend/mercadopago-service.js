/**
 * Mercado Pago Service
 * Handles Mercado Pago checkout integration and webhook processing
 * Depósitos fiat (COP vía PSE/Nequi/tarjeta) → créditos en USD nominal
 * (mismo saldo jugable 1:1 USD que NOWPayments, ver unified-balance.js)
 *
 * Seguridad: mismo criterio que el resto de la plataforma tras el incidente
 * documentado en ANALISIS-VULNERABILIDAD-CONFIRMADA.md — el webhook es
 * público en internet, así que su firma SIEMPRE se valida antes de acreditar
 * nada (ver verifyWebhookSignature), y el usuario a acreditar viene del
 * external_reference que generamos nosotros al crear la preferencia (con la
 * sesión ya autenticada), nunca de un campo que el webhook pueda inventar.
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// --------------------------------------------------------------------------
// Tasa de cambio USD/COP en vivo, con cache y fallback conservador.
// Antes esto era un `1 / 4000` fijo en el código — con el peso colombiano
// moviéndose bastante, eso podía sub/sobre-acreditar saldo real de forma
// silenciosa. Fuente: exchangerate-api (gratis, sin key). Cache de 6h para
// no depender de esa API en cada webhook, con fallback a la última tasa
// buena conocida (o a un valor conservador si nunca se pudo obtener una).
// --------------------------------------------------------------------------
const FX_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas
const FX_FALLBACK_COP_PER_USD = 4000; // solo si la API falla Y nunca hubo cache
let fxCache = { copPerUsd: null, fetchedAt: 0 };

async function getCopPerUsd() {
    const now = Date.now();
    if (fxCache.copPerUsd && (now - fxCache.fetchedAt) < FX_CACHE_TTL_MS) {
        return fxCache.copPerUsd;
    }
    try {
        const resp = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) throw new Error(`FX API status ${resp.status}`);
        const data = await resp.json();
        const rate = data?.rates?.COP;
        if (!Number.isFinite(rate) || rate <= 0) throw new Error('FX API devolvió una tasa COP inválida');
        fxCache = { copPerUsd: rate, fetchedAt: now };
        return rate;
    } catch (err) {
        console.error('[mercadopago] ⚠️ No se pudo obtener tasa USD/COP en vivo, usando fallback:', err.message);
        // Si hay una tasa vieja en cache (aunque venció el TTL), es mejor que el fallback fijo.
        if (fxCache.copPerUsd) return fxCache.copPerUsd;
        return FX_FALLBACK_COP_PER_USD;
    }
}

class MercadoPagoService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co',
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // Mercado Pago credentials (from environment)
        this.accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
        this.publicKey = process.env.MERCADOPAGO_PUBLIC_KEY;
        this.webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

        // Fee distribution: 5% total, 75% vault, 25% trading fund
        this.depositFeePercent = 0.05;
        this.vaultFeePercent = 0.75;
        this.tradingFundFeePercent = 0.25;
    }

    /**
     * Create a Mercado Pago checkout preference (Checkout Pro).
     * El importe SIEMPRE se recibe en USD (mismo criterio que el resto de la
     * app, ver depositSectionMain / NOWPayments) y se convierte a COP acá
     * adentro, porque PSE/Nequi solo existen en COP en el checkout de MP.
     *
     * Acepta el monto en USD (amountUsd, resto de la app) O directo en COP
     * (amountCop) — para usuarios colombianos pagando con PSE/Nequi, pedir
     * el monto en USD (mínimo históricamente $12) no tenía sentido: se pidió
     * bajar el mínimo a algo real en pesos (10.000 COP), y forzar a alguien
     * a calcular "¿cuántos dólares son 10.000 pesos?" es mala UX. El monto
     * real que termina acreditado como saldo siempre sale del pago
     * CONFIRMADO por Mercado Pago al momento del webhook (ver processDeposit),
     * así que no importa en qué moneda se pidió acá — esto solo arma la
     * preferencia de cobro.
     * @param {Object} params - { amountUsd?, amountCop?, userId, email, description }
     */
    async createCheckoutPreference(params) {
        const { amountUsd, amountCop, userId, email, description } = params;

        if (!this.accessToken) {
            throw new Error('Mercado Pago access token not configured');
        }
        if (!userId) {
            throw new Error('userId es requerido');
        }

        const copPerUsd = await getCopPerUsd();
        let copAmount;
        let usd;
        if (amountCop != null) {
            const cop = parseFloat(amountCop);
            if (!Number.isFinite(cop) || cop <= 0) {
                throw new Error('amountCop inválido');
            }
            // MP Colombia exige montos enteros de COP (sin centavos).
            copAmount = Math.round(cop);
            usd = cop / copPerUsd;
        } else {
            usd = parseFloat(amountUsd);
            if (!Number.isFinite(usd) || usd <= 0) {
                throw new Error('amountUsd inválido');
            }
            copAmount = Math.round(usd * copPerUsd);
        }

        const preference = {
            items: [
                {
                    title: description || 'Depósito MusicToken Ring',
                    quantity: 1,
                    unit_price: copAmount,
                    currency_id: 'COP'
                }
            ],
            payer: {
                email: email || undefined
            },
            back_urls: {
                success: `${process.env.FRONTEND_URL || 'https://musictokenring.xyz'}/?mp_payment=success`,
                failure: `${process.env.FRONTEND_URL || 'https://musictokenring.xyz'}/?mp_payment=failure`,
                pending: `${process.env.FRONTEND_URL || 'https://musictokenring.xyz'}/?mp_payment=pending`
            },
            auto_return: 'approved',
            // CRÍTICO: external_reference es el ÚNICO lugar de donde el webhook
            // toma el userId a acreditar — lo fijamos acá con la sesión ya
            // autenticada, el webhook nunca puede inventar/cambiar este valor.
            external_reference: String(userId),
            notification_url: `${process.env.BACKEND_URL || 'https://musictoken-ring.onrender.com'}/webhook/mercadopago`,
            statement_descriptor: 'MTR Deposit'
        };

        const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.accessToken}`
            },
            body: JSON.stringify(preference)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Mercado Pago API error: ${errorData.message || response.statusText}`);
        }

        const data = await response.json();
        return {
            preference_id: data.id,
            init_point: data.init_point, // URL de checkout para redirigir al usuario
            sandbox_init_point: data.sandbox_init_point,
            public_key: this.publicKey,
            requested_amount_usd: usd,
            cop_amount: copAmount,
            fx_rate_used: copPerUsd
        };
    }

    /**
     * Verify the x-signature header Mercado Pago sends on every webhook call.
     * Algoritmo oficial (docs de Mercado Pago, "Webhooks / notificaciones"):
     *   manifest = `id:{dataId};request-id:{requestId};ts:{ts};`
     *   (dataId en minúsculas)
     *   HMAC-SHA256(manifest, MERCADOPAGO_WEBHOOK_SECRET) debe == v1
     * Antes esta función devolvía `true` siempre (placeholder) — cualquiera
     * en internet podía POSTear una notificación falsa y hacerse acreditar
     * saldo. Ahora se verifica de verdad, en comparación de tiempo constante.
     * @param {Object} headers - { xSignature, xRequestId }
     * @param {string} dataId - el id de pago (query `data.id` o body.data.id)
     * @returns {boolean}
     */
    verifyWebhookSignature(headers, dataId) {
        if (!this.webhookSecret) {
            console.error('[mercadopago] ⚠️ MERCADOPAGO_WEBHOOK_SECRET no configurado — rechazando webhook');
            return false;
        }
        const xSignature = headers?.['x-signature'] || headers?.xSignature;
        const xRequestId = headers?.['x-request-id'] || headers?.xRequestId;
        if (!xSignature || !xRequestId || !dataId) {
            console.error('[mercadopago] ⚠️ Falta x-signature, x-request-id o data.id en el webhook');
            return false;
        }

        const parts = {};
        String(xSignature).split(',').forEach((p) => {
            const i = p.indexOf('=');
            if (i === -1) return;
            parts[p.slice(0, i).trim()] = p.slice(i + 1).trim();
        });
        const { ts, v1 } = parts;
        if (!ts || !v1) {
            console.error('[mercadopago] ⚠️ x-signature con formato inesperado:', xSignature);
            return false;
        }

        const manifest = `id:${String(dataId).toLowerCase()};request-id:${xRequestId};ts:${ts};`;
        const expectedHex = crypto.createHmac('sha256', this.webhookSecret).update(manifest).digest('hex');

        const a = Buffer.from(expectedHex, 'hex');
        const b = Buffer.from(String(v1), 'hex');
        if (a.length !== b.length || a.length === 0) {
            return false;
        }
        return crypto.timingSafeEqual(a, b);
    }

    /**
     * Process deposit from Mercado Pago webhook. SOLO llamar después de que
     * verifyWebhookSignature() devolvió true.
     * @param {Object} notification - Mercado Pago notification payload
     * @returns {Promise<Object>} - Processing result
     */
    async processDeposit(notification) {
        const { type, data } = notification;

        // Mercado Pago sends different notification types; solo nos interesan 'payment'.
        if (type !== 'payment') {
            console.log('[mercadopago] Ignoring notification type:', type);
            return { processed: false, reason: 'Not a payment notification' };
        }

        const paymentId = data.id;

        // Check idempotency (prevent duplicate processing).
        // CRÍTICO: esto filtraba por `external_payment_id`, una columna que
        // NO EXISTE en la tabla real `deposits` (confirmado en vivo — la
        // query fallaba silenciosamente, `data` volvía null, y el chequeo de
        // duplicados nunca detectaba nada). Si Mercado Pago reintentaba la
        // notificación del mismo pago, se habría vuelto a acreditar. La
        // columna real que identifica el depósito (igual que en
        // nowpayments-service.js) es `tx_hash`, que además ya es la que se
        // usa más abajo al insertar la fila.
        const { data: existingDeposit, error: existingErr } = await this.supabase
            .from('deposits')
            .select('id')
            .eq('tx_hash', `mp_${paymentId}`)
            .maybeSingle();
        if (existingErr) {
            // No asumir "no existe" ante un error real de la consulta — mejor
            // fallar fuerte que arriesgar un doble pago.
            throw new Error(`No se pudo verificar idempotencia del pago ${paymentId}: ${existingErr.message}`);
        }

        if (existingDeposit) {
            console.log('[mercadopago] Payment already processed:', paymentId);
            return { processed: false, reason: 'Already processed', deposit_id: existingDeposit.id };
        }

        // Fetch payment details from Mercado Pago API (nunca confiar en el body del webhook solo)
        const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${this.accessToken}` }
        });

        if (!paymentResponse.ok) {
            throw new Error(`Failed to fetch payment ${paymentId} from Mercado Pago`);
        }

        const payment = await paymentResponse.json();

        // Only process approved payments
        if (payment.status !== 'approved') {
            console.log('[mercadopago] Payment not approved:', payment.status);
            return { processed: false, reason: `Payment status: ${payment.status}` };
        }

        // Get userId from external_reference (fijado por nosotros al crear la preferencia)
        const userId = payment.external_reference;
        if (!userId) {
            throw new Error('No userId in payment external_reference');
        }

        const payerEmail = payment.payer?.email;
        const paymentAmount = parseFloat(payment.transaction_amount);
        const paymentCurrency = payment.currency_id;

        // Convertir a USD con tasa en vivo (antes: 1/4000 fijo).
        const copPerUsd = await getCopPerUsd();
        const usdRate = paymentCurrency === 'USD' ? 1 : (1 / copPerUsd);
        const usdAmount = paymentAmount * usdRate;

        // Calculate fees
        const depositFee = usdAmount * this.depositFeePercent;
        const netAmount = usdAmount - depositFee;
        const tradingFundFee = depositFee * this.tradingFundFeePercent;

        // Créditos en USD nominal (1 crédito = 1 USD nominal)
        const creditsToAward = netAmount;

        // Update user fiat balance
        const { error: updateError } = await this.supabase.rpc('increment_user_fiat_balance', {
            user_id_param: userId,
            amount_to_add: creditsToAward
        });

        if (updateError) {
            throw new Error(`Failed to credit user balance: ${updateError.message}`);
        }

        // CRÍTICO: la comisión de un depósito en COP va al vault EN PESOS
        // (update_vault_balance_cop, migración 022), NUNCA al vault on-chain
        // de USDC (update_vault_balance) — ese representa una wallet real en
        // Base, y un pago en pesos no genera ningún USDC real que mover ahí.
        // Antes esto sí se sumaba al vault on-chain por error, lo que habría
        // mostrado un número de "Vault de Liquidez" no respaldado por fondos
        // reales — exactamente el tipo de mensaje engañoso que ya se corrigió
        // hoy en otras partes de la app.
        if (paymentCurrency === 'COP') {
            const vaultFeeCop = paymentAmount * this.depositFeePercent * this.vaultFeePercent;
            if (vaultFeeCop > 0) {
                const { error: vaultCopError } = await this.supabase.rpc('update_vault_balance_cop', {
                    amount_to_add: vaultFeeCop,
                    tx_hash_param: `mp_${paymentId}`
                });
                if (vaultCopError) {
                    console.error('[mercadopago] Error updating vault (COP):', vaultCopError);
                }
            }
        } else {
            // Pagos en USD por esta pasarela (poco común, pero soportado) sí
            // son comparables al resto del vault on-chain en USD nominal.
            const vaultFee = depositFee * this.vaultFeePercent;
            if (vaultFee > 0) {
                const { error: vaultError } = await this.supabase.rpc('update_vault_balance', {
                    amount_to_add: vaultFee,
                    tx_hash_param: `mp_${paymentId}`
                });
                if (vaultError) {
                    console.error('[mercadopago] Error updating vault:', vaultError);
                }
            }
        }

        if (tradingFundFee > 0 && process.env.TRADING_FUND_WALLET) {
            console.log('[mercadopago] Trading fund fee:', tradingFundFee);
        }

        // Record deposit in database.
        // CRÍTICO: `external_payment_id`, `payment_method` y `payment_currency`
        // NO son columnas reales de `deposits` (confirmado en vivo contra la
        // tabla real — este insert fallaba silenciosamente en cada depósito,
        // sin fila de auditoría, aunque el saldo sí se acreditaba bien via la
        // RPC de arriba). `tx_hash` (con el prefijo `mp_`) ya identifica el
        // pago de forma única — es la misma columna que usa la idempotencia.
        const { data: depositRecord, error: depositError } = await this.supabase
            .from('deposits')
            .insert({
                user_id: userId,
                tx_hash: `mp_${paymentId}`,
                token: 'FIAT',
                amount: paymentAmount,
                credits_awarded: creditsToAward,
                rate_used: usdRate,
                status: 'processed',
                network: `mercadopago-${paymentCurrency}`.toLowerCase(),
                usdc_value_at_deposit: usdAmount,
                deposit_fee: depositFee
            })
            .select('id')
            .single();

        if (depositError) {
            console.error('[mercadopago] Error recording deposit:', depositError);
            // No relanzamos: el saldo ya se acreditó, perder el registro de auditoría
            // es preferible a dejar al usuario sin su depósito por un error de log.
        }

        console.log('[mercadopago] ✅ Deposit processed:', {
            paymentId,
            userId,
            payerEmail,
            amount: paymentAmount,
            currency: paymentCurrency,
            fxRateUsed: copPerUsd,
            creditsAwarded: creditsToAward,
            fee: depositFee
        });

        return {
            processed: true,
            deposit_id: depositRecord?.id,
            payment_id: paymentId,
            credits_awarded: creditsToAward,
            fee: depositFee
        };
    }
}

module.exports = { MercadoPagoService, getCopPerUsd };
