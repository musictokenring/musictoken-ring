-- ==========================================
-- VERIFICAR PERMISOS EN TABLA matches
-- El match se está creando como null, puede ser un problema de permisos
-- ==========================================

-- 1. Verificar políticas RLS en matches
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'matches'
ORDER BY policyname;

-- 2. Verificar si RLS está habilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'matches';

-- 3. Verificar permisos de INSERT en matches
SELECT 
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public'
AND table_name = 'matches'
AND privilege_type = 'INSERT';

-- 4. Verificar que authenticated y anon pueden insertar
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.table_privileges
            WHERE table_schema = 'public'
            AND table_name = 'matches'
            AND grantee = 'authenticated'
            AND privilege_type = 'INSERT'
        ) THEN '✅ authenticated puede INSERT'
        ELSE '❌ authenticated NO puede INSERT'
    END as authenticated_insert,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.table_privileges
            WHERE table_schema = 'public'
            AND table_name = 'matches'
            AND grantee = 'anon'
            AND privilege_type = 'INSERT'
        ) THEN '✅ anon puede INSERT'
        ELSE '❌ anon NO puede INSERT'
    END as anon_insert;
