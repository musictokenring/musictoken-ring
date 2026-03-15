/**
 * MoonPay Integration Service
 * Handles deposits via MoonPay On-Ramp (fiat → USDC)
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { TradingFundService } = require('./trading-fund-service');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// MoonPay Configuration
const MOONPAY_API_KEY = process.env.MOONPAY_API_KEY || 'pk_test_ABC123DEF456GHI789JKL0MNOPQRSTUV';
const MOONPAY_SECRET_KEY = process.env.MOONPAY_SECRET_KEY || ''; // Para verificar webhooks
const MOONPAY_API_URL = 'https://api.moonpay.com/v1';
const VAULT_WALLET = process.env.VAULT_WALLET_ADDRESS || '0x75376BC58830f27415402875D26B73A6BE8E2253';
const TRADING_FUND_WALLET = process.env.TRADING_FUND_WALLET || '';

// Fee distribution: 75% vault, 25% trading fund
const VAULT_FEE_PERCENTAGE = 75;
const TRADING_FUND_FEE_PERCENTAGE = 25;

// Deposit fee: 5%
const DEPOSIT_FEE_RATE = 0.05;
// Credit rate: 95% of deposit (after 5% fee)
const CREDIT_RATE = 0.95;

class MoonPayService {
    constructor() {
        this.tradingFundService = new TradingFundService();
    }

    /**
     * Verify MoonPay webhook signature
     * @param {string} payload - Raw request body
     * @param {string} signature - x-moonpay-signature header
     * @returns {boolean}
     */
    verifyWebhookSignature(payload, signature) {
        if (!MOONPAY_SECRET_KEY) {
            console.warn('[moonpay] ⚠️ MOONPAY_SECRET_KEY not configured');
            return false;
        }

        const hmac = crypto.createHmac('sha256', MOONPAY_SECRET_KEY);
        hmac.update(payload);
        const expectedSignature = hmac.digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }

    /**
     * Process deposit webhook notification from MoonPay
     * @param {Object} transactionData - Transaction data from MoonPay
     * @returns {Promise<Object>}
     */
    async processDeposit(transactionData) {
        try {
            console.log('[moonpay] Processing deposit:', {
                transaction_id: transactionData.id,
                status: transactionData.status,
                amount: transactionData.baseCurrencyAmount,
                currency: transactionData.baseCurrencyCode
            });

            // Only process completed transactions
            if (transactionData.status !== 'completed') {
                console.log('[moonpay] Transaction not completed, status:', transactionData.status);
                return { processed: false, reason: 'Transaction not completed' };
            }

            // Check idempotency (prevent duplicate processing)
            const { data: existingDeposit } = await supabase
                .from('deposits')
                .select('id')
                .eq('tx_hash', transactionData.id)
                .maybeSingle();

            if (existingDeposit) {
                console.log('[moonpay] Deposit already processed:', transactionData.id);
                return { processed: false, reason: 'Already processed', deposit: existingDeposit };
            }

            // Extract user wallet from transaction
            const userWallet = transactionData.walletAddress || transactionData.cryptoTransaction?.walletAddress || null;
            const userEmail = transactionData.customer?.email || null;

            // Calculate amounts
            const depositAmount = parseFloat(transactionData.baseCurrencyAmount || transactionData.quoteCurrencyAmount || 0);
            if (depositAmount < 1) {
                throw new Error('Deposit amount must be at least 1 USD');
            }

            // MoonPay already handles fiat → USDC conversion
            // We receive USDC amount
            const usdcAmount = parseFloat(transactionData.quoteCurrencyAmount || depositAmount);
            const depositFee = usdcAmount * DEPOSIT_FEE_RATE; // 5%
            const creditsAwarded = usdcAmount * CREDIT_RATE; // 95%

            // Distribute fee: 75% vault, 25% trading fund
            const vaultFeeAmount = depositFee * (VAULT_FEE_PERCENTAGE / 100);
            const tradingFundFeeAmount = depositFee * (TRADING_FUND_FEE_PERCENTAGE / 100);

            // Find or create user by email/wallet
            let userId = null;
            if (userEmail || userWallet) {
                const { data: user } = await supabase
                    .from('users')
                    .select('id')
                    .or(`email.ilike.${userEmail || ''},wallet_address.ilike.${userWallet || ''}`)
                    .maybeSingle();

                if (user) {
                    userId = user.id;
                }
            }

            // If no user found, create pending deposit
            if (!userId) {
                console.log('[moonpay] No user found, creating pending deposit');
                const { data: pendingDeposit } = await supabase
                    .from('deposits')
                    .insert({
                        tx_hash: transactionData.id,
                        wallet_address: userWallet || null,
                        amount: usdcAmount,
                        token: 'USDC',
                        credits_awarded: creditsAwarded,
                        status: 'pending_user_link',
                        payment_id: transactionData.id,
                        payment_data: transactionData,
                        created_at: new Date().toISOString()
                    })
                    .select()
                    .single();

                return {
                    processed: false,
                    reason: 'Pending user link',
                    pendingDeposit,
                    message: 'Deposit recorded, waiting for user to link wallet/email'
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
                    tx_hash: transactionData.id,
                    wallet_address: userWallet || null,
                    user_id: userId,
                    amount: usdcAmount,
                    token: 'USDC',
                    credits_awarded: creditsAwarded,
                    fee_amount: depositFee,
                    vault_fee: vaultFeeAmount,
                    trading_fund_fee: tradingFundFeeAmount,
                    status: 'processed',
                    payment_id: transactionData.id,
                    payment_data: transactionData,
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
                console.error('[moonpay] Failed to update vault balance:', vaultError);
            }

            // Update trading fund balance (DB tracking)
            if (TRADING_FUND_WALLET && tradingFundFeeAmount > 0) {
                const { error: tradingFundError } = await supabase.rpc('update_trading_fund_balance', {
                    amount_param: tradingFundFeeAmount,
                    transaction_type_param: 'deposit_fee'
                });

                if (tradingFundError) {
                    console.error('[moonpay] Failed to update trading fund balance:', tradingFundError);
                }
            }

            console.log('[moonpay] ✅ Deposit processed successfully:', {
                transaction_id: transactionData.id,
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
            console.error('[moonpay] ❌ Error processing deposit:', error);
            throw error;
        }
    }
}

module.exports = { MoonPayService };
