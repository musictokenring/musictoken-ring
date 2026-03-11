/**
 * Wallet Link Service
 * Handles linking wallets to authenticated users
 * Enables wallet-based authentication in internal wallet browsers
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error('[wallet-link-service] ❌ SUPABASE_SERVICE_ROLE_KEY not configured');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

class WalletLinkService {
    /**
     * Link wallet to authenticated user
     * @param {string} userId - User ID from Supabase auth
     * @param {string} walletAddress - Wallet address to link
     * @param {Object} requestInfo - Request metadata (ip, userAgent, linkedVia)
     * @returns {Promise<Object>} Link result
     */
    async linkWallet(userId, walletAddress, requestInfo = {}) {
        try {
            // Validate wallet address format
            if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
                throw new Error('Invalid wallet address format');
            }

            const normalizedWallet = walletAddress.toLowerCase();

            // Check if wallet is already linked to another user
            const { data: existingLink, error: checkError } = await supabase
                .from('user_wallets')
                .select('user_id, users!inner(email)')
                .eq('wallet_address', normalizedWallet)
                .single();

            if (existingLink && existingLink.user_id !== userId) {
                console.error(`[wallet-link-service] ⚠️ Wallet ${normalizedWallet} already linked to user ${existingLink.user_id}`);
                return {
                    success: false,
                    error: 'Wallet already linked to another account',
                    existingUserId: existingLink.user_id
                };
            }

            // Check if wallet is already linked to this user
            if (existingLink && existingLink.user_id === userId) {
                console.log(`[wallet-link-service] ✅ Wallet ${normalizedWallet} already linked to user ${userId}`);
                return {
                    success: true,
                    alreadyLinked: true,
                    walletId: existingLink.id
                };
            }

            // Check if user has a primary wallet
            const { data: primaryWallet } = await supabase
                .from('user_wallets')
                .select('id')
                .eq('user_id', userId)
                .eq('is_primary', true)
                .single();

            const isPrimary = !primaryWallet; // First wallet becomes primary

            // Link wallet to user
            const { data: newLink, error: linkError } = await supabase
                .from('user_wallets')
                .insert([{
                    user_id: userId,
                    wallet_address: normalizedWallet,
                    is_primary: isPrimary,
                    linked_via: requestInfo.linkedVia || 'manual',
                    ip_address: requestInfo.ip || null,
                    user_agent: requestInfo.userAgent || null,
                    linked_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (linkError) {
                console.error('[wallet-link-service] Error linking wallet:', linkError);
                throw linkError;
            }

            // Update users table wallet_address if this is primary wallet
            if (isPrimary) {
                const { error: updateError } = await supabase
                    .from('users')
                    .update({ wallet_address: normalizedWallet })
                    .eq('id', userId);

                if (updateError) {
                    console.warn('[wallet-link-service] Warning: Could not update users.wallet_address:', updateError);
                }
            }

            console.log(`[wallet-link-service] ✅ Wallet ${normalizedWallet} linked to user ${userId} (primary: ${isPrimary})`);

            return {
                success: true,
                walletId: newLink.id,
                isPrimary: isPrimary
            };

        } catch (error) {
            console.error('[wallet-link-service] Error in linkWallet:', error);
            throw error;
        }
    }

    /**
     * Get user ID from wallet address
     * @param {string} walletAddress - Wallet address to lookup
     * @returns {Promise<string|null>} User ID if wallet is linked, null otherwise
     */
    async getUserIdFromWallet(walletAddress) {
        try {
            if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
                return null;
            }

            const normalizedWallet = walletAddress.toLowerCase();

            // Check in user_wallets table first
            const { data: walletLink, error: walletError } = await supabase
                .from('user_wallets')
                .select('user_id, is_primary')
                .eq('wallet_address', normalizedWallet)
                .single();

            if (walletLink && !walletError) {
                // Update last_used_at
                await supabase
                    .from('user_wallets')
                    .update({ last_used_at: new Date().toISOString() })
                    .eq('wallet_address', normalizedWallet);

                return walletLink.user_id;
            }

            // Fallback: Check in users table (for backward compatibility)
            const { data: user, error: userError } = await supabase
                .from('users')
                .select('id')
                .eq('wallet_address', normalizedWallet)
                .single();

            if (user && !userError) {
                return user.id;
            }

            return null;

        } catch (error) {
            console.error('[wallet-link-service] Error in getUserIdFromWallet:', error);
            return null;
        }
    }

    /**
     * Get all wallets linked to a user
     * @param {string} userId - User ID
     * @returns {Promise<Array>} Array of linked wallets
     */
    async getUserWallets(userId) {
        try {
            const { data: wallets, error } = await supabase
                .from('user_wallets')
                .select('*')
                .eq('user_id', userId)
                .order('is_primary', { ascending: false })
                .order('linked_at', { ascending: false });

            if (error) {
                throw error;
            }

            return wallets || [];

        } catch (error) {
            console.error('[wallet-link-service] Error in getUserWallets:', error);
            throw error;
        }
    }

    /**
     * Unlink wallet from user
     * @param {string} userId - User ID
     * @param {string} walletAddress - Wallet address to unlink
     * @returns {Promise<Object>} Unlink result
     */
    async unlinkWallet(userId, walletAddress) {
        try {
            const normalizedWallet = walletAddress.toLowerCase();

            // Check if wallet is linked to this user
            const { data: walletLink } = await supabase
                .from('user_wallets')
                .select('id, is_primary')
                .eq('user_id', userId)
                .eq('wallet_address', normalizedWallet)
                .single();

            if (!walletLink) {
                return {
                    success: false,
                    error: 'Wallet not linked to this user'
                };
            }

            // Don't allow unlinking primary wallet if user has other wallets
            if (walletLink.is_primary) {
                const { data: otherWallets } = await supabase
                    .from('user_wallets')
                    .select('id')
                    .eq('user_id', userId)
                    .neq('wallet_address', normalizedWallet)
                    .limit(1);

                if (otherWallets && otherWallets.length > 0) {
                    // Make another wallet primary before unlinking
                    await supabase
                        .from('user_wallets')
                        .update({ is_primary: true })
                        .eq('id', otherWallets[0].id);
                }
            }

            // Unlink wallet
            const { error } = await supabase
                .from('user_wallets')
                .delete()
                .eq('user_id', userId)
                .eq('wallet_address', normalizedWallet);

            if (error) {
                throw error;
            }

            return {
                success: true
            };

        } catch (error) {
            console.error('[wallet-link-service] Error in unlinkWallet:', error);
            throw error;
        }
    }
}

module.exports = { WalletLinkService };
