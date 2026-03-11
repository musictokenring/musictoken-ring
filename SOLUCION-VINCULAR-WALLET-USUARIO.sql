-- ============================================
-- SOLUCIÓN: Vincular wallet a usuario con créditos pero sin wallet
-- User ID: 52053c46-f6da-4861-9143-fd76d3e8e5d9
-- ============================================
-- 
-- IMPORTANTE: Necesitas saber la wallet address del usuario antes de ejecutar esto
-- Puedes obtenerla de:
-- 1. El usuario mismo (preguntarle qué wallet usó para depositar)
-- 2. Los logs del backend cuando hizo el depósito
-- 3. La transacción blockchain del depósito (tx_hash)
--
-- Una vez que tengas la wallet address, reemplaza 'WALLET_ADDRESS_AQUI' abajo
-- ============================================

-- PASO 1: Verificar que el usuario existe en auth.users
DO $$
DECLARE
    v_user_exists BOOLEAN;
    v_wallet_address TEXT := 'WALLET_ADDRESS_AQUI'; -- ⚠️ REEMPLAZA ESTO CON LA WALLET REAL
BEGIN
    -- Verificar usuario
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = '52053c46-f6da-4861-9143-fd76d3e8e5d9') INTO v_user_exists;
    
    IF NOT v_user_exists THEN
        RAISE EXCEPTION 'Usuario no existe en auth.users';
    END IF;
    
    -- Verificar que se proporcionó una wallet válida
    IF v_wallet_address = 'WALLET_ADDRESS_AQUI' THEN
        RAISE EXCEPTION 'Debes reemplazar WALLET_ADDRESS_AQUI con la wallet address real del usuario';
    END IF;
    
    -- PASO 2: Crear entrada en tabla users si no existe
    INSERT INTO users (
        id,
        wallet_address,
        created_at,
        updated_at
    )
    VALUES (
        '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID,
        LOWER(v_wallet_address),
        NOW(),
        NOW()
    )
    ON CONFLICT (wallet_address) 
    DO UPDATE SET
        id = '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID,
        updated_at = NOW();
    
    -- PASO 3: Vincular wallet en user_wallets
    INSERT INTO user_wallets (
        user_id,
        wallet_address,
        is_primary,
        linked_via,
        created_at,
        updated_at
    )
    VALUES (
        '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID,
        LOWER(v_wallet_address),
        TRUE,
        'manual',
        NOW(),
        NOW()
    )
    ON CONFLICT (wallet_address) 
    DO UPDATE SET
        user_id = '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID,
        is_primary = TRUE,
        linked_via = 'manual',
        updated_at = NOW();
    
    RAISE NOTICE '✅ Wallet vinculada correctamente al usuario';
END $$;

-- PASO 4: Verificar vinculación exitosa
SELECT 
    '✅ Verificación Final' AS estado,
    uw.wallet_address,
    uw.user_id::TEXT AS usuario_vinculado,
    au.email,
    uw.is_primary AS es_principal,
    uw.linked_via AS metodo_vinculacion,
    uw.created_at AS vinculada_en,
    uc.credits AS creditos_actuales
FROM user_wallets uw
LEFT JOIN auth.users au ON au.id = uw.user_id
LEFT JOIN user_credits uc ON uc.user_id = uw.user_id
WHERE uw.user_id = '52053c46-f6da-4861-9143-fd76d3e8e5d9';
