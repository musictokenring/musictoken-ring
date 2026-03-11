/**
 * Sync wallet operations when user logs in with Google/Email after wallet-only operations
 * This function should be called when a user with wallet-only operations logs in
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error('[sync-wallet-on-login] ❌ SUPABASE_SERVICE_ROLE_KEY not configured');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/**
 * Sync wallet operations to authenticated user account
 * Called when user logs in with Google/Email after doing wallet-only operations
 * 
 * @param {string} authUserId - User ID from Supabase auth (Google/Email login)
 * @param {string} walletAddress - Wallet address that was used for operations
 * @returns {Promise<Object>} Sync result
 */
async function syncWalletOnLogin(authUserId, walletAddress) {
    try {
        if (!authUserId || !walletAddress) {
            throw new Error('authUserId and walletAddress are required');
        }

        const normalizedWallet = walletAddress.toLowerCase();

        // Find wallet-only user (created from wallet operations)
        const { data: walletUser } = await supabase
            .from('users')
            .select('id')
            .eq('wallet_address', normalizedWallet)
            .single();

        if (!walletUser) {
            // No wallet-only user found, just link the wallet
            console.log(`[sync-wallet-on-login] No wallet-only user found, linking wallet to auth user`);
            
            // Link wallet to authenticated user
            const { error: linkError } = await supabase
                .from('user_wallets')
                .insert([{
                    user_id: authUserId,
                    wallet_address: normalizedWallet,
                    is_primary: true,
                    linked_via: 'google', // or 'email'
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (linkError && linkError.code !== '23505') { // Ignore if already linked
                throw linkError;
            }

            // Update users table
            await supabase
                .from('users')
                .upsert([{
                    id: authUserId,
                    wallet_address: normalizedWallet,
                    updated_at: new Date().toISOString()
                }], {
                    onConflict: 'id'
                });

            return {
                success: true,
                message: 'Wallet linked to authenticated user',
                merged: false
            };
        }

        // If wallet-only user exists and is different from auth user, merge them
        if (walletUser.id !== authUserId) {
            console.log(`[sync-wallet-on-login] Merging wallet-only user ${walletUser.id} into auth user ${authUserId}`);

            // Get credits from wallet-only user
            const { data: walletCredits } = await supabase
                .from('user_credits')
                .select('credits')
                .eq('user_id', walletUser.id)
                .single();

            const creditsToMerge = walletCredits?.credits || 0;

            // Merge credits
            if (creditsToMerge > 0) {
                const { error: mergeError } = await supabase.rpc('increment_user_credits', {
                    user_id_param: authUserId,
                    credits_to_add: creditsToMerge
                });

                if (mergeError) {
                    // Fallback: direct update
                    const { data: authCredits } = await supabase
                        .from('user_credits')
                        .select('credits')
                        .eq('user_id', authUserId)
                        .single();

                    const newBalance = (authCredits?.credits || 0) + creditsToMerge;
                    await supabase
                        .from('user_credits')
                        .upsert([{
                            user_id: authUserId,
                            credits: newBalance,
                            updated_at: new Date().toISOString()
                        }], {
                            onConflict: 'user_id'
                        });
                }

                // Delete wallet-only user credits
                await supabase
                    .from('user_credits')
                    .delete()
                    .eq('user_id', walletUser.id);
            }

            // Move deposits to auth user
            await supabase
                .from('deposits')
                .update({ user_id: authUserId })
                .eq('user_id', walletUser.id);

            // Move claims to auth user
            await supabase
                .from('claims')
                .update({ user_id: authUserId })
                .eq('user_id', walletUser.id);

            // Link wallet to auth user
            await supabase
                .from('user_wallets')
                .upsert([{
                    user_id: authUserId,
                    wallet_address: normalizedWallet,
                    is_primary: true,
                    linked_via: 'google', // or 'email'
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }], {
                    onConflict: 'wallet_address'
                });

            // Update users table
            await supabase
                .from('users')
                .upsert([{
                    id: authUserId,
                    wallet_address: normalizedWallet,
                    updated_at: new Date().toISOString()
                }], {
                    onConflict: 'id'
                });

            // Delete wallet-only user
            await supabase
                .from('users')
                .delete()
                .eq('id', walletUser.id);

            return {
                success: true,
                message: 'Wallet-only user merged into authenticated user',
                merged: true,
                creditsMerged: creditsToMerge
            };
        } else {
            // Same user, just ensure wallet is linked
            const { error: linkError } = await supabase
                .from('user_wallets')
                .upsert([{
                    user_id: authUserId,
                    wallet_address: normalizedWallet,
                    is_primary: true,
                    linked_via: 'google',
                    updated_at: new Date().toISOString()
                }], {
                    onConflict: 'wallet_address'
                });

            return {
                success: true,
                message: 'Wallet already belongs to authenticated user',
                merged: false
            };
        }

    } catch (error) {
        console.error('[sync-wallet-on-login] Error syncing wallet:', error);
        throw error;
    }
}

module.exports = { syncWalletOnLogin };
