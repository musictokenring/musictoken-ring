-- ============================================
-- SOLUCIÓN AUTOMÁTICA: Vincular wallets a usuarios con créditos pero sin wallet
-- Este script busca usuarios con créditos pero sin wallet vinculada y los vincula
-- ============================================

-- PASO 1: Identificar usuarios con créditos pero sin wallet vinculada
WITH usuarios_sin_wallet AS (
    SELECT DISTINCT
        uc.user_id,
        au.email,
        uc.credits AS creditos_actuales
    FROM user_credits uc
    INNER JOIN auth.users au ON au.id = uc.user_id
    WHERE NOT EXISTS (
        SELECT 1 FROM user_wallets uw WHERE uw.user_id = uc.user_id
    )
    AND uc.credits > 0
)
SELECT 
    'Usuarios que necesitan wallet vinculada' AS seccion,
    usw.user_id::TEXT AS user_id,
    usw.email,
    usw.creditos_actuales::TEXT AS creditos,
    CASE 
        WHEN EXISTS (SELECT 1 FROM deposits d WHERE d.user_id = usw.user_id LIMIT 1)
        THEN '✅ Tiene depósitos (revisar logs para obtener wallet)'
        ELSE '⚠️ No tiene depósitos registrados'
    END AS estado
FROM usuarios_sin_wallet usw
ORDER BY usw.creditos_actuales DESC;

-- ============================================
-- NOTA IMPORTANTE:
-- Este script solo IDENTIFICA los usuarios que necesitan wallet vinculada.
-- Para vincular automáticamente, necesitarías:
-- 1. Acceso a los logs del backend que muestran qué wallet hizo cada depósito
-- 2. O preguntar a cada usuario qué wallet usó
-- 3. O revisar las transacciones blockchain (tx_hash) para extraer la wallet del remitente
-- ============================================

-- PASO 2: Si conoces la wallet de un usuario específico, usa este bloque:
-- (Reemplaza los valores entre comillas)
/*
DO $$
DECLARE
    v_user_id UUID := '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID;
    v_wallet_address TEXT := '0x...'; -- ⚠️ REEMPLAZA CON LA WALLET REAL
BEGIN
    -- Crear entrada en tabla users si no existe
    INSERT INTO users (
        id,
        wallet_address,
        created_at,
        updated_at
    )
    VALUES (
        v_user_id,
        LOWER(v_wallet_address),
        NOW(),
        NOW()
    )
    ON CONFLICT (wallet_address) 
    DO UPDATE SET
        id = v_user_id,
        updated_at = NOW();
    
    -- Vincular wallet en user_wallets
    INSERT INTO user_wallets (
        user_id,
        wallet_address,
        is_primary,
        linked_via,
        created_at,
        updated_at
    )
    VALUES (
        v_user_id,
        LOWER(v_wallet_address),
        TRUE,
        'manual',
        NOW(),
        NOW()
    )
    ON CONFLICT (wallet_address) 
    DO UPDATE SET
        user_id = v_user_id,
        is_primary = TRUE,
        linked_via = 'manual',
        updated_at = NOW();
    
    RAISE NOTICE '✅ Wallet % vinculada al usuario %', v_wallet_address, v_user_id;
END $$;
*/
