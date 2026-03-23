-- Migration: Hybrid Auth & Fiat Balance Support
-- Enables email-based auth without wallet, adds fiat balance support
-- Makes wallet_address optional, adds email and saldo_fiat columns

-- 1. Make wallet_address nullable (users can exist without wallet)
ALTER TABLE users 
ALTER COLUMN wallet_address DROP NOT NULL;

-- Remove unique constraint temporarily to allow NULLs
ALTER TABLE users 
DROP CONSTRAINT IF EXISTS users_wallet_address_key;

-- Re-add unique constraint but only for non-null values
CREATE UNIQUE INDEX IF NOT EXISTS users_wallet_address_unique 
ON users(wallet_address) 
WHERE wallet_address IS NOT NULL;

-- 2. Add email column (from Supabase auth.users)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Add index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 3. Add fiat balance column (saldo_fiat in USD)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS saldo_fiat DECIMAL(20, 6) DEFAULT 0 NOT NULL;

-- 4. Add on-chain balance column (saldo_onchain in USDC)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS saldo_onchain DECIMAL(20, 6) DEFAULT 0 NOT NULL;

-- 5. Add auth_provider column (wallet, email, google)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'wallet';

-- 6. Add phone_number column (for Nequi/Daviplata payouts)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- 7. Add verification_status column (for anti-fraud)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unverified'; -- 'unverified', 'pending', 'verified'

-- 8. Create function to get unified balance (fiat + onchain)
CREATE OR REPLACE FUNCTION get_user_unified_balance(user_id_param UUID)
RETURNS DECIMAL AS $$
DECLARE
    total_balance DECIMAL;
    fiat_balance DECIMAL;
    onchain_balance DECIMAL;
    credits_balance DECIMAL;
BEGIN
    -- Get fiat balance from users table
    SELECT COALESCE(saldo_fiat, 0) INTO fiat_balance
    FROM users
    WHERE id = user_id_param;
    
    -- Get on-chain balance from users table
    SELECT COALESCE(saldo_onchain, 0) INTO onchain_balance
    FROM users
    WHERE id = user_id_param;
    
    -- Get credits balance from user_credits (for backwards compatibility)
    SELECT COALESCE(credits, 0) INTO credits_balance
    FROM user_credits
    WHERE user_id = user_id_param;
    
    -- Unified balance = fiat + onchain + credits (credits are legacy, will migrate)
    total_balance := COALESCE(fiat_balance, 0) + COALESCE(onchain_balance, 0) + COALESCE(credits_balance, 0);
    
    RETURN COALESCE(total_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Create function to increment fiat balance
CREATE OR REPLACE FUNCTION increment_user_fiat_balance(
    user_id_param UUID,
    amount_to_add DECIMAL
) RETURNS VOID AS $$
BEGIN
    UPDATE users
    SET 
        saldo_fiat = COALESCE(saldo_fiat, 0) + amount_to_add,
        updated_at = NOW()
    WHERE id = user_id_param;
    
    -- If user doesn't exist, create it (shouldn't happen, but safety)
    IF NOT FOUND THEN
        INSERT INTO users (id, saldo_fiat, updated_at)
        VALUES (user_id_param, amount_to_add, NOW())
        ON CONFLICT (id) DO UPDATE SET
            saldo_fiat = COALESCE(users.saldo_fiat, 0) + amount_to_add,
            updated_at = NOW();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Create function to decrement fiat balance
CREATE OR REPLACE FUNCTION decrement_user_fiat_balance(
    user_id_param UUID,
    amount_to_subtract DECIMAL
) RETURNS VOID AS $$
BEGIN
    UPDATE users
    SET 
        saldo_fiat = GREATEST(0, COALESCE(saldo_fiat, 0) - amount_to_subtract),
        updated_at = NOW()
    WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Create function to sync email from Supabase auth.users
CREATE OR REPLACE FUNCTION sync_user_email_from_auth()
RETURNS TRIGGER AS $$
BEGIN
    -- This will be called from backend after Supabase auth signup
    -- For now, it's a placeholder
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 12. Grant permissions
GRANT EXECUTE ON FUNCTION get_user_unified_balance(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION increment_user_fiat_balance(UUID, DECIMAL) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION decrement_user_fiat_balance(UUID, DECIMAL) TO authenticated, anon;

-- 13. Update RLS policies to allow email-based access
-- Users can view their own data by email or wallet
DROP POLICY IF EXISTS "Users can view own data" ON users;
CREATE POLICY "Users can view own data" ON users
    FOR SELECT
    USING (
        auth.uid() = id OR
        (email IS NOT NULL AND email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    );

-- 14. Add comment for documentation
COMMENT ON COLUMN users.wallet_address IS 'Wallet address (nullable - users can exist without wallet)';
COMMENT ON COLUMN users.email IS 'User email from Supabase auth (synced from auth.users)';
COMMENT ON COLUMN users.saldo_fiat IS 'Fiat balance in USD (from Mercado Pago, Nuvei, etc.)';
COMMENT ON COLUMN users.saldo_onchain IS 'On-chain USDC balance (from wallet deposits)';
COMMENT ON COLUMN users.auth_provider IS 'Auth method: wallet, email, google';
COMMENT ON COLUMN users.phone_number IS 'Phone number for Nequi/Daviplata payouts';
COMMENT ON COLUMN users.verification_status IS 'KYC status: unverified, pending, verified';
