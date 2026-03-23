-- Script para verificar y ejecutar migración de balance unificado
-- Ejecutar en Supabase SQL Editor si las funciones/columnas no existen

-- 1. Verificar si las columnas existen
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('saldo_fiat', 'saldo_onchain', 'email', 'auth_provider')
ORDER BY column_name;

-- 2. Verificar si la función existe
SELECT 
    routine_name, 
    routine_type
FROM information_schema.routines 
WHERE routine_name = 'get_user_unified_balance'
AND routine_schema = 'public';

-- 3. Si las columnas no existen, ejecutar esto:
DO $$
BEGIN
    -- Agregar columnas si no existen
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'saldo_fiat') THEN
        ALTER TABLE users ADD COLUMN saldo_fiat DECIMAL(20, 6) DEFAULT 0 NOT NULL;
        RAISE NOTICE 'Columna saldo_fiat agregada';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'saldo_onchain') THEN
        ALTER TABLE users ADD COLUMN saldo_onchain DECIMAL(20, 6) DEFAULT 0 NOT NULL;
        RAISE NOTICE 'Columna saldo_onchain agregada';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email') THEN
        ALTER TABLE users ADD COLUMN email TEXT;
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        RAISE NOTICE 'Columna email agregada';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'auth_provider') THEN
        ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'wallet';
        RAISE NOTICE 'Columna auth_provider agregada';
    END IF;
END $$;

-- 4. Crear función get_user_unified_balance si no existe
CREATE OR REPLACE FUNCTION get_user_unified_balance(user_id_param UUID)
RETURNS DECIMAL AS $$
DECLARE
    total_balance DECIMAL;
    fiat_balance DECIMAL;
    onchain_balance DECIMAL;
    credits_balance DECIMAL;
BEGIN
    -- Obtener saldo fiat
    SELECT COALESCE(saldo_fiat, 0) INTO fiat_balance
    FROM users
    WHERE id = user_id_param;
    
    -- Obtener saldo onchain
    SELECT COALESCE(saldo_onchain, 0) INTO onchain_balance
    FROM users
    WHERE id = user_id_param;
    
    -- Obtener créditos legacy
    SELECT COALESCE(credits, 0) INTO credits_balance
    FROM user_credits
    WHERE user_id = user_id_param;
    
    -- Calcular total
    total_balance := COALESCE(fiat_balance, 0) + COALESCE(onchain_balance, 0) + COALESCE(credits_balance, 0);
    
    RETURN COALESCE(total_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Verificar que todo esté creado correctamente
SELECT 'Migración completada - Verificando...' AS status;

SELECT 
    'Columnas en users:' AS check_type,
    COUNT(*) AS count
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('saldo_fiat', 'saldo_onchain', 'email', 'auth_provider');

SELECT 
    'Función get_user_unified_balance:' AS check_type,
    COUNT(*) AS exists
FROM information_schema.routines 
WHERE routine_name = 'get_user_unified_balance'
AND routine_schema = 'public';
