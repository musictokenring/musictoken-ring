-- ============================================================
-- VERIFICACIÓN: Estado de la migración
-- Ejecuta este script para ver qué falta por hacer
-- ============================================================

-- 1. Verificar columnas en tabla users
SELECT 
    'Columnas en users:' AS verificacion,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
AND table_name = 'users' 
AND column_name IN ('saldo_fiat', 'saldo_onchain', 'email', 'auth_provider', 'phone_number', 'verification_status')
ORDER BY column_name;

-- 2. Verificar si wallet_address es nullable
SELECT 
    'Estado de wallet_address:' AS verificacion,
    column_name,
    is_nullable,
    CASE 
        WHEN is_nullable = 'YES' THEN '✅ Es nullable (correcto)'
        ELSE '❌ NO es nullable (necesita corrección)'
    END AS estado
FROM information_schema.columns 
WHERE table_schema = 'public'
AND table_name = 'users' 
AND column_name = 'wallet_address';

-- 3. Verificar funciones RPC
SELECT 
    'Funciones RPC:' AS verificacion,
    routine_name,
    routine_type,
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

-- 4. Verificar política RLS
SELECT 
    'Política RLS:' AS verificacion,
    policyname,
    cmd,
    qual,
    CASE 
        WHEN qual LIKE '%auth.uid() = id%' THEN '✅ Política correcta (usa =)'
        WHEN qual LIKE '%auth.uid() - id%' THEN '❌ Política INCORRECTA (usa - en lugar de =)'
        ELSE '⚠️ Verificar política manualmente'
    END AS estado
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename = 'users' 
AND policyname = 'Users can view own data';

-- 5. Resumen de lo que falta
SELECT 
    'RESUMEN:' AS tipo,
    CASE 
        WHEN NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'saldo_fiat'
        ) THEN '❌ Falta columna saldo_fiat'
        WHEN NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'saldo_onchain'
        ) THEN '❌ Falta columna saldo_onchain'
        WHEN NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
        ) THEN '❌ Falta columna email'
        WHEN NOT EXISTS (
            SELECT 1 FROM information_schema.routines 
            WHERE routine_schema = 'public' AND routine_name = 'get_user_unified_balance'
        ) THEN '❌ Falta función get_user_unified_balance'
        ELSE '✅ Todo parece estar completo - Verifica los resultados arriba'
    END AS estado;
