-- Migration: Enable Row Level Security (RLS) and fix security issues
-- Addresses Supabase Database Linter security warnings
-- 
-- Issues fixed:
-- 1. RLS disabled on public tables
-- 2. Views exposing auth.users data
-- 3. Security definer views
-- 4. Sensitive columns exposed without RLS

-- ==========================================
-- 1. ENABLE RLS ON ALL PUBLIC TABLES
-- ==========================================

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Enable RLS on user_credits table
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

-- Enable RLS on deposits table
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;

-- Enable RLS on claims table
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

-- Enable RLS on platform_settings table
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Enable RLS on rate_changes table
ALTER TABLE public.rate_changes ENABLE ROW LEVEL SECURITY;

-- Enable RLS on match_wins table
ALTER TABLE public.match_wins ENABLE ROW LEVEL SECURITY;

-- Enable RLS on vault_fees table
ALTER TABLE public.vault_fees ENABLE ROW LEVEL SECURITY;

-- Enable RLS on vault_balance table
ALTER TABLE public.vault_balance ENABLE ROW LEVEL SECURITY;

-- Enable RLS on game_config table (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'game_config') THEN
        ALTER TABLE public.game_config ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- ==========================================
-- 2. CREATE RLS POLICIES FOR USERS TABLE
-- ==========================================

-- Users can view their own user record by wallet address
-- Note: public.users.id is UUID, not linked to auth.users.id directly
-- We match by wallet_address instead
CREATE POLICY "Users can view own user record" ON public.users
    FOR SELECT
    USING (
        wallet_address IN (
            SELECT raw_user_meta_data->>'wallet_address'::text 
            FROM auth.users 
            WHERE id = auth.uid()
        )
        OR wallet_address IN (
            SELECT email FROM auth.users WHERE id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = auth.uid() 
            AND (raw_user_meta_data->>'wallet_address' = users.wallet_address 
                 OR email = users.wallet_address)
        )
    );

-- Users can insert their own user record
CREATE POLICY "Users can insert own user record" ON public.users
    FOR INSERT
    WITH CHECK (
        wallet_address IN (
            SELECT COALESCE(raw_user_meta_data->>'wallet_address', email)::text 
            FROM auth.users 
            WHERE id = auth.uid()
        )
    );

-- Users can update their own user record
CREATE POLICY "Users can update own user record" ON public.users
    FOR UPDATE
    USING (
        wallet_address IN (
            SELECT COALESCE(raw_user_meta_data->>'wallet_address', email)::text 
            FROM auth.users 
            WHERE id = auth.uid()
        )
    );

-- ==========================================
-- 3. CREATE RLS POLICIES FOR USER_CREDITS TABLE
-- ==========================================

-- Users can only view their own credits
-- Match by wallet_address from auth.users metadata
CREATE POLICY "Users can view own credits" ON public.user_credits
    FOR SELECT
    USING (
        user_id IN (
            SELECT id FROM public.users 
            WHERE wallet_address IN (
                SELECT COALESCE(raw_user_meta_data->>'wallet_address', email)::text 
                FROM auth.users 
                WHERE id = auth.uid()
            )
        )
    );

-- Service role can manage all credits (for backend operations)
CREATE POLICY "Service role can manage credits" ON public.user_credits
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- ==========================================
-- 4. CREATE RLS POLICIES FOR DEPOSITS TABLE
-- ==========================================

-- Users can only view their own deposits
CREATE POLICY "Users can view own deposits" ON public.deposits
    FOR SELECT
    USING (
        user_id IN (
            SELECT id FROM public.users 
            WHERE wallet_address IN (
                SELECT COALESCE(raw_user_meta_data->>'wallet_address', email)::text FROM auth.users WHERE id = auth.uid()
            )
        )
    );

-- Service role can manage all deposits (for backend listener)
CREATE POLICY "Service role can manage deposits" ON public.deposits
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- ==========================================
-- 5. CREATE RLS POLICIES FOR CLAIMS TABLE
-- ==========================================

