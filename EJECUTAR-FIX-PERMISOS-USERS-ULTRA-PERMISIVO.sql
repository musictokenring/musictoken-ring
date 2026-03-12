-- ==========================================
-- FIX CRÍTICO ULTRA-PERMISIVO: Permisos para tabla users
-- ⚠️ TEMPORAL: Solo para debugging - permite acceso completo
-- Ejecutar este script en Supabase SQL Editor
-- ==========================================

-- 1. ELIMINAR TODAS LAS POLÍTICAS EXISTENTES
DROP POLICY IF EXISTS "Users can view own user record" ON public.users;
DROP POLICY IF EXISTS "Users can insert own user record" ON public.users;
DROP POLICY IF EXISTS "Users can update own user record" ON public.users;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.users;
DROP POLICY IF EXISTS "Enable update for users based on email" ON public.users;

-- 2. DESHABILITAR RLS TEMPORALMENTE (SOLO PARA DEBUGGING)
-- ⚠️ ADVERTENCIA: Esto desactiva la seguridad RLS completamente
-- Solo usar para diagnosticar problemas, luego reactivar RLS
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 3. OTORGAR PERMISOS EXPLÍCITOS A TODOS LOS ROLES
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO service_role;

-- 4. VERIFICAR QUE RLS ESTÁ DESHABILITADO
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'users' 
        AND rowsecurity = false
    ) THEN
        RAISE NOTICE '✅ RLS deshabilitado temporalmente en tabla users';
    ELSE
        RAISE WARNING '❌ RLS aún está habilitado';
    END IF;
    
    RAISE NOTICE '✅✅✅ Script ejecutado - RLS deshabilitado temporalmente';
    RAISE WARNING '⚠️⚠️⚠️ IMPORTANTE: Reactivar RLS después de diagnosticar el problema';
END $$;
