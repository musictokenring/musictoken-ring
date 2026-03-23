/**
 * Mercado Pago Service
 * Handles Mercado Pago checkout integration and webhook processing
 * Depósitos fiat (COP/USD) → créditos en USD nominal (equivalente 1:1 a USDC en Base on-chain)
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

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
     * Create a Mercado Pago checkout preference
     * @param {Object} params - { amount, currency, userId, email, description }
     * @returns {Promise<Object>} - Checkout preference data
     */
    async createCheckoutPreference(params) {
        const { amount, currency = 'COP', userId, email, description } = params;
        
        if (!this.accessToken) {
            throw new Error('Mercado Pago access token not configured');
        }

        // Convert amount to Mercado Pago format (COP or USD)
        // For now, we'll use COP (Colombian Pesos) as default
        const mpAmount = parseFloat(amount);
        
        // Create preference
        const preference = {
            items: [
                {
                    title: description || 'Depósito MusicToken Ring',
                    quantity: 1,
                    unit_price: mpAmount,
                    currency_id: currency
                }
            ],
            payer: {
                email: email || 'user@example.com'
            },
            back_urls: {
                success: `${process.env.FRONTEND_URL || 'https://musictokenring.xyz'}/deposit-success`,
                failure: `${process.env.FRONTEND_URL || 'https://musictokenring.xyz'}/deposit-failure`,
                pending: `${process.env.FRONTEND_URL || 'https://musictokenring.xyz'}/deposit-pending`
            },
            auto_return: 'approved',
            external_reference: userId, // Store userId for webhook processing
            notification_url: `${process.env.BACKEND_URL || 'https://musictoken-ring.onrender.com'}/webhook/mercadopago`,
            statement_descriptor: 'MTR Deposit'
        };

        try {
            const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: JSON.stringify(preference)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Mercado Pago API error: ${errorData.message || response.statusText}`);
            }

            const data = await response.json();
            return {
                preference_id: data.id,
                init_point: data.init_point, // URL to redirect user
                sandbox_init_point: data.sandbox_init_point,
                public_key: this.publicKey
            };
        } catch (error) {
            console.error('[mercadopago] Error creating preference:', error);
            throw error;
        }
    }

    /**
     * Verify webhook signature (if Mercado Pago provides one)
     * @param {Object} payload - Webhook payload
     * @param {string} signature - Signature header
     * @returns {boolean}
     */
    verifyWebhookSignature(payload, signature) {
        // Mercado Pago doesn't always provide signatures, but we can verify by checking the payment status
        // For now, we'll rely on idempotency checks and payment status verification
        return true; // Placeholder - implement if Mercado Pago provides signature verification
    }

    /**
     * Process deposit from Mercado Pago webhook
     * @param {Object} notification - Mercado Pago notification payload
     * @returns {Promise<Object>} - Processing result
     */
    async processDeposit(notification) {
        try {
            const { type, data } = notification;
            
            // Mercado Pago sends different notification types
            // We're interested in 'payment' notifications
            if (type !== 'payment') {
                console.log('[mercadopago] Ignoring notification type:', type);
                return { processed: false, reason: 'Not a payment notification' };
            }

            const paymentId = data.id;
            
            // Check idempotency (prevent duplicate processing)
            const { data: existingDeposit } = await this.supabase
                .from('deposits')
                .select('id')
                .eq('external_payment_id', `mp_${paymentId}`)
                .maybeSingle();

            if (existingDeposit) {
                console.log('[mercadopago] Payment already processed:', paymentId);
                return { processed: false, reason: 'Already processed', deposit_id: existingDeposit.id };
            }

            // Fetch payment details from Mercado Pago API
            const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
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

            // Get userId from external_reference (stored in preference)
            const userId = payment.external_reference;
            if (!userId) {
                throw new Error('No userId in payment external_reference');
            }

            // Get user email
            const payerEmail = payment.payer?.email;
            
            // Amount in payment currency (COP or USD)
            const paymentAmount = parseFloat(payment.transaction_amount);
            const paymentCurrency = payment.currency_id;

            // Convert to USD (if COP, use approximate rate 1 USD = 4000 COP)
            // TODO: Use real-time exchange rate API
            const usdRate = paymentCurrency === 'USD' ? 1 : (1 / 4000); // Approximate
            const usdAmount = paymentAmount * usdRate;

            // Calculate fees
            const depositFee = usdAmount * this.depositFeePercent;
            const netAmount = usdAmount - depositFee;
            const vaultFee = depositFee * this.vaultFeePercent;
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

            // Update vault balance (75% of fee)
            if (vaultFee > 0) {
                const { error: vaultError } = await this.supabase.rpc('update_vault_balance', {
                    amount_to_add: vaultFee,
                    tx_hash_param: `mp_${paymentId}`
                });
                if (vaultError) {
                    console.error('[mercadopago] Error updating vault:', vaultError);
                }
            }

            // Update trading fund balance (25% of fee)
            if (tradingFundFee > 0 && process.env.TRADING_FUND_WALLET) {
                // TODO: Implement trading fund balance update
                console.log('[mercadopago] Trading fund fee:', tradingFundFee);
            }

            // Record deposit in database
            const { data: depositRecord, error: depositError } = await this.supabase
                .from('deposits')
                .insert({
                    user_id: userId,
                    tx_hash: `mp_${paymentId}`, // Use payment ID as tx_hash
                    token: 'FIAT', // Fiat deposit
                    amount: paymentAmount,
                    credits_awarded: creditsToAward,
                    rate_used: 1, // 1:1 USD nominal
                    status: 'processed',
                    external_payment_id: `mp_${paymentId}`,
                    payment_method: 'mercadopago',
                    payment_currency: paymentCurrency,
                    usdc_value_at_deposit: usdAmount,
                    deposit_fee: depositFee
                })
                .select('id')
                .single();

            if (depositError) {
                console.error('[mercadopago] Error recording deposit:', depositError);
                // Don't throw - balance was already credited
            }

            console.log('[mercadopago] ✅ Deposit processed:', {
                paymentId,
                userId,
                amount: paymentAmount,
                currency: paymentCurrency,
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

        } catch (error) {
            console.error('[mercadopago] Error processing deposit:', error);
            throw error;
        }
    }
}

module.exports = { MercadoPagoService };