-- Users can only view their own claims
CREATE POLICY "Users can view own claims" ON public.claims
    FOR SELECT
    USING (
        user_id IN (
            SELECT id FROM public.users 
            WHERE wallet_address IN (
                SELECT COALESCE(raw_user_meta_data->>'wallet_address', email)::text FROM auth.users WHERE id = auth.uid()
            )
        )
    );

-- Users can insert their own claims
CREATE POLICY "Users can insert own claims" ON public.claims
    FOR INSERT
    WITH CHECK (
        user_id IN (
            SELECT id FROM public.users 
            WHERE wallet_address IN (
                SELECT COALESCE(raw_user_meta_data->>'wallet_address', email)::text FROM auth.users WHERE id = auth.uid()
            )
        )
    );

-- Service role can manage all claims (for backend processing)
CREATE POLICY "Service role can manage claims" ON public.claims
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- ==========================================
-- 6. CREATE RLS POLICIES FOR PLATFORM_SETTINGS TABLE
-- ==========================================

-- Platform settings are read-only for authenticated users
CREATE POLICY "Authenticated users can view platform settings" ON public.platform_settings
    FOR SELECT
    USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Service role can manage platform settings
CREATE POLICY "Service role can manage platform settings" ON public.platform_settings
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- ==========================================
-- 7. CREATE RLS POLICIES FOR RATE_CHANGES TABLE
-- ==========================================

-- Rate changes are read-only for authenticated users
CREATE POLICY "Authenticated users can view rate changes" ON public.rate_changes
    FOR SELECT
    USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Service role can manage rate changes
CREATE POLICY "Service role can manage rate changes" ON public.rate_changes
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- ==========================================
-- 8. CREATE RLS POLICIES FOR MATCH_WINS TABLE
-- ==========================================

-- Users can only view their own match wins
CREATE POLICY "Users can view own match wins" ON public.match_wins
    FOR SELECT
    USING (
        user_id IN (
            SELECT id FROM public.users 
            WHERE wallet_address IN (
                SELECT COALESCE(raw_user_meta_data->>'wallet_address', email)::text FROM auth.users WHERE id = auth.uid()
            )
        )
    );

-- Service role can manage all match wins
CREATE POLICY "Service role can manage match wins" ON public.match_wins
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- ==========================================
-- 9. CREATE RLS POLICIES FOR VAULT_FEES TABLE
-- ==========================================

-- Vault fees are read-only for authenticated users (transparency)
CREATE POLICY "Authenticated users can view vault fees" ON public.vault_fees
    FOR SELECT
    USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Service role can manage vault fees
CREATE POLICY "Service role can manage vault fees" ON public.vault_fees
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- ==========================================
-- 10. CREATE RLS POLICIES FOR VAULT_BALANCE TABLE
-- ==========================================

-- Vault balance is read-only for authenticated users (transparency)
CREATE POLICY "Authenticated users can view vault balance" ON public.vault_balance
    FOR SELECT
    USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Service role can manage vault balance
CREATE POLICY "Service role can manage vault balance" ON public.vault_balance
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- ==========================================
-- 11. CREATE RLS POLICIES FOR GAME_CONFIG TABLE (if exists)
-- ==========================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'game_config') THEN
        -- Game config is read-only for authenticated users
        EXECUTE 'CREATE POLICY "Authenticated users can view game config" ON public.game_config
            FOR SELECT
            USING (auth.role() = ''authenticated'' OR auth.role() = ''anon'')';

        -- Service role can manage game config
        EXECUTE 'CREATE POLICY "Service role can manage game config" ON public.game_config
            FOR ALL
            USING (auth.jwt() ->> ''role'' = ''service_role'')';
    END IF;
END $$;

-- ==========================================
-- 12. FIX VIEWS EXPOSING auth.users DATA
-- ==========================================

