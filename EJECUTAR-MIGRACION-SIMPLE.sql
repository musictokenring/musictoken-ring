-- ============================================================
-- MIGRACIÓN SIMPLE Y SEGURA: Hybrid Auth & Fiat Balance Support
-- Ejecutar este archivo completo en Supabase SQL Editor
-- Este script evita problemas de validación de sintaxis
-- ============================================================

-- PASO 1: Hacer wallet_address opcional (nullable)
ALTER TABLE users 
ALTER COLUMN wallet_address DROP NOT NULL;

-- Remover constraint único temporalmente para permitir NULLs
ALTER TABLE users 
DROP CONSTRAINT IF EXISTS users_wallet_address_key;

-- Re-agregar constraint único solo para valores no-null
CREATE UNIQUE INDEX IF NOT EXISTS users_wallet_address_unique 
ON users(wallet_address) 
WHERE wallet_address IS NOT NULL;

-- PASO 2: Agregar columnas nuevas (usar ADD COLUMN IF NOT EXISTS)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

ALTER TABLE users ADD COLUMN IF NOT EXISTS saldo_fiat DECIMAL(20, 6) DEFAULT 0 NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS saldo_onchain DECIMAL(20, 6) DEFAULT 0 NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'wallet';
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unverified';

-- PASO 3: Crear función get_user_unified_balance
CREATE OR REPLACE FUNCTION get_user_unified_balance(user_id_param UUID)
RETURNS DECIMAL AS $$
DECLARE
    total_balance DECIMAL;
    fiat_balance DECIMAL;
    onchain_balance DECIMAL;
    credits_balance DECIMAL;
