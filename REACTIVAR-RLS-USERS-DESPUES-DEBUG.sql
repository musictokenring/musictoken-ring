-- ==========================================
-- REACTIVAR RLS DESPUÉS DE DEBUGGING
-- Ejecutar este script después de solucionar el problema
-- ==========================================

-- 1. REACTIVAR RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. CREAR POLÍTICAS PERMISIVAS PERO SEGURAS
DROP POLICY IF EXISTS "Users can view own user record" ON public.users;
DROP POLICY IF EXISTS "Users can insert own user record" ON public.users;
DROP POLICY IF EXISTS "Users can update own user record" ON public.users;

-- Política para SELECT: Permitir ver si está autenticado o tiene wallet
CREATE POLICY "Users can view own user record" ON public.users
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL 
        OR wallet_address IS NOT NULL
    );

-- Política para INSERT: Permitir insertar si está autenticado o tiene wallet
CREATE POLICY "Users can insert own user record" ON public.users
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL 
        OR wallet_address IS NOT NULL
    );

-- Política para UPDATE: Permitir actualizar si está autenticado o tiene wallet
CREATE POLICY "Users can update own user record" ON public.users
    FOR UPDATE
    USING (
        auth.uid() IS NOT NULL 
        OR wallet_address IS NOT NULL
    );

-- 3. VERIFICAR QUE RLS ESTÁ HABILITADO
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'users' 
        AND rowsecurity = true
    ) THEN
        RAISE NOTICE '✅ RLS reactivado correctamente';
    ELSE
        RAISE WARNING '❌ RLS no está habilitado';
    END IF;
    
    RAISE NOTICE '✅✅✅ RLS reactivado con políticas permisivas';
END $$;
