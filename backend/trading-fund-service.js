/**
 * Trading Fund Service
 * Manages distribution of fees between vault and trading fund
 * Trading fund receives 20-30% of fees for MTR market making/hype
 * Vault receives 70-80% for backing user credits
 */

const { createPublicClient, createWalletClient, http, parseUnits, formatUnits } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const VAULT_WALLET = process.env.VAULT_WALLET_ADDRESS || process.env.ADMIN_WALLET_ADDRESS || null;
const TRADING_FUND_WALLET = process.env.TRADING_FUND_WALLET; // Must be set in env
const VAULT_FEE_PERCENTAGE = parseFloat(process.env.VAULT_FEE_PERCENTAGE || '75'); // 70-80%
const TRADING_FUND_FEE_PERCENTAGE = parseFloat(process.env.TRADING_FUND_FEE_PERCENTAGE || '25'); // 20-30%

// Validar que los porcentajes sumen 100%
if (Math.abs(VAULT_FEE_PERCENTAGE + TRADING_FUND_FEE_PERCENTAGE - 100) > 0.01) {
    throw new Error(`Fee percentages must sum to 100%. Vault: ${VAULT_FEE_PERCENTAGE}%, Trading Fund: ${TRADING_FUND_FEE_PERCENTAGE}%`);
}

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

class TradingFundService {
    constructor() {
        if (!TRADING_FUND_WALLET) {
            console.warn('[trading-fund-service] ⚠️ TRADING_FUND_WALLET not set. Fee distribution will only go to vault.');
        }

        const adminPrivateKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
        if (!adminPrivateKey) {
            throw new Error('ADMIN_WALLET_PRIVATE_KEY must be set in environment variables');
        }

        this.account = privateKeyToAccount(adminPrivateKey.startsWith('0x') ? adminPrivateKey : `0x${adminPrivateKey}`);
        this.publicClient = createPublicClient({
            chain: base,
            transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
        });
        this.walletClient = createWalletClient({
            account: this.account,
            chain: base,
            transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
        });
    }

