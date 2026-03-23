/**
 * Vault Service
 * Manages liquidity vault for stable credits system
 * Accumulates fees and handles withdrawals
 */

const { createPublicClient, createWalletClient, http, parseUnits, formatUnits } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const VAULT_WALLET_ADDRESS = process.env.VAULT_WALLET_ADDRESS || process.env.ADMIN_WALLET_ADDRESS;
const VAULT_PRIVATE_KEY = process.env.VAULT_WALLET_PRIVATE_KEY || process.env.ADMIN_WALLET_PRIVATE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// 🔒 SEGURIDAD: Función helper para registrar alertas de seguridad
async function logSecurityAlert(alertType, severity, details, userId = null, ipAddress = null, userAgent = null) {
    try {
        const { error } = await supabase.from('security_alerts').insert([{
            alert_type: alertType,
            severity: severity,
            details: details,
            user_id: userId,
            ip_address: ipAddress,
            user_agent: userAgent,
            created_at: new Date().toISOString()
        }]);
        
        if (error) {
            // Si la tabla no existe, solo loguear en consola
            console.error('[vault-service] Error logging security alert:', error.message);
            console.error('[vault-service] ⚠️ Table security_alerts may not exist. Run migration 009_create_security_alerts_table.sql');
        } else {
            console.log(`[vault-service] 🔒 Security alert logged: ${alertType} (${severity})`);
        }
    } catch (err) {
        console.error('[vault-service] Error in logSecurityAlert:', err);
    }
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

class VaultService {
    constructor() {
        if (!VAULT_PRIVATE_KEY) {
            console.warn('[vault-service] VAULT_WALLET_PRIVATE_KEY not set, vault transfers will be disabled');
            this.vaultEnabled = false;
            return;
        }

        this.account = privateKeyToAccount(VAULT_PRIVATE_KEY.startsWith('0x') ? VAULT_PRIVATE_KEY : `0x${VAULT_PRIVATE_KEY}`);
        this.publicClient = createPublicClient({
            chain: base,
            transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
        });
        this.walletClient = createWalletClient({
            account: this.account,
            chain: base,
            transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
        });
        this.vaultEnabled = true;
    }

    /**
     * Get current vault balance (from database and on-chain)
     */
    async getVaultBalance() {
        try {
            // Get from database
            const { data: dbBalance, error: dbError } = await supabase
                .from('vault_balance')
                .select('balance_usdc')
                .order('last_updated', { ascending: false })
                .limit(1)
                .single();

            // Si la tabla no existe, crear registro inicial
            if (dbError && dbError.code === 'PGRST116') {
                console.warn('[vault-service] vault_balance table not found, creating initial record');
                const { error: insertError } = await supabase
                    .from('vault_balance')
                    .insert([{
                        balance_usdc: 0,
                        last_updated: new Date().toISOString(),
                        updated_by: 'system'
                    }]);
                
                if (insertError) {
                    console.error('[vault-service] Error creating initial vault balance:', insertError);
                    return 0;
                }
                
                return 0; // Retornar 0 si es la primera vez
            }

            if (dbError) {
                console.error('[vault-service] Error getting vault balance from DB:', dbError);
                return 0;
            }

            let dbBalanceValue = dbBalance?.balance_usdc || 0;

            // Verify with on-chain balance if vault wallet is configured
            if (this.vaultEnabled && VAULT_WALLET_ADDRESS) {
                try {
                    const onChainBalance = await this.publicClient.readContract({
                        address: USDC_ADDRESS,
                        abi: USDC_ABI,
                        functionName: 'balanceOf',
                        args: [VAULT_WALLET_ADDRESS]
                    });

                    const onChainBalanceFormatted = parseFloat(formatUnits(onChainBalance, 6));

                    // Sync database with on-chain if there's a significant difference
                    const difference = Math.abs(onChainBalanceFormatted - dbBalanceValue);
                    if (difference > 1) { // > 1 USD nominal difference
                        console.log(`[vault-service] Syncing vault balance: DB=${dbBalanceValue}, On-chain=${onChainBalanceFormatted}`);
                        await this.updateVaultBalance(onChainBalanceFormatted, null);
                        return onChainBalanceFormatted;
                    }

                    return onChainBalanceFormatted;
                } catch (error) {
                    console.warn('[vault-service] Error checking on-chain balance, using DB value:', error.message);
                }
            }

            return dbBalanceValue;
        } catch (error) {
            console.error('[vault-service] Error getting vault balance:', error);
            return 0;
        }
    }

    /**
     * Add fee to vault
     */
    async addFee(feeAmount, feeType, sourceTxHash = null, matchId = null) {
        try {
            if (!feeAmount || feeAmount <= 0) {
                throw new Error('Invalid fee amount');
            }

            // Record fee in database
            const { data: feeRecord, error: feeError } = await supabase
                .from('vault_fees')
                .insert([{
                    fee_type: feeType, // 'deposit', 'bet', 'withdrawal'
                    amount: feeAmount,
                    source_tx_hash: sourceTxHash,
                    match_id: matchId,
                    status: 'pending',
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (feeError) {
                throw new Error(`Error recording fee: ${feeError.message}`);
            }

            // Update vault balance in database
            await this.updateVaultBalance(feeAmount, sourceTxHash);

            // If vault wallet is configured and we have admin wallet, transfer fee to vault
            // Note: For now, fees accumulate in admin wallet until vault wallet is configured
            if (this.vaultEnabled && VAULT_WALLET_ADDRESS && this.account.address.toLowerCase() !== VAULT_WALLET_ADDRESS.toLowerCase()) {
                // Transfer fee to vault wallet (if different from admin wallet)
                try {
                    await this.transferToVault(feeAmount, sourceTxHash);
                    
                    // Update fee record
                    await supabase
                        .from('vault_fees')
                        .update({
                            status: 'sent_to_vault',
                            sent_to_vault_at: new Date().toISOString()
                        })
                        .eq('id', feeRecord.id);
                } catch (transferError) {
                    console.error('[vault-service] Error transferring fee to vault:', transferError);
                    // Fee is still recorded, will be transferred later
                }
            } else {
                // Mark as sent if vault wallet is same as admin wallet
                await supabase
                    .from('vault_fees')
                    .update({
                        status: 'sent_to_vault',
                        sent_to_vault_at: new Date().toISOString()
                    })
                    .eq('id', feeRecord.id);
            }

            console.log(`[vault-service] ✅ Fee ${feeAmount} USD nominal (USDC) added to vault (type: ${feeType})`);

            return {
                success: true,
                feeId: feeRecord.id,
                amount: feeAmount,
                vaultBalance: await this.getVaultBalance()
            };

        } catch (error) {
            console.error('[vault-service] Error adding fee:', error);
            throw error;
        }
    }

    /**
     * Update vault balance in database
     */
    async updateVaultBalance(amountToAdd, txHash = null) {
        try {
            const { error } = await supabase.rpc('update_vault_balance', {
                amount_to_add: amountToAdd,
                tx_hash_param: txHash
            });

            if (error) {
                // Fallback: direct update
                const { data: currentBalance } = await supabase
                    .from('vault_balance')
                    .select('balance_usdc')
                    .order('last_updated', { ascending: false })
                    .limit(1)
                    .single();

                const newBalance = (currentBalance?.balance_usdc || 0) + amountToAdd;

                await supabase
                    .from('vault_balance')
                    .upsert([{
                        balance_usdc: newBalance,
                        last_tx_hash: txHash,
                        last_updated: new Date().toISOString(),
                        updated_by: 'vault_service'
                    }], {
                        onConflict: 'id'
                    });
            }
        } catch (error) {
            console.error('[vault-service] Error updating vault balance:', error);
        }
    }

    /**
     * Transfer USDC (Base ERC20) to vault wallet
     */
    async transferToVault(amount, sourceTxHash = null) {
        if (!this.vaultEnabled || !VAULT_WALLET_ADDRESS) {
            console.warn('[vault-service] Vault transfers disabled');
            return null;
        }

        try {
            const amountWei = parseUnits(amount.toFixed(6), 6); // USDC has 6 decimals

            // Check admin wallet balance
            const adminBalance = await this.publicClient.readContract({
                address: USDC_ADDRESS,
                abi: USDC_ABI,
                functionName: 'balanceOf',
                args: [this.account.address]
            });

            const adminBalanceFormatted = parseFloat(formatUnits(adminBalance, 6));

            if (adminBalanceFormatted < amount) {
                throw new Error(`Insufficient balance in admin wallet. Available: ${adminBalanceFormatted}, Required: ${amount}`);
            }

            console.log(`[vault-service] Transferring ${amount} USD nominal (USDC) to vault ${VAULT_WALLET_ADDRESS}`);

            const txHash = await this.walletClient.writeContract({
                address: USDC_ADDRESS,
                abi: USDC_ABI,
                functionName: 'transfer',
                args: [VAULT_WALLET_ADDRESS, amountWei]
            });

            // Wait for confirmation
            await this.publicClient.waitForTransactionReceipt({ hash: txHash });

            console.log(`[vault-service] ✅ Transferred ${amount} USD nominal (USDC) to vault. Tx: ${txHash}`);

            return txHash;

        } catch (error) {
            console.error('[vault-service] Error transferring to vault:', error);
            throw error;
        }
    }

    /**
     * Check if vault has sufficient balance for withdrawal
     */
    async canWithdraw(amount) {
        try {
            const vaultBalance = await this.getVaultBalance();
            return vaultBalance >= amount;
        } catch (error) {
            console.error('[vault-service] Error checking vault balance:', error);
            return false;
        }
    }

    /**
     * Withdraw from vault (for claim payouts)
     * @param {number} amount - Amount to withdraw
     * @param {string} recipientAddress - Recipient wallet address
     * @param {string} reason - Reason for withdrawal
     * @param {string} userId - User ID (for audit)
     * @param {Object} requestInfo - Request metadata (ip, userAgent) for audit
     */
    async withdrawFromVault(amount, recipientAddress, reason = 'claim_payout', userId = null, requestInfo = {}) {
        if (!this.vaultEnabled || !VAULT_WALLET_ADDRESS) {
            throw new Error('Vault wallet not configured');
        }

        try {
            // 🔒 SEGURIDAD: Validar formato de dirección
            if (!/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
                throw new Error('Invalid recipient address format');
            }

            // Check balance
            const canWithdraw = await this.canWithdraw(amount);
            if (!canWithdraw) {
                const balance = await this.getVaultBalance();
                throw new Error(`Insufficient vault balance. Available: ${balance} USD nominal, Required: ${amount} USD nominal`);
            }

            // 🔒 SEGURIDAD: Validar que la dirección de destino no sea sospechosa
            // Lista de direcciones conocidas como sospechosas (puede expandirse)
            const SUSPICIOUS_ADDRESSES = [
                // Agregar direcciones conocidas como maliciosas aquí si es necesario
            ];
            
            const recipientLower = recipientAddress.toLowerCase();
            if (SUSPICIOUS_ADDRESSES.includes(recipientLower)) {
                await logSecurityAlert(
                    'SUSPICIOUS_WITHDRAWAL_ADDRESS',
                    'critical',
                    { recipientAddress, amount, reason, userId },
                    userId,
                    requestInfo.ip,
                    requestInfo.userAgent
                );
                throw new Error('Withdrawal to suspicious address blocked');
            }

            // 🔒 SEGURIDAD: Registrar transacción en auditoría ANTES de transferir
            let auditRecordId = null;
            try {
                const { data: auditRecord, error: auditError } = await supabase
                    .from('vault_transactions')
                    .insert([{
                        transaction_type: 'withdrawal',
                        user_id: userId,
                        wallet_address: recipientAddress.toLowerCase(),
                        amount_usdc: amount,
                        reason: reason,
                        status: 'pending',
                        ip_address: requestInfo.ip || null,
                        user_agent: requestInfo.userAgent || null,
                        created_at: new Date().toISOString()
                    }])
                    .select('id')
                    .single();

                if (auditError) {
                    // Si la tabla no existe, solo loguear warning pero continuar
                    console.warn('[vault-service] ⚠️ Could not log transaction to audit table:', auditError.message);
                    console.warn('[vault-service] ⚠️ Table vault_transactions may not exist. Run migration 008_create_vault_transactions_table.sql');
                    console.warn('[vault-service] ⚠️ Transaction will proceed but audit log is missing.');
                } else {
                    auditRecordId = auditRecord?.id;
                    console.log(`[vault-service] 🔒 Audit log created: ${auditRecordId}`);
                }
            } catch (auditError) {
                console.error('[vault-service] Error creating audit log:', auditError);
                // No bloquear la transacción si falla el logging, pero registrar el error
            }

            // If vault wallet is different from admin wallet, we need to transfer from vault to admin first
            // For now, we'll use admin wallet directly if it has enough balance
            // In production, you'd want to transfer from vault wallet to admin, then to user

            const amountWei = parseUnits(amount.toFixed(6), 6);

            // Check if we should use vault wallet or admin wallet
            const useVaultWallet = VAULT_WALLET_ADDRESS.toLowerCase() !== this.account.address.toLowerCase();
            
            let sourceWallet = this.account.address;
            let walletClient = this.walletClient;

            if (useVaultWallet) {
                // In production, you'd create a wallet client for vault wallet
                // For now, we'll use admin wallet if it has balance
                const adminBalance = await this.publicClient.readContract({
                    address: USDC_ADDRESS,
                    abi: USDC_ABI,
                    functionName: 'balanceOf',
                    args: [this.account.address]
                });

                const adminBalanceFormatted = parseFloat(formatUnits(adminBalance, 6));

                if (adminBalanceFormatted < amount) {
                    throw new Error(`Vault withdrawal requires vault wallet setup. Admin balance: ${adminBalanceFormatted}, Required: ${amount}`);
                }
            }

            console.log(`[vault-service] 🔒 Withdrawing ${amount} USD nominal (USDC) from vault to ${recipientAddress}`);
            console.log(`[vault-service] 🔒 User ID: ${userId || 'N/A'}, Reason: ${reason}`);

            // Transfer USDC to recipient
            const txHash = await walletClient.writeContract({
                address: USDC_ADDRESS,
                abi: USDC_ABI,
                functionName: 'transfer',
                args: [recipientAddress, amountWei]
            });

            // Wait for confirmation
            const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

            if (receipt.status !== 'success') {
                throw new Error('Transaction failed on blockchain');
            }

            // Update vault balance (subtract)
            await this.updateVaultBalance(-amount, txHash);

            // 🔒 SEGURIDAD: Actualizar registro de auditoría después de transferir
            if (auditRecordId) {
                try {
                    await supabase
                        .from('vault_transactions')
                        .update({
                            status: 'completed',
                            tx_hash: txHash,
                            completed_at: new Date().toISOString()
                        })
                        .eq('id', auditRecordId);
                    
                    console.log(`[vault-service] 🔒 Audit log updated: ${auditRecordId}`);
                } catch (updateError) {
                    console.error('[vault-service] Error updating audit log:', updateError);
                }
            }

            console.log(`[vault-service] ✅ Withdrew ${amount} USD nominal (USDC) from vault. Tx: ${txHash}`);

            return txHash;

        } catch (error) {
            // 🔒 SEGURIDAD: Registrar error en auditoría si hay registro pendiente
            if (auditRecordId) {
                try {
                    await supabase
                        .from('vault_transactions')
                        .update({
                            status: 'failed',
                            error_message: error.message,
                            completed_at: new Date().toISOString()
                        })
                        .eq('id', auditRecordId);
                } catch (updateError) {
                    console.error('[vault-service] Error updating audit log on failure:', updateError);
                }
            }

            console.error('[vault-service] Error withdrawing from vault:', error);
            throw error;
        }
    }

    /**
     * Get vault statistics
     */
    async getVaultStats() {
        try {
            const balance = await this.getVaultBalance();

            // Get total fees by type
            const { data: feesByType } = await supabase
                .from('vault_fees')
                .select('fee_type, amount')
                .eq('status', 'sent_to_vault');

            const stats = {
                balance: balance,
                totalFees: {
                    deposit: 0,
                    bet: 0,
                    withdrawal: 0
                },
                pendingFees: 0,
                lastUpdated: new Date().toISOString()
            };

            if (feesByType) {
                feesByType.forEach(fee => {
                    if (stats.totalFees[fee.fee_type]) {
                        stats.totalFees[fee.fee_type] += parseFloat(fee.amount || 0);
                    }
                });
            }

            // Get pending fees
            const { data: pendingFees } = await supabase
                .from('vault_fees')
                .select('amount')
                .eq('status', 'pending');

            if (pendingFees) {
                stats.pendingFees = pendingFees.reduce((sum, fee) => sum + parseFloat(fee.amount || 0), 0);
            }

            return stats;

        } catch (error) {
            console.error('[vault-service] Error getting vault stats:', error);
            return {
                balance: 0,
                totalFees: { deposit: 0, bet: 0, withdrawal: 0 },
                pendingFees: 0,
                error: error.message
            };
        }
    }
}

module.exports = { VaultService };
