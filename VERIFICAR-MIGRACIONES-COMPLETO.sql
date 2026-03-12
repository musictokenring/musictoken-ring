-- ==========================================
-- VERIFICACIÓN COMPLETA DE MIGRACIONES
-- ==========================================
-- Ejecuta este script para ver TODAS las migraciones y su estado

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
    'match_wins',
    'vault_fees',
    'vault_balance'
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
-- 5. VERIFICAR FUNCIONES DE VAULT (002_stable_credits_system.sql)
-- ==========================================

SELECT 
    '002_stable_credits_system.sql' as migracion,
    proname as funcion,
    CASE 
        WHEN proname IS NOT NULL THEN '✅ EXISTE'
        ELSE '❌ NO EXISTE'
    END as estado
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND proname IN (
    'update_vault_balance',
    'get_vault_balance'
)
ORDER BY proname;

-- ==========================================
-- 6. RESUMEN GENERAL CON RECOMENDACIONES
-- ==========================================

DO $$
DECLARE
    rpc_count INTEGER;
    rpc_security_definer_count INTEGER;
    tables_count INTEGER;
    rls_enabled_count INTEGER;
    vault_tables_count INTEGER;
    vault_functions_count INTEGER;
BEGIN
    -- Contar funciones RPC totales
    SELECT COUNT(*) INTO rpc_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    AND proname IN ('increment_user_credits', 'decrement_user_credits');
    
    -- Contar funciones RPC con SECURITY DEFINER
    SELECT COUNT(*) INTO rpc_security_definer_count
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
    AND tablename IN ('users', 'user_credits', 'deposits', 'claims', 'platform_settings', 'rate_changes', 'match_wins', 'vault_fees', 'vault_balance');
    
    -- Contar tablas de vault
    SELECT COUNT(*) INTO vault_tables_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('vault_fees', 'vault_balance');
    
    -- Contar funciones de vault
    SELECT COUNT(*) INTO vault_functions_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    AND proname IN ('update_vault_balance', 'get_vault_balance');
    
    RAISE NOTICE '';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'RESUMEN COMPLETO DE MIGRACIONES';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '';
    
    -- Verificación 008
    RAISE NOTICE '008_fix_rpc_permissions.sql:';
    IF rpc_count = 0 THEN
        RAISE NOTICE '  ❌ Funciones RPC NO EXISTEN (FALTA EJECUTAR 001)';
    ELSIF rpc_security_definer_count = 2 THEN
        RAISE NOTICE '  ✅ Funciones RPC con SECURITY DEFINER: %/2', rpc_security_definer_count;
    ELSE
        RAISE NOTICE '  ⚠️  Funciones RPC encontradas: %/2', rpc_count;
        RAISE NOTICE '  ⚠️  Con SECURITY DEFINER: %/2 (FALTA EJECUTAR 008)', rpc_security_definer_count;
    END IF;
    RAISE NOTICE '';
    
    -- Verificación 001
    RAISE NOTICE '001_credits_system.sql:';
    IF tables_count = 7 THEN
        RAISE NOTICE '  ✅ Tablas principales: %/7', tables_count;
    ELSE
        RAISE NOTICE '  ⚠️  Tablas principales: %/7 (FALTA EJECUTAR 001)', tables_count;
    END IF;
    RAISE NOTICE '';
    
    -- Verificación 004
    RAISE NOTICE '004_enable_rls_security.sql:';
    IF rls_enabled_count >= 7 THEN
        RAISE NOTICE '  ✅ Tablas con RLS: %/9+', rls_enabled_count;
    ELSE
        RAISE NOTICE '  ⚠️  Tablas con RLS: %/9+ (FALTA EJECUTAR 004)', rls_enabled_count;
    END IF;
    RAISE NOTICE '';
    
    -- Verificación 002
    RAISE NOTICE '002_stable_credits_system.sql:';
    IF vault_tables_count = 2 AND vault_functions_count = 2 THEN
        RAISE NOTICE '  ✅ Tablas de vault: %/2', vault_tables_count;
        RAISE NOTICE '  ✅ Funciones de vault: %/2', vault_functions_count;
    ELSIF vault_tables_count = 2 THEN
        RAISE NOTICE '  ✅ Tablas de vault: %/2', vault_tables_count;
        RAISE NOTICE '  ⚠️  Funciones de vault: %/2 (PARCIAL)', vault_functions_count;
    ELSE
        RAISE NOTICE '  ⚠️  Tablas de vault: %/2 (FALTA EJECUTAR 002)', vault_tables_count;
        RAISE NOTICE '  ⚠️  Funciones de vault: %/2', vault_functions_count;
    END IF;
    RAISE NOTICE '';
    
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'RECOMENDACIONES:';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '';
    
    -- Recomendaciones específicas
    IF tables_count < 7 THEN
        RAISE NOTICE '1. ⚠️  EJECUTAR: 001_credits_system.sql';
        RAISE NOTICE '   Ruta: supabase/migrations/001_credits_system.sql';
        RAISE NOTICE '';
    END IF;
    
    IF rls_enabled_count < 7 THEN
        RAISE NOTICE '2. ⚠️  EJECUTAR: 004_enable_rls_security.sql';
        RAISE NOTICE '   Ruta: supabase/migrations/004_enable_rls_security.sql';
        RAISE NOTICE '';
    END IF;
    
    IF vault_tables_count < 2 OR vault_functions_count < 2 THEN
        RAISE NOTICE '3. ⚠️  EJECUTAR: 002_stable_credits_system.sql';
        RAISE NOTICE '   Ruta: supabase/migrations/002_stable_credits_system.sql';
        RAISE NOTICE '';
    END IF;
    
    IF rpc_security_definer_count < 2 THEN
        RAISE NOTICE '4. ⚠️  EJECUTAR: 008_fix_rpc_permissions.sql';
        RAISE NOTICE '   Ruta: supabase/migrations/008_fix_rpc_permissions.sql';
        RAISE NOTICE '';
    END IF;
    
    -- Estado final
    IF tables_count = 7 AND rls_enabled_count >= 7 AND vault_tables_count = 2 AND vault_functions_count = 2 AND rpc_security_definer_count = 2 THEN
        RAISE NOTICE '✅ TODAS LAS MIGRACIONES CRÍTICAS ESTÁN EJECUTADAS';
        RAISE NOTICE '';
        RAISE NOTICE 'PRÓXIMOS PASOS:';
        RAISE NOTICE '1. Recarga el frontend (Ctrl+F5)';
        RAISE NOTICE '2. Inicia sesión con Google/Email';
        RAISE NOTICE '3. Conecta tu wallet';
        RAISE NOTICE '4. Verifica que la conversión automática funcione';
    ELSE
        RAISE NOTICE '⚠️  FALTAN MIGRACIONES POR EJECUTAR';
        RAISE NOTICE '   Revisa las recomendaciones arriba';
    END IF;
    RAISE NOTICE '';
END $$;