    /**
     * Distribute fee between vault and trading fund
     * @param {number} totalFeeAmount - Total fee amount (USD nominal, token USDC Base)
     * @param {string} feeType - Type of fee: 'deposit', 'withdrawal', 'bet'
     * @param {string} txHash - Transaction hash for audit
     * @returns {Promise<Object>} Distribution result
     */
    async distributeFee(totalFeeAmount, feeType, txHash = null) {
        try {
            if (!VAULT_WALLET) {
                throw new Error('VAULT_WALLET_ADDRESS or ADMIN_WALLET_ADDRESS must be set for vault transfers');
            }
            console.log(`[trading-fund-service] Distributing ${feeType} fee:`, {
                totalFeeAmount: totalFeeAmount,
                vaultPercentage: VAULT_FEE_PERCENTAGE,
                tradingFundPercentage: TRADING_FUND_FEE_PERCENTAGE
            });

            // Calculate amounts
            const vaultAmount = totalFeeAmount * (VAULT_FEE_PERCENTAGE / 100);
            const tradingFundAmount = totalFeeAmount * (TRADING_FUND_FEE_PERCENTAGE / 100);

            // Round to 6 decimals (USDC precision)
            let vaultAmountRounded = Math.floor(vaultAmount * 1000000) / 1000000;
            const tradingFundAmountRounded = Math.floor(tradingFundAmount * 1000000) / 1000000;

            // Validate amounts
            const totalRounded = vaultAmountRounded + tradingFundAmountRounded;
            if (Math.abs(totalRounded - totalFeeAmount) > 0.000001) {
                console.warn('[trading-fund-service] ⚠️ Rounding difference detected:', {
                    totalFeeAmount: totalFeeAmount,
                    totalRounded: totalRounded,
                    difference: totalFeeAmount - totalRounded
                });
                // Adjust vault amount to account for rounding
                const adjustedVaultAmount = totalFeeAmount - tradingFundAmountRounded;
                vaultAmountRounded = Math.floor(adjustedVaultAmount * 1000000) / 1000000;
            }

            const results = {
                totalFee: totalFeeAmount,
                vaultAmount: vaultAmountRounded,
                tradingFundAmount: tradingFundAmountRounded,
                vaultTxHash: null,
                tradingFundTxHash: null,
                errors: []
            };

            // Transfer to vault (always)
            try {
                if (vaultAmountRounded > 0) {
                    const vaultTxHash = await this.transferUSDC(VAULT_WALLET, vaultAmountRounded);
                    results.vaultTxHash = vaultTxHash;
                    console.log(`[trading-fund-service] ✅ Transferred ${vaultAmountRounded} USD nominal (USDC) to vault. Tx: ${vaultTxHash}`);
                }
            } catch (vaultError) {
                console.error('[trading-fund-service] ❌ Error transferring to vault:', vaultError);
                results.errors.push({ target: 'vault', error: vaultError.message });
            }

            // Transfer to trading fund (if configured)
            if (TRADING_FUND_WALLET && tradingFundAmountRounded > 0) {
                try {
                    const tradingFundTxHash = await this.transferUSDC(TRADING_FUND_WALLET, tradingFundAmountRounded);
                    results.tradingFundTxHash = tradingFundTxHash;
                    console.log(`[trading-fund-service] ✅ Transferred ${tradingFundAmountRounded} USD nominal (USDC) to trading fund. Tx: ${tradingFundTxHash}`);
                } catch (tradingFundError) {
                    console.error('[trading-fund-service] ❌ Error transferring to trading fund:', tradingFundError);
                    results.errors.push({ target: 'trading_fund', error: tradingFundError.message });
                    
                    // CRÍTICO: Si trading fund falla, enviar al vault como fallback
                    console.log('[trading-fund-service] ⚠️ Trading fund transfer failed, sending to vault as fallback');
                    try {
                        const fallbackTxHash = await this.transferUSDC(VAULT_WALLET, tradingFundAmountRounded);
                        results.vaultTxHash = results.vaultTxHash || fallbackTxHash;
                        console.log(`[trading-fund-service] ✅ Fallback: Transferred ${tradingFundAmountRounded} USD nominal (USDC) to vault. Tx: ${fallbackTxHash}`);
                    } catch (fallbackError) {
                        console.error('[trading-fund-service] ❌ Fallback transfer also failed:', fallbackError);
                        results.errors.push({ target: 'vault_fallback', error: fallbackError.message });
                    }
                }
            } else if (!TRADING_FUND_WALLET) {
                // Si no hay trading fund configurado, enviar todo al vault
                console.log('[trading-fund-service] ⚠️ Trading fund not configured, sending all fees to vault');
                if (tradingFundAmountRounded > 0) {
                    try {
                        const fallbackTxHash = await this.transferUSDC(VAULT_WALLET, tradingFundAmountRounded);
                        results.vaultTxHash = results.vaultTxHash || fallbackTxHash;
                        console.log(`[trading-fund-service] ✅ Sent ${tradingFundAmountRounded} USD nominal (USDC) to vault (trading fund not configured)`);
                    } catch (fallbackError) {
                        console.error('[trading-fund-service] ❌ Error in fallback transfer:', fallbackError);
                        results.errors.push({ target: 'vault_fallback', error: fallbackError.message });
                    }
                }
            }

            // Log distribution for audit
            console.log(`[trading-fund-service] 📊 Fee distribution completed:`, {
                feeType: feeType,
                totalFee: totalFeeAmount,
                vaultAmount: vaultAmountRounded,
                tradingFundAmount: tradingFundAmountRounded,
                vaultTxHash: results.vaultTxHash,
                tradingFundTxHash: results.tradingFundTxHash,
                txHash: txHash
            });

            return results;
        } catch (error) {
            console.error('[trading-fund-service] ❌ Error distributing fee:', error);
            throw error;
        }
    }

    /**
     * Transfer USDC (Base) to a wallet
     * @param {string} to - Recipient address
     * @param {number} amount - USD nominal (human-readable, 6 decimals)
     * @returns {Promise<string>} Transaction hash
     */
    async transferUSDC(to, amount) {
        try {
            // Convert to USDC units (6 decimals)
            const amountInUnits = parseUnits(amount.toFixed(6), 6);

            // Check balance
            const balance = await this.publicClient.readContract({
                address: USDC_ADDRESS,
                abi: USDC_ABI,
                functionName: 'balanceOf',
                args: [this.account.address]
            });

            const balanceFormatted = parseFloat(formatUnits(balance, 6));
            if (balanceFormatted < amount) {
                throw new Error(`Insufficient balance. Available: ${balanceFormatted} USD nominal, Required: ${amount} USD nominal`);
            }

            // Transfer
            const txHash = await this.walletClient.writeContract({
                address: USDC_ADDRESS,
                abi: USDC_ABI,
                functionName: 'transfer',
                args: [to, amountInUnits]
            });

            // Wait for confirmation
            await this.publicClient.waitForTransactionReceipt({ hash: txHash });

            return txHash;
        } catch (error) {
            console.error('[trading-fund-service] Error transferring USDC (Base):', error);
            throw error;
        }
    }

    /**
     * Get trading fund balance
     * @returns {Promise<number>} Balance USD nominal (USDC)
     */
    async getTradingFundBalance() {
        if (!TRADING_FUND_WALLET) {
            return 0;
        }

        try {
            const balance = await this.publicClient.readContract({
                address: USDC_ADDRESS,
                abi: USDC_ABI,
                functionName: 'balanceOf',
                args: [TRADING_FUND_WALLET]
            });

            return parseFloat(formatUnits(balance, 6));
        } catch (error) {
            console.error('[trading-fund-service] Error getting trading fund balance:', error);
            return 0;
        }
    }
}

module.exports = { TradingFundService };
