-- ==========================================
-- VERIFICAR MIGRACIONES EJECUTADAS
-- ==========================================
-- Este script te ayuda a verificar qué migraciones ya están ejecutadas
-- y cuáles faltan por ejecutar

-- ==========================================
-- 1. VERIFICAR FUNCIONES RPC (008_fix_rpc_permissions.sql)
-- ==========================================

SELECT 
    '008_fix_rpc_permissions.sql' as migracion,
    proname as funcion,
    prosecdef as tiene_security_definer,
    CASE 
        WHEN prosecdef = true THEN '✅ EJECUTADA'
        ELSE '❌ FALTA EJECUTAR'
    END as estado
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND proname IN ('increment_user_credits', 'decrement_user_credits')
ORDER BY proname;

-- ==========================================
-- 2. VERIFICAR TABLAS DEL SISTEMA (001_credits_system.sql)
-- ==========================================

SELECT 
    '001_credits_system.sql' as migracion,
    table_name as tabla,
    CASE 
        WHEN table_name IS NOT NULL THEN '✅ EXISTE'
        ELSE '❌ NO EXISTE'
    END as estado
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
    'users',
    'user_credits',
    'deposits',
    'claims',
    'platform_settings',
    'rate_changes',
    'match_wins'
)
ORDER BY table_name;

-- ==========================================
-- 3. VERIFICAR RLS HABILITADO (004_enable_rls_security.sql)
-- ==========================================

SELECT 
    '004_enable_rls_security.sql' as migracion,
    tablename as tabla,
    CASE 
        WHEN relrowsecurity = true THEN '✅ RLS HABILITADO'
        ELSE '❌ RLS DESHABILITADO'
    END as estado_rls
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE t.schemaname = 'public'
AND c.relkind = 'r'
AND tablename IN (
    'users',
    'user_credits',
    'deposits',
    'claims',
    'platform_settings',
    'rate_changes',
    'match_wins'
)
ORDER BY tablename;

-- ==========================================
-- 4. VERIFICAR TABLAS DE VAULT (002_stable_credits_system.sql)
-- ==========================================

SELECT 
    '002_stable_credits_system.sql' as migracion,
    table_name as tabla,
    CASE 
        WHEN table_name IS NOT NULL THEN '✅ EXISTE'
        ELSE '❌ NO EXISTE'
    END as estado
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
    'vault_fees',
    'vault_balance'
)
ORDER BY table_name;

-- ==========================================
-- 5. RESUMEN GENERAL
-- ==========================================

DO $$
DECLARE
    rpc_count INTEGER;
    tables_count INTEGER;
    rls_enabled_count INTEGER;
    vault_tables_count INTEGER;
BEGIN
    -- Contar funciones RPC con SECURITY DEFINER
    SELECT COUNT(*) INTO rpc_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    AND proname IN ('increment_user_credits', 'decrement_user_credits')
    AND prosecdef = true;
    
    -- Contar tablas principales
    SELECT COUNT(*) INTO tables_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('users', 'user_credits', 'deposits', 'claims', 'platform_settings', 'rate_changes', 'match_wins');
    
    -- Contar tablas con RLS habilitado
    SELECT COUNT(*) INTO rls_enabled_count
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.schemaname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = true
    AND tablename IN ('users', 'user_credits', 'deposits', 'claims', 'platform_settings', 'rate_changes', 'match_wins');
    
    -- Contar tablas de vault
    SELECT COUNT(*) INTO vault_tables_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('vault_fees', 'vault_balance');
    
    RAISE NOTICE '';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'RESUMEN DE MIGRACIONES';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '';
    RAISE NOTICE '008_fix_rpc_permissions.sql:';
    IF rpc_count = 2 THEN
        RAISE NOTICE '  ✅ Funciones RPC con SECURITY DEFINER: %/2', rpc_count;
    ELSE
        RAISE NOTICE '  ❌ Funciones RPC con SECURITY DEFINER: %/2 (FALTA EJECUTAR 008)', rpc_count;
    END IF;
    RAISE NOTICE '';
    RAISE NOTICE '001_credits_system.sql:';
    IF tables_count = 7 THEN
        RAISE NOTICE '  ✅ Tablas principales: %/7', tables_count;
    ELSE
        RAISE NOTICE '  ⚠️  Tablas principales: %/7 (FALTA EJECUTAR 001)', tables_count;
    END IF;
    RAISE NOTICE '';
    RAISE NOTICE '004_enable_rls_security.sql:';
    IF rls_enabled_count = 7 THEN
        RAISE NOTICE '  ✅ Tablas con RLS: %/7', rls_enabled_count;
    ELSE
        RAISE NOTICE '  ⚠️  Tablas con RLS: %/7 (FALTA EJECUTAR 004)', rls_enabled_count;
    END IF;
    RAISE NOTICE '';
    RAISE NOTICE '002_stable_credits_system.sql:';
    IF vault_tables_count = 2 THEN
        RAISE NOTICE '  ✅ Tablas de vault: %/2', vault_tables_count;
    ELSE
        RAISE NOTICE '  ⚠️  Tablas de vault: %/2 (FALTA EJECUTAR 002)', vault_tables_count;
    END IF;
    RAISE NOTICE '';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '';
    
    -- Recomendación
    IF rpc_count = 2 THEN
        RAISE NOTICE '✅ La migración 008 ya está ejecutada correctamente';
        RAISE NOTICE '';
        RAISE NOTICE 'PRÓXIMOS PASOS:';
        RAISE NOTICE '1. Si las tablas principales no existen, ejecuta: 001_credits_system.sql';
        RAISE NOTICE '2. Si RLS no está habilitado, ejecuta: 004_enable_rls_security.sql';
        RAISE NOTICE '3. Si las tablas de vault no existen, ejecuta: 002_stable_credits_system.sql';
        RAISE NOTICE '4. Después de ejecutar las migraciones necesarias, prueba el frontend';
    ELSE
        RAISE NOTICE '❌ La migración 008 NO está ejecutada correctamente';
        RAISE NOTICE '   Ejecuta: supabase/migrations/008_fix_rpc_permissions.sql';
    END IF;
    RAISE NOTICE '';
END $$;
