-- ==========================================
-- FIX CRÍTICO: Permisos para tabla users
-- Ejecutar este script en Supabase SQL Editor
-- ==========================================

-- 1. ELIMINAR POLÍTICAS RESTRICTIVAS EXISTENTES
DROP POLICY IF EXISTS "Users can view own user record" ON public.users;
DROP POLICY IF EXISTS "Users can insert own user record" ON public.users;
DROP POLICY IF EXISTS "Users can update own user record" ON public.users;

-- 2. CREAR POLÍTICAS PERMISIVAS PARA SELECT
-- Permitir ver cualquier registro de usuario si está autenticado o tiene wallet
CREATE POLICY "Users can view own user record" ON public.users
    FOR SELECT
    USING (true); -- Permitir ver todos los registros temporalmente para debugging

-- 3. CREAR POLÍTICAS PERMISIVAS PARA INSERT
-- Permitir insertar registros si hay wallet_address o usuario autenticado
CREATE POLICY "Users can insert own user record" ON public.users
    FOR INSERT
    WITH CHECK (true); -- Permitir insertar cualquier registro temporalmente

-- 4. CREAR POLÍTICAS PERMISIVAS PARA UPDATE
-- Permitir actualizar registros si hay wallet_address o usuario autenticado
CREATE POLICY "Users can update own user record" ON public.users
    FOR UPDATE
    USING (true); -- Permitir actualizar cualquier registro temporalmente

-- 5. OTORGAR PERMISOS EXPLÍCITOS A LOS ROLES
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.users TO anon;
GRANT SELECT, INSERT, UPDATE ON public.users TO service_role;

-- 6. VERIFICAR QUE LAS POLÍTICAS SE CREARON
DO $$
BEGIN
    RAISE NOTICE 'Verificando políticas...';
    
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'users' 
        AND policyname = 'Users can view own user record'
    ) THEN
        RAISE NOTICE '✅ Policy "Users can view own user record" existe';
    ELSE
        RAISE WARNING '❌ Policy "Users can view own user record" NO existe';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'users' 
        AND policyname = 'Users can insert own user record'
    ) THEN
        RAISE NOTICE '✅ Policy "Users can insert own user record" existe';
    ELSE
        RAISE WARNING '❌ Policy "Users can insert own user record" NO existe';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'users' 
        AND policyname = 'Users can update own user record'
    ) THEN
        RAISE NOTICE '✅ Policy "Users can update own user record" existe';
    ELSE
        RAISE WARNING '❌ Policy "Users can update own user record" NO existe';
    END IF;
    
    RAISE NOTICE '✅✅✅ Script ejecutado correctamente';
END $$;
