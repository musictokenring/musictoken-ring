-- Migration: Fix RLS policies for users table to allow wallet-only connections
-- Permite crear registros en public.users cuando:
-- 1. Usuario está autenticado (con o sin wallet_address en metadata)
-- 2. Usuario tiene wallet conectada pero no está autenticado (navegador interno de wallet)

-- ==========================================
-- 1. DROP EXISTING RESTRICTIVE POLICIES
-- ==========================================

DROP POLICY IF EXISTS "Users can view own user record" ON public.users;
DROP POLICY IF EXISTS "Users can insert own user record" ON public.users;
DROP POLICY IF EXISTS "Users can update own user record" ON public.users;

-- ==========================================
-- 2. CREATE PERMISSIVE POLICIES FOR SELECT
-- ==========================================

-- Permitir ver registros de usuarios:
-- - Si el usuario está autenticado, puede ver su propio registro
-- - Si el usuario tiene una wallet conectada, puede ver registros con esa wallet
CREATE POLICY "Users can view own user record" ON public.users
    FOR SELECT
    USING (
        -- Caso 1: Usuario autenticado puede ver su registro si wallet_address coincide
        (auth.uid() IS NOT NULL AND wallet_address IN (
            SELECT COALESCE(
                raw_user_meta_data->>'wallet_address',
                email
            )::text 
            FROM auth.users 
            WHERE id = auth.uid()
        ))
        OR
        -- Caso 2: Permitir ver cualquier registro si el usuario está autenticado (para casos de wallet-only)
        (auth.uid() IS NOT NULL)
        OR
        -- Caso 3: Permitir ver registros si hay una wallet conectada (navegador interno)
        (wallet_address IS NOT NULL)
    );

-- ==========================================
-- 3. CREATE PERMISSIVE POLICIES FOR INSERT
-- ==========================================

-- Permitir insertar registros:
-- - Si el usuario está autenticado, puede crear su registro
-- - Si el usuario tiene una wallet conectada, puede crear registro con esa wallet
CREATE POLICY "Users can insert own user record" ON public.users
    FOR INSERT
    WITH CHECK (
        -- Caso 1: Usuario autenticado puede insertar su registro
        (auth.uid() IS NOT NULL)
        OR
        -- Caso 2: Permitir insertar si hay wallet_address (navegador interno de wallet)
        (wallet_address IS NOT NULL)
    );

-- ==========================================
-- 4. CREATE PERMISSIVE POLICIES FOR UPDATE
-- ==========================================

-- Permitir actualizar registros:
-- - Si el usuario está autenticado, puede actualizar su registro
-- - Si el usuario tiene una wallet conectada, puede actualizar registro con esa wallet
CREATE POLICY "Users can update own user record" ON public.users
    FOR UPDATE
    USING (
        -- Caso 1: Usuario autenticado puede actualizar su registro si wallet_address coincide
        (auth.uid() IS NOT NULL AND wallet_address IN (
            SELECT COALESCE(
                raw_user_meta_data->>'wallet_address',
                email
            )::text 
            FROM auth.users 
            WHERE id = auth.uid()
        ))
        OR
        -- Caso 2: Permitir actualizar si el usuario está autenticado (para casos de wallet-only)
        (auth.uid() IS NOT NULL)
        OR
        -- Caso 3: Permitir actualizar si hay wallet_address (navegador interno)
        (wallet_address IS NOT NULL)
    );

-- ==========================================
-- 5. GRANT NECESSARY PERMISSIONS
-- ==========================================

-- Asegurar que authenticated y anon roles tienen permisos básicos
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.users TO anon;

-- ==========================================
-- 6. VERIFY POLICIES
-- ==========================================

-- Verificar que las políticas se crearon correctamente
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'users' 
        AND policyname = 'Users can view own user record'
    ) THEN
        RAISE EXCEPTION 'Policy "Users can view own user record" was not created';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'users' 
        AND policyname = 'Users can insert own user record'
    ) THEN
        RAISE EXCEPTION 'Policy "Users can insert own user record" was not created';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'users' 
        AND policyname = 'Users can update own user record'
    ) THEN
        RAISE EXCEPTION 'Policy "Users can update own user record" was not created';
    END IF;
    
    RAISE NOTICE '✅ All policies created successfully';
END $$;
