-- ============================================
-- SOLUCIÓN COMPLETA: Vincular wallet al usuario actual
-- User ID: 52053c46-f6da-4861-9143-fd76d3e8e5d9
-- ============================================
-- 
-- INSTRUCCIONES:
-- 1. Ejecuta este script DESPUÉS de obtener la wallet address del usuario
-- 2. Reemplaza 'WALLET_ADDRESS_AQUI' con la wallet real del usuario
-- 3. Este script vinculará la wallet y unirá usuarios duplicados si existen
-- ============================================

DO $$
DECLARE
    v_auth_user_id UUID := '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID;
    v_wallet_address TEXT := 'WALLET_ADDRESS_AQUI'; -- ⚠️ REEMPLAZA CON LA WALLET REAL
    v_users_id UUID;
    v_credits_to_move DECIMAL;
BEGIN
    -- Validar que se proporcionó wallet
    IF v_wallet_address = 'WALLET_ADDRESS_AQUI' THEN
        RAISE EXCEPTION 'Debes reemplazar WALLET_ADDRESS_AQUI con la wallet address real del usuario';
    END IF;

    v_wallet_address := LOWER(v_wallet_address);

    -- PASO 1: Buscar si existe usuario en "users" con esta wallet (usuario creado por depósito)
    SELECT id INTO v_users_id
    FROM users
    WHERE LOWER(wallet_address) = v_wallet_address
    LIMIT 1;

    -- PASO 2: Si existe usuario duplicado, unir los datos
    IF v_users_id IS NOT NULL AND v_users_id != v_auth_user_id THEN
        RAISE NOTICE '⚠️ Usuario duplicado encontrado: % (creado por depósito)', v_users_id;
        
        -- Mover créditos del usuario duplicado al usuario correcto
        SELECT COALESCE(credits, 0) INTO v_credits_to_move
        FROM user_credits
        WHERE user_id = v_users_id;
        
        IF v_credits_to_move > 0 THEN
            -- Sumar créditos al usuario correcto
            INSERT INTO user_credits (user_id, credits, updated_at)
            VALUES (v_auth_user_id, v_credits_to_move, NOW())
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                credits = user_credits.credits + v_credits_to_move,
                updated_at = NOW();
            
            -- Eliminar créditos del usuario duplicado
            DELETE FROM user_credits WHERE user_id = v_users_id;
            
            RAISE NOTICE '✅ Créditos movidos: % créditos de % a %', v_credits_to_move, v_users_id, v_auth_user_id;
        END IF;
        
        -- Mover depósitos al usuario correcto
        UPDATE deposits SET user_id = v_auth_user_id WHERE user_id = v_users_id;
        RAISE NOTICE '✅ Depósitos movidos al usuario correcto';
        
        -- Eliminar usuario duplicado
        DELETE FROM users WHERE id = v_users_id;
        RAISE NOTICE '✅ Usuario duplicado eliminado';
    END IF;

    -- PASO 3: Crear/actualizar entrada en tabla "users" con el user_id correcto
    INSERT INTO users (
        id,
        wallet_address,
        created_at,
        updated_at
    )
    VALUES (
        v_auth_user_id,
        v_wallet_address,
        NOW(),
        NOW()
    )
    ON CONFLICT (wallet_address) 
    DO UPDATE SET
        id = v_auth_user_id,
        updated_at = NOW();
    
    RAISE NOTICE '✅ Usuario creado/actualizado en tabla users';

    -- PASO 4: Vincular wallet en user_wallets
    INSERT INTO user_wallets (
        user_id,
        wallet_address,
        is_primary,
        linked_via,
        created_at,
        updated_at
    )
    VALUES (
        v_auth_user_id,
        v_wallet_address,
        TRUE,
        'manual',
        NOW(),
        NOW()
    )
    ON CONFLICT (wallet_address) 
    DO UPDATE SET
        user_id = v_auth_user_id,
        is_primary = TRUE,
        linked_via = COALESCE(user_wallets.linked_via, 'manual'),
        updated_at = NOW();
    
    RAISE NOTICE '✅ Wallet vinculada en user_wallets';

    -- PASO 5: Verificar resultado final
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ VINCULACIÓN COMPLETA';
    RAISE NOTICE 'Wallet: %', v_wallet_address;
    RAISE NOTICE 'Usuario: %', v_auth_user_id;
    RAISE NOTICE '========================================';

END $$;

-- Verificación final
SELECT 
    '✅ Verificación Final' AS estado,
    uw.wallet_address,
    uw.user_id::TEXT AS usuario_vinculado,
    au.email,
    uw.is_primary AS es_principal,
    uw.linked_via AS metodo_vinculacion,
    uw.created_at AS vinculada_en,
    COALESCE(uc.credits, 0) AS creditos_actuales
FROM user_wallets uw
LEFT JOIN auth.users au ON au.id = uw.user_id
LEFT JOIN user_credits uc ON uc.user_id = uw.user_id
WHERE uw.user_id = '52053c46-f6da-4861-9143-fd76d3e8e5d9';
