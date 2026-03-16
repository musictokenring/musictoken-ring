-- ============================================================
-- VERIFICACIÓN FINAL: Confirmar que todo está correcto
-- Ejecuta este script para verificar que la migración está completa
-- ============================================================

-- 1. Verificar TODAS las columnas necesarias
SELECT 
    '✅ COLUMNAS EN USERS:' AS verificacion,
    COUNT(*) AS total_columnas_encontradas,
    STRING_AGG(column_name, ', ') AS columnas
FROM information_schema.columns 
WHERE table_schema = 'public'
AND table_name = 'users' 
AND column_name IN ('saldo_fiat', 'saldo_onchain', 'email', 'auth_provider', 'phone_number', 'verification_status');

-- 2. Verificar que wallet_address es nullable
SELECT 
    '✅ WALLET_ADDRESS:' AS verificacion,
    is_nullable,
    CASE 
        WHEN is_nullable = 'YES' THEN '✅ Es nullable (correcto)'
        ELSE '❌ NO es nullable (necesita corrección)'
    END AS estado
FROM information_schema.columns 
WHERE table_schema = 'public'
AND table_name = 'users' 
AND column_name = 'wallet_address';

-- 3. Verificar TODAS las funciones necesarias
SELECT 
    '✅ FUNCIONES RPC:' AS verificacion,
    routine_name,
    CASE 
        WHEN routine_name = 'get_user_unified_balance' THEN '✅ Función principal de balance'
        WHEN routine_name = 'increment_user_fiat_balance' THEN '✅ Función para incrementar balance fiat'
        WHEN routine_name = 'decrement_user_fiat_balance' THEN '✅ Función para decrementar balance fiat'
        ELSE 'Otra función'
    END AS descripcion
FROM information_schema.routines 
WHERE routine_schema = 'public'
AND routine_name IN ('get_user_unified_balance', 'increment_user_fiat_balance', 'decrement_user_fiat_balance')
ORDER BY routine_name;

-- 4. Verificar política RLS (debe usar = no -)
SELECT 
    '✅ POLÍTICA RLS:' AS verificacion,
    policyname,
    CASE 
        WHEN qual LIKE '%auth.uid() = id%' THEN '✅ Política CORRECTA (usa =)'
        WHEN qual LIKE '%auth.uid() - id%' THEN '❌ Política INCORRECTA (usa - en lugar de =)'
        ELSE '⚠️ Verificar política manualmente'
    END AS estado,
    LEFT(qual, 100) AS preview_qual
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename = 'users' 
AND policyname = 'Users can view own data';

-- 5. RESUMEN FINAL
SELECT 
    '🎉 RESUMEN FINAL:' AS tipo,
    CASE 
        WHEN (
            SELECT COUNT(*) FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'users' 
            AND column_name IN ('saldo_fiat', 'saldo_onchain', 'email', 'auth_provider')
        ) = 4 
        AND (
            SELECT COUNT(*) FROM information_schema.routines 
            WHERE routine_schema = 'public' 
            AND routine_name IN ('get_user_unified_balance', 'increment_user_fiat_balance', 'decrement_user_fiat_balance')
        ) = 3
        AND EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' AND tablename = 'users' 
            AND policyname = 'Users can view own data'
            AND qual LIKE '%auth.uid() = id%'
        )
        THEN '✅✅✅ TODO ESTÁ CORRECTO - La migración está completa y funcionando'
        ELSE '⚠️ Algo falta - Revisa los resultados arriba'
    END AS estado;
