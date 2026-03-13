/**
 * Automatic Claim Service
 * Processes credit claims and sends USDC payouts automatically
 * Converts credits → USDC using current MTR/USDC price
 */

const { createPublicClient, createWalletClient, http, parseUnits, formatUnits } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');
const { createClient } = require('@supabase/supabase-js');
const { VaultService } = require('./vault-service');
const { LiquidityManager } = require('./liquidity-manager');
const { TradingFundService } = require('./trading-fund-service');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ADMIN_PRIVATE_KEY = process.env.ADMIN_WALLET_PRIVATE_KEY; // Must be set in env
const ADMIN_WALLET = process.env.ADMIN_WALLET_ADDRESS;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// USDC ERC20 ABI
const USDC_ABI = [
    {
        type: 'function',
        name: 'transfer',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' }
        ],
        outputs: [{ name: '', type: 'bool' }]
    },
    {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
    }
];

class ClaimService {
    constructor() {
        if (!ADMIN_PRIVATE_KEY) {
            throw new Error('ADMIN_WALLET_PRIVATE_KEY must be set in environment variables');
        }

        this.account = privateKeyToAccount(ADMIN_PRIVATE_KEY.startsWith('0x') ? ADMIN_PRIVATE_KEY : `0x${ADMIN_PRIVATE_KEY}`);
        this.publicClient = createPublicClient({
            chain: base,
            transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
        });
        this.walletClient = createWalletClient({
            account: this.account,
            chain: base,
            transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
        });
        this.vaultService = new VaultService();
        
        // Initialize liquidity manager (optional - for auto-selling MTR if needed)
        try {
            this.liquidityManager = new LiquidityManager();
        } catch (error) {
            console.warn('[claim-service] Liquidity manager not available:', error.message);
            this.liquidityManager = null;
        }
        
        // Initialize trading fund service for fee distribution
        try {
            this.tradingFundService = new TradingFundService();
        } catch (error) {
            console.warn('[claim-service] Trading fund service not available:', error.message);
            this.tradingFundService = null;
        }
    }

