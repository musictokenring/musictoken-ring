-- ==========================================
-- QUÉ MIGRACIONES FALTAN - VERIFICACIÓN SIMPLE
-- ==========================================
-- Este script te dice EXACTAMENTE qué migraciones necesitas ejecutar

-- ==========================================
-- 1. VERIFICAR 001_credits_system.sql
-- ==========================================

SELECT 
    '001_credits_system.sql' as migracion,
    CASE 
        WHEN COUNT(*) = 7 THEN '✅ YA EJECUTADA'
        ELSE '❌ FALTA EJECUTAR'
    END as estado,
    COUNT(*) || '/7 tablas encontradas' as detalle
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('users', 'user_credits', 'deposits', 'claims', 'platform_settings', 'rate_changes', 'match_wins');

-- ==========================================
-- 2. VERIFICAR 004_enable_rls_security.sql
-- ==========================================

SELECT 
    '004_enable_rls_security.sql' as migracion,
    CASE 
        WHEN COUNT(*) >= 7 THEN '✅ YA EJECUTADA'
        ELSE '❌ FALTA EJECUTAR'
    END as estado,
    COUNT(*) || '/9+ tablas con RLS' as detalle
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE t.schemaname = 'public'
AND c.relkind = 'r'
AND c.relrowsecurity = true
AND tablename IN ('users', 'user_credits', 'deposits', 'claims', 'platform_settings', 'rate_changes', 'match_wins', 'vault_fees', 'vault_balance');

-- ==========================================
-- 3. VERIFICAR 002_stable_credits_system.sql
-- ==========================================

SELECT 
    '002_stable_credits_system.sql' as migracion,
    CASE 
        WHEN COUNT(*) = 2 THEN '✅ YA EJECUTADA'
        ELSE '❌ FALTA EJECUTAR'
    END as estado,
    COUNT(*) || '/2 tablas de vault encontradas' as detalle
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('vault_fees', 'vault_balance');

-- ==========================================
-- 4. VERIFICAR 008_fix_rpc_permissions.sql
-- ==========================================

SELECT 
    '008_fix_rpc_permissions.sql' as migracion,
    CASE 
        WHEN COUNT(*) = 2 THEN '✅ YA EJECUTADA'
        ELSE '❌ FALTA EJECUTAR'
    END as estado,
    COUNT(*) || '/2 funciones con SECURITY DEFINER' as detalle
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND proname IN ('increment_user_credits', 'decrement_user_credits')
AND prosecdef = true;

-- ==========================================
-- RESUMEN FINAL CON RUTAS
-- ==========================================

DO $$
DECLARE
    tables_count INTEGER;
    rls_count INTEGER;
    vault_tables_count INTEGER;
    rpc_security_count INTEGER;
    faltan_migraciones BOOLEAN := false;
BEGIN
    -- Contar tablas principales
    SELECT COUNT(*) INTO tables_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('users', 'user_credits', 'deposits', 'claims', 'platform_settings', 'rate_changes', 'match_wins');
    
    -- Contar tablas con RLS
    SELECT COUNT(*) INTO rls_count
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
    
    -- Contar funciones RPC con SECURITY DEFINER
    SELECT COUNT(*) INTO rpc_security_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    AND proname IN ('increment_user_credits', 'decrement_user_credits')
    AND prosecdef = true;
    
    RAISE NOTICE '';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'RESUMEN DE MIGRACIONES';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '';
    
    -- 001
    IF tables_count = 7 THEN
        RAISE NOTICE '✅ 001_credits_system.sql - EJECUTADA';
    ELSE
        RAISE NOTICE '❌ 001_credits_system.sql - FALTA EJECUTAR';
        RAISE NOTICE '   Ruta: c:\NUEVO MUSICTOKENRING-OPERATIVO\supabase\migrations\001_credits_system.sql';
        faltan_migraciones := true;
    END IF;
    
    -- 004
    IF rls_count >= 7 THEN
        RAISE NOTICE '✅ 004_enable_rls_security.sql - EJECUTADA';
    ELSE
        RAISE NOTICE '❌ 004_enable_rls_security.sql - FALTA EJECUTAR';
        RAISE NOTICE '   Ruta: c:\NUEVO MUSICTOKENRING-OPERATIVO\supabase\migrations\004_enable_rls_security.sql';
        faltan_migraciones := true;
    END IF;
    
    -- 002
    IF vault_tables_count = 2 THEN
        RAISE NOTICE '✅ 002_stable_credits_system.sql - EJECUTADA';
    ELSE
        RAISE NOTICE '❌ 002_stable_credits_system.sql - FALTA EJECUTAR';
        RAISE NOTICE '   Ruta: c:\NUEVO MUSICTOKENRING-OPERATIVO\supabase\migrations\002_stable_credits_system.sql';
        faltan_migraciones := true;
    END IF;
    
    -- 008
    IF rpc_security_count = 2 THEN
        RAISE NOTICE '✅ 008_fix_rpc_permissions.sql - EJECUTADA';
    ELSE
        RAISE NOTICE '❌ 008_fix_rpc_permissions.sql - FALTA EJECUTAR';
        RAISE NOTICE '   Ruta: c:\NUEVO MUSICTOKENRING-OPERATIVO\supabase\migrations\008_fix_rpc_permissions.sql';
        faltan_migraciones := true;
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '==========================================';
    
    IF NOT faltan_migraciones THEN
        RAISE NOTICE '✅ TODAS LAS MIGRACIONES ESTÁN EJECUTADAS';
        RAISE NOTICE '';
        RAISE NOTICE 'PRÓXIMOS PASOS:';
        RAISE NOTICE '1. Recarga el frontend (Ctrl+F5)';
        RAISE NOTICE '2. Inicia sesión con Google/Email';
        RAISE NOTICE '3. Conecta tu wallet';
        RAISE NOTICE '4. Verifica que la conversión automática funcione';
    ELSE
        RAISE NOTICE '⚠️  FALTAN MIGRACIONES POR EJECUTAR';
        RAISE NOTICE '';
        RAISE NOTICE 'EJECUTA LAS MIGRACIONES EN ESTE ORDEN:';
        IF tables_count < 7 THEN
            RAISE NOTICE '1. PRIMERO: 001_credits_system.sql';
        END IF;
        IF rls_count < 7 THEN
            RAISE NOTICE '2. SEGUNDO: 004_enable_rls_security.sql';
        END IF;
        IF vault_tables_count < 2 THEN
            RAISE NOTICE '3. TERCERO: 002_stable_credits_system.sql';
        END IF;
        IF rpc_security_count < 2 THEN
            RAISE NOTICE '4. CUARTO: 008_fix_rpc_permissions.sql';
        END IF;
    END IF;
    
    RAISE NOTICE '';
END $$;
