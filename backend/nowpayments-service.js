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

// NOWPayments Configuration
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || '6E9NYFF-NGT4FRR-P03J9RP-EA4FXYF';
const NOWPAYMENTS_IPN_SECRET = process.env.IPN_SECRET || process.env.NOWPAYMENTS_IPN_SECRET || ''; // IPN Secret de NOWPayments Dashboard
const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';
const VAULT_WALLET = process.env.VAULT_WALLET_ADDRESS || '0x75376BC58830f27415402875D26B73A6BE8E2253';
const TRADING_FUND_WALLET = process.env.TRADING_FUND_WALLET || '';

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

    /**
     * Verify IPN signature using HMAC-SHA512
     * @param {string} payload - Raw request body
     * @param {string} signature - x-nowpayments-sig header
     * @returns {boolean}
     */
    verifyIPNSignature(payload, signature) {
        if (!NOWPAYMENTS_IPN_SECRET) {
            console.error('[nowpayments] ⚠️ IPN_SECRET not configured');
            return false;
        }

        const hmac = crypto.createHmac('sha512', NOWPAYMENTS_IPN_SECRET);
        hmac.update(payload);
        const expectedSignature = hmac.digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
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

            // Only process finished payments
            if (paymentData.payment_status !== 'finished') {
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
            const userIdFromOrder = paymentData.order_id || null; // order_id contiene el user_id interno

            // Calculate amounts
            const depositAmount = parseFloat(paymentData.pay_amount || 0);
            if (depositAmount < 1) {
                throw new Error('Deposit amount must be at least 1 USDC');
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
                        token: 'USDC',
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
                    token: 'USDC',
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

            const usdcAmount = creditsAmount; // 1 credit = 1 USDC
            const withdrawalFee = usdcAmount * DEPOSIT_FEE_RATE; // 5%
            const payoutAmount = usdcAmount - withdrawalFee; // 95%

            if (!vaultBalance || vaultBalance.balance < usdcAmount) {
                throw new Error('Insufficient vault balance');
            }

            // Distribute fee: 75% vault, 25% trading fund
            const vaultFeeAmount = withdrawalFee * (VAULT_FEE_PERCENTAGE / 100);
            const tradingFundFeeAmount = withdrawalFee * (TRADING_FUND_FEE_PERCENTAGE / 100);

            // Call NOWPayments Mass Payouts API
            const payoutResponse = await fetch(`${NOWPAYMENTS_API_URL}/payout/create`, {
                method: 'POST',
                headers: {
                    'x-api-key': NOWPAYMENTS_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    currency: 'USDC',
                    chain: 'BASE',
                    recipients: [
                        {
                            address: userWallet,
                            amount: payoutAmount.toFixed(6) // USDC has 6 decimals
                        }
                    ]
                })
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