    /**
     * Process claim request
     * @param {string} userId - User ID
     * @param {number} credits - Credits to claim
     * @param {string} recipientWallet - Wallet address to receive USDC
     * @param {Object} requestInfo - Request metadata (ip, userAgent) for audit
     */
    async processClaim(userId, credits, recipientWallet, requestInfo = {}) {
        try {
            console.log(`[claim-service] Processing claim: ${credits} credits for user ${userId}`);

            // Validate inputs
            if (!userId || !credits || credits <= 0) {
                throw new Error('Invalid claim parameters');
            }

            if (!/^0x[a-fA-F0-9]{40}$/.test(recipientWallet)) {
                throw new Error('Invalid wallet address');
            }

            // Get user's current credit balance
            const { data: userCredits } = await supabase
                .from('user_credits')
                .select('credits')
                .eq('user_id', userId)
                .single();

            if (!userCredits || userCredits.credits < credits) {
                throw new Error('Insufficient credits');
            }

            // NUEVO SISTEMA: Retiro directo 1 crédito = 1 USDC (fijo)
            // Fee de retiro: 5%
            const WITHDRAWAL_FEE_RATE = 0.05; // 5%
            const withdrawalFee = credits * WITHDRAWAL_FEE_RATE;
            
            // USDC a enviar: créditos - fee (1:1)
            const usdcAmount = credits - withdrawalFee;

            // Round to 6 decimals (USDC precision)
            const usdcAmountRounded = Math.floor(usdcAmount * 1000000) / 1000000;

            if (usdcAmountRounded <= 0) {
                throw new Error('USDC amount too small');
            }

            // NUEVO: Verificar balance del vault antes de pagar
            const canWithdraw = await this.vaultService.canWithdraw(usdcAmountRounded);
            if (!canWithdraw) {
                // Try to ensure USDC by selling MTR if needed
                if (this.liquidityManager) {
                    console.log('[claim-service] Vault balance low, checking if we can sell MTR...');
                    const liquidityResult = await this.liquidityManager.ensureUSDCForPayout(usdcAmountRounded);
                    
                    if (!liquidityResult.success) {
                        const vaultBalance = await this.vaultService.getVaultBalance();
                        throw new Error(`Insufficient vault balance. Available: ${vaultBalance} USDC, Required: ${usdcAmountRounded} USDC. ${liquidityResult.reason}`);
                    }
                    
                    // Re-check vault balance after potential MTR sale
                    const canWithdrawAfter = await this.vaultService.canWithdraw(usdcAmountRounded);
                    if (!canWithdrawAfter) {
                        const vaultBalance = await this.vaultService.getVaultBalance();
                        throw new Error(`Insufficient vault balance after MTR sale. Available: ${vaultBalance} USDC, Required: ${usdcAmountRounded} USDC.`);
                    }
                } else {
                    const vaultBalance = await this.vaultService.getVaultBalance();
                    throw new Error(`Insufficient vault balance. Available: ${vaultBalance} USDC, Required: ${usdcAmountRounded} USDC. Vault en recarga, espera unos minutos.`);
                }
            }

            // También verificar admin wallet como fallback
            const adminWalletAddress = ADMIN_WALLET || this.account.address;
            const adminBalance = await this.publicClient.readContract({
                address: USDC_ADDRESS,
                abi: USDC_ABI,
                functionName: 'balanceOf',
                args: [adminWalletAddress]
            });

            const adminBalanceFormatted = parseFloat(formatUnits(adminBalance, 6));

            if (adminBalanceFormatted < usdcAmountRounded) {
                // Intentar usar vault si admin wallet no tiene suficiente
                try {
                    const vaultTxHash = await this.vaultService.withdrawFromVault(usdcAmountRounded, recipientWallet, 'claim_payout', userId, requestInfo);
                    console.log(`[claim-service] Withdrew ${usdcAmountRounded} USDC from vault. Tx: ${vaultTxHash}`);
                    
                    // Deduct credits and update claim record
                    await supabase.rpc('decrement_user_credits', {
                        user_id_param: userId,
                        credits_to_subtract: credits
                    });

                    await supabase
                        .from('claims')
                        .update({
                            status: 'completed',
                            tx_hash: vaultTxHash,
                            completed_at: new Date().toISOString()
                        })
                        .eq('id', claimRecord.id);

                    // NUEVO: Distribuir fee entre vault y trading fund (70-80% / 20-30%)
                    if (this.tradingFundService) {
                        await this.tradingFundService.distributeFee(withdrawalFee, 'withdrawal', vaultTxHash);
                    } else {
                        // Fallback: enviar todo al vault si trading fund no está disponible
                        await this.sendFeeToVault(withdrawalFee, 'withdrawal', vaultTxHash);
                    }

                    return {
                        success: true,
                        txHash: vaultTxHash,
                        usdcAmount: usdcAmountRounded,
                        creditsUsed: credits,
                        withdrawalFee: withdrawalFee,
                        source: 'vault',
                        note: '1 crédito = 1 USDC fijo'
                    };
                } catch (vaultError) {
                    throw new Error(`Insufficient funds. Admin: ${adminBalanceFormatted} USDC, Vault error: ${vaultError.message}`);
                }
            }

            // Record claim request (nuevo formato sin conversión MTR)
            const { data: claimRecord, error: claimError } = await supabase
                .from('claims')
                .insert([{
                    user_id: userId,
                    credits_amount: credits,
                    mtr_equivalent: null, // Ya no se usa
                    usdc_amount: usdcAmountRounded,
                    withdrawal_fee: withdrawalFee, // Nuevo campo
                    mtr_price_used: null, // Ya no se usa
                    rate_used: null, // Ya no se usa
                    recipient_wallet: recipientWallet.toLowerCase(),
                    status: 'processing',
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (claimError) {
                throw new Error(`Error creating claim record: ${claimError.message}`);
            }

            // Send USDC transaction
            const txHash = await this.sendUSDC(recipientWallet, usdcAmountRounded);

            // Wait for confirmation
            const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

            if (receipt.status !== 'success') {
                throw new Error('Transaction failed');
            }

            // Deduct credits from user balance (atomic)
            await supabase.rpc('decrement_user_credits', {
                user_id_param: userId,
                credits_to_subtract: credits
            });

            // NUEVO: Distribuir fee entre vault y trading fund (70-80% / 20-30%)
            if (this.tradingFundService) {
                await this.tradingFundService.distributeFee(withdrawalFee, 'withdrawal', txHash);
            } else {
                // Fallback: enviar todo al vault si trading fund no está disponible
                await this.sendFeeToVault(withdrawalFee, 'withdrawal', txHash);
            }

            // Update claim record
            await supabase
                .from('claims')
                .update({
                    status: 'completed',
                    tx_hash: txHash,
                    completed_at: new Date().toISOString()
                })
                .eq('id', claimRecord.id);

            console.log(`[claim-service] ✅ Claim processed: ${usdcAmountRounded} USDC sent to ${recipientWallet}, fee ${withdrawalFee} USDC to vault`);

            return {
                success: true,
                txHash,
                usdcAmount: usdcAmountRounded,
                creditsUsed: credits,
                withdrawalFee: withdrawalFee,
                note: '1 crédito = 1 USDC fijo'
            };

        } catch (error) {
            console.error('[claim-service] Error processing claim:', error);
            
            // Update claim record to failed
            if (claimRecord?.id) {
                await supabase
                    .from('claims')
                    .update({
                        status: 'failed',
                        error_message: error.message,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', claimRecord.id);
            }

            throw error;
        }
    }

    /**
     * Send USDC to recipient
     */
    async sendUSDC(recipient, amount) {
        try {
            const amountWei = parseUnits(amount.toFixed(6), 6); // USDC has 6 decimals

            console.log(`[claim-service] Sending ${amount} USDC to ${recipient}`);

            const hash = await this.walletClient.writeContract({
                address: USDC_ADDRESS,
                abi: USDC_ABI,
                functionName: 'transfer',
                args: [recipient, amountWei]
            });

            return hash;
        } catch (error) {
            console.error('[claim-service] Error sending USDC:', error);
            throw error;
        }
    }

    /**
     * Get current MTR/USDC price
     */
    async getMTRPrice() {
        try {
            const { data } = await supabase
                .from('platform_settings')
                .select('mtr_usdc_price')
                .eq('key', 'mtr_usdc_price')
                .single();

            return data?.mtr_usdc_price || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Send fee to vault
     */
    async sendFeeToVault(feeAmount, feeType, txHash) {
        try {
            // Usar vaultService directamente
            await this.vaultService.addFee(feeAmount, feeType, txHash);
            console.log(`[claim-service] Fee ${feeAmount} USDC sent to vault (type: ${feeType})`);
        } catch (error) {
            console.error('[claim-service] Error sending fee to vault:', error);
            // No bloquear el flujo si falla el fee
        }
    }
}

module.exports = { ClaimService };