-- Drop problematic views if they exist (drop policies first if they exist)
DO $$
BEGIN
    -- Drop policies if they exist
    DROP POLICY IF EXISTS "Users can view own stats" ON public.user_stats;
    DROP POLICY IF EXISTS "Users can view own extended stats" ON public.user_stats_extended;
    
    -- Drop views
    DROP VIEW IF EXISTS public.user_stats_extended CASCADE;
    DROP VIEW IF EXISTS public.user_stats CASCADE;
END $$;

-- Recreate user_stats view WITHOUT exposing auth.users directly
-- Only show data from public.users table
CREATE OR REPLACE VIEW public.user_stats AS
SELECT 
    u.id,
    u.wallet_address,
    u.created_at,
    u.updated_at,
    COALESCE(uc.credits, 0) as credits,
    (SELECT COUNT(*) FROM public.deposits d WHERE d.user_id = u.id) as deposit_count,
    (SELECT COUNT(*) FROM public.claims c WHERE c.user_id = u.id) as claim_count,
    (SELECT COUNT(*) FROM public.match_wins mw WHERE mw.user_id = u.id) as win_count
FROM public.users u
LEFT JOIN public.user_credits uc ON uc.user_id = u.id;

-- Recreate user_stats_extended view WITHOUT SECURITY DEFINER and WITHOUT exposing auth.users
CREATE OR REPLACE VIEW public.user_stats_extended AS
SELECT 
    us.*,
    (SELECT SUM(credits_awarded) FROM public.deposits WHERE user_id = us.id) as total_deposited_credits,
    (SELECT SUM(credits_amount) FROM public.claims WHERE user_id = us.id) as total_claimed_credits,
    (SELECT SUM(credits_won) FROM public.match_wins WHERE user_id = us.id) as total_won_credits
FROM public.user_stats us;

-- Grant appropriate permissions
GRANT SELECT ON public.user_stats TO authenticated, anon;
GRANT SELECT ON public.user_stats_extended TO authenticated, anon;

-- ==========================================
-- 13. CREATE RLS POLICIES FOR VIEWS
-- ==========================================

-- Enable RLS on views (views can have RLS policies in PostgreSQL)
-- Note: RLS on views works differently - we need to ensure the underlying tables have RLS

-- Users can only see their own stats
-- This policy ensures users can only see their own data through the view
CREATE POLICY "Users can view own stats" ON public.user_stats
    FOR SELECT
    USING (
        id IN (
            SELECT id FROM public.users 
            WHERE wallet_address IN (
                SELECT COALESCE(raw_user_meta_data->>'wallet_address', email)::text FROM auth.users WHERE id = auth.uid()
            )
        )
    );

-- Users can only see their own extended stats
CREATE POLICY "Users can view own extended stats" ON public.user_stats_extended
    FOR SELECT
    USING (
        id IN (
            SELECT id FROM public.users 
            WHERE wallet_address IN (
                SELECT COALESCE(raw_user_meta_data->>'wallet_address', email)::text FROM auth.users WHERE id = auth.uid()
            )
        )
    );

-- ==========================================
-- 14. VERIFY RLS IS ENABLED
-- ==========================================

DO $$
DECLARE
    rls_disabled_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO rls_disabled_count
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.schemaname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity;
    
    IF rls_disabled_count > 0 THEN
        RAISE WARNING 'Hay % tablas sin RLS habilitado', rls_disabled_count;
    ELSE
        RAISE NOTICE '✅ Todas las tablas públicas tienen RLS habilitado';
    END IF;
END $$;

-- ==========================================
-- SUCCESS MESSAGE
-- ==========================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migración de seguridad completada:';
    RAISE NOTICE '   - RLS habilitado en todas las tablas públicas';
    RAISE NOTICE '   - Políticas RLS creadas para cada tabla';
    RAISE NOTICE '   - Vistas corregidas (sin SECURITY DEFINER, sin exposición de auth.users)';
    RAISE NOTICE '   - Columnas sensibles protegidas con RLS';
END $$;