BEGIN
    -- Obtener saldo fiat desde tabla users
    SELECT COALESCE(saldo_fiat, 0) INTO fiat_balance
    FROM users
    WHERE id = user_id_param;
    
    -- Obtener saldo onchain desde tabla users
    SELECT COALESCE(saldo_onchain, 0) INTO onchain_balance
    FROM users
    WHERE id = user_id_param;
    
    -- Obtener créditos legacy desde user_credits (para compatibilidad hacia atrás)
    SELECT COALESCE(credits, 0) INTO credits_balance
    FROM user_credits
    WHERE user_id = user_id_param;
    
    -- Balance unificado = fiat + onchain + credits
    total_balance := COALESCE(fiat_balance, 0) + COALESCE(onchain_balance, 0) + COALESCE(credits_balance, 0);
    
    RETURN COALESCE(total_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PASO 4: Crear función increment_user_fiat_balance
CREATE OR REPLACE FUNCTION increment_user_fiat_balance(
    user_id_param UUID,
    amount_to_add DECIMAL
) RETURNS VOID AS $$
BEGIN
    UPDATE users
    SET 
        saldo_fiat = COALESCE(saldo_fiat, 0) + amount_to_add,
        updated_at = NOW()
    WHERE id = user_id_param;
    
    -- Si el usuario no existe, crearlo (no debería pasar, pero por seguridad)
    IF NOT FOUND THEN
        INSERT INTO users (id, saldo_fiat, updated_at)
        VALUES (user_id_param, amount_to_add, NOW())
        ON CONFLICT (id) DO UPDATE SET
            saldo_fiat = COALESCE(users.saldo_fiat, 0) + amount_to_add,
            updated_at = NOW();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PASO 5: Crear función decrement_user_fiat_balance
CREATE OR REPLACE FUNCTION decrement_user_fiat_balance(
    user_id_param UUID,
    amount_to_subtract DECIMAL
) RETURNS VOID AS $$
BEGIN
    UPDATE users
    SET 
        saldo_fiat = GREATEST(0, COALESCE(saldo_fiat, 0) - amount_to_subtract),
        updated_at = NOW()
    WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PASO 6: Otorgar permisos a las funciones
GRANT EXECUTE ON FUNCTION get_user_unified_balance(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION increment_user_fiat_balance(UUID, DECIMAL) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION decrement_user_fiat_balance(UUID, DECIMAL) TO authenticated, anon;

-- PASO 7: Actualizar políticas RLS (SOLO después de que las columnas existan)
-- CRÍTICO: Usar EXECUTE format para construir dinámicamente el SQL
DO $$
DECLARE
    email_column_exists BOOLEAN;
BEGIN
    -- Verificar si la columna email existe
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'email'
    ) INTO email_column_exists;
    
    -- Eliminar política anterior
    DROP POLICY IF EXISTS "Users can view own data" ON users;
    
    -- Crear política según si email existe
    IF email_column_exists THEN
        -- Usar EXECUTE format para construir SQL dinámicamente y evitar validación prematura
        EXECUTE format('
            CREATE POLICY "Users can view own data" ON users
                FOR SELECT
                USING (
                    auth.uid() = id OR
                    (email IS NOT NULL AND email = (SELECT email FROM auth.users WHERE id = auth.uid()))
                )
        ');
        RAISE NOTICE '✅ Política RLS creada con soporte para email';
    ELSE
        -- Política básica sin email
        CREATE POLICY "Users can view own data" ON users
            FOR SELECT
            USING (auth.uid() = id);
        RAISE NOTICE '⚠️ Política RLS creada sin soporte para email';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Fallback: política básica si hay cualquier error
        DROP POLICY IF EXISTS "Users can view own data" ON users;
        CREATE POLICY "Users can view own data" ON users
            FOR SELECT
            USING (auth.uid() = id);
        RAISE NOTICE '⚠️ Error creando política, usando política básica: %', SQLERRM;
END $$;

-- PASO 8: Agregar comentarios para documentación
COMMENT ON COLUMN users.wallet_address IS 'Wallet address (nullable - users can exist without wallet)';
COMMENT ON COLUMN users.email IS 'User email from Supabase auth (synced from auth.users)';
COMMENT ON COLUMN users.saldo_fiat IS 'Fiat balance in USD (from Mercado Pago, Nuvei, etc.)';
COMMENT ON COLUMN users.saldo_onchain IS 'On-chain USDC balance (from wallet deposits)';
COMMENT ON COLUMN users.auth_provider IS 'Auth method: wallet, email, google';
COMMENT ON COLUMN users.phone_number IS 'Phone number for Nequi/Daviplata payouts';
COMMENT ON COLUMN users.verification_status IS 'KYC status: unverified, pending, verified';

-- PASO 9: Verificar que todo esté creado correctamente
SELECT '✅ Migración completada - Verificando...' AS status;

-- Verificar columnas
SELECT 
    'Columnas en users:' AS check_type,
    COUNT(*) AS count,
    STRING_AGG(column_name, ', ') AS columnas_encontradas
FROM information_schema.columns 
WHERE table_schema = 'public'
AND table_name = 'users' 
AND column_name IN ('saldo_fiat', 'saldo_onchain', 'email', 'auth_provider', 'phone_number', 'verification_status');

-- Verificar función get_user_unified_balance
SELECT 
    'Función get_user_unified_balance:' AS check_type,
    COUNT(*) AS existe,
    CASE WHEN COUNT(*) > 0 THEN '✅ Función creada' ELSE '❌ Función NO encontrada' END AS estado
FROM information_schema.routines 
WHERE routine_name = 'get_user_unified_balance'
AND routine_schema = 'public';

-- Verificar función increment_user_fiat_balance
SELECT 
    'Función increment_user_fiat_balance:' AS check_type,
    COUNT(*) AS existe,
    CASE WHEN COUNT(*) > 0 THEN '✅ Función creada' ELSE '❌ Función NO encontrada' END AS estado
FROM information_schema.routines 
WHERE routine_name = 'increment_user_fiat_balance'
AND routine_schema = 'public';

-- Verificar función decrement_user_fiat_balance
SELECT 
    'Función decrement_user_fiat_balance:' AS check_type,
    COUNT(*) AS existe,
    CASE WHEN COUNT(*) > 0 THEN '✅ Función creada' ELSE '❌ Función NO encontrada' END AS estado
FROM information_schema.routines 
WHERE routine_name = 'decrement_user_fiat_balance'
AND routine_schema = 'public';

SELECT '🎉 Migración completada exitosamente!' AS resultado_final;
