-- ============================================
-- SOLUCIÓN LISTA PARA EJECUTAR: Vincular wallet al usuario
-- User ID: 52053c46-f6da-4861-9143-fd76d3e8e5d9
-- Wallet: 0x72ecA083FBceb05A4f21B1A9883A57bCD638b6Dd
-- ============================================
-- ✅ WALLET YA CONFIGURADA - LISTO PARA EJECUTAR
-- Esta versión es SEGURA (no elimina usuarios, solo actualiza)
-- ============================================

-- PASO 1: Verificar estado actual (SOLO LECTURA - NO MODIFICA NADA)
SELECT 
    '🔍 ESTADO ACTUAL' AS seccion,
    'Usuario en auth.users' AS tipo,
    au.id::TEXT AS user_id,
    au.email AS email
FROM auth.users au
WHERE au.id = '52053c46-f6da-4861-9143-fd76d3e8e5d9'

UNION ALL

SELECT 
    '🔍 ESTADO ACTUAL',
    'Créditos actuales',
    uc.user_id::TEXT,
    uc.credits::TEXT
FROM user_credits uc
WHERE uc.user_id = '52053c46-f6da-4861-9143-fd76d3e8e5d9'

UNION ALL

SELECT 
    '🔍 ESTADO ACTUAL',
    'Wallet vinculada en user_wallets',
    COALESCE(uw.user_id::TEXT, 'NO VINCULADA'),
    COALESCE(uw.wallet_address, 'NO HAY WALLET')
FROM user_wallets uw
WHERE uw.user_id = '52053c46-f6da-4861-9143-fd76d3e8e5d9'
LIMIT 1;

-- PASO 2: Buscar posibles usuarios duplicados (SOLO LECTURA)
SELECT 
    '⚠️ POSIBLE USUARIO DUPLICADO' AS seccion,
    u.id::TEXT AS user_id_duplicado,
    u.wallet_address AS wallet_encontrada,
    COUNT(DISTINCT d.id) AS total_depositos,
    SUM(d.credits_awarded) AS creditos_depositados,
    'Este usuario fue creado cuando se procesó el depósito' AS nota
FROM users u
INNER JOIN deposits d ON d.user_id = u.id
WHERE u.id != '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID
    AND EXISTS (
        SELECT 1 FROM deposits d2 
        WHERE d2.user_id = '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID
    )
GROUP BY u.id, u.wallet_address
HAVING COUNT(DISTINCT d.id) > 0
ORDER BY total_depositos DESC;

-- ============================================
-- PASO 3: VINCULACIÓN SEGURA (SOLO INSERT/UPDATE - NO DELETE)
-- Wallet: 0x72ecA083FBceb05A4f21B1A9883A57bCD638b6Dd
-- ============================================

DO $$
DECLARE
    v_auth_user_id UUID := '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID;
    v_wallet_address TEXT := '0x72ecA083FBceb05A4f21B1A9883A57bCD638b6Dd'; -- ✅ WALLET REAL DEL USUARIO
    v_users_id UUID;
    v_credits_to_move DECIMAL;
    v_deposits_to_move INTEGER;
BEGIN
    -- Validar formato de wallet address
    IF NOT (v_wallet_address ~ '^0x[a-fA-F0-9]{40}$') THEN
        RAISE EXCEPTION 'Formato de wallet inválido. Debe comenzar con 0x y tener 40 caracteres hexadecimales.';
    END IF;

    v_wallet_address := LOWER(v_wallet_address);

    RAISE NOTICE '========================================';
    RAISE NOTICE 'INICIANDO VINCULACIÓN SEGURA';
    RAISE NOTICE 'Wallet: %', v_wallet_address;
    RAISE NOTICE 'Usuario: %', v_auth_user_id;
    RAISE NOTICE '========================================';
    
    -- Deshabilitar trigger temporalmente para evitar error con NEW.wallet_address
    RAISE NOTICE '⚠️ Deshabilitando trigger update_wallet_last_used temporalmente...';
    ALTER TABLE user_credits DISABLE TRIGGER trigger_update_wallet_last_used_on_credits;

    -- PASO 3.1: Buscar si existe usuario en "users" con esta wallet
    SELECT id INTO v_users_id
    FROM users
    WHERE LOWER(wallet_address) = v_wallet_address
    LIMIT 1;

    -- PASO 3.2: Si existe usuario duplicado, MOVER datos (NO ELIMINAR)
    IF v_users_id IS NOT NULL AND v_users_id != v_auth_user_id THEN
        RAISE NOTICE '⚠️ Usuario duplicado encontrado: % (creado por depósito)', v_users_id;
        
        -- Contar qué se va a mover
        SELECT COALESCE(credits, 0) INTO v_credits_to_move
        FROM user_credits
        WHERE user_id = v_users_id;
        
        SELECT COUNT(*) INTO v_deposits_to_move
        FROM deposits
        WHERE user_id = v_users_id;
        
        RAISE NOTICE 'Se moverán: % créditos y % depósitos', v_credits_to_move, v_deposits_to_move;
        
        -- Mover créditos del usuario duplicado al usuario correcto
        IF v_credits_to_move > 0 THEN
            -- Sumar créditos al usuario correcto
            INSERT INTO user_credits (user_id, credits, updated_at)
            VALUES (v_auth_user_id, v_credits_to_move, NOW())
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                credits = user_credits.credits + v_credits_to_move,
                updated_at = NOW();
            
            -- Actualizar créditos del usuario duplicado a 0 (NO ELIMINAR)
            UPDATE user_credits SET credits = 0, updated_at = NOW() WHERE user_id = v_users_id;
            
            RAISE NOTICE '✅ Créditos movidos: % créditos de % a %', v_credits_to_move, v_users_id, v_auth_user_id;
        END IF;
        
        -- Mover depósitos al usuario correcto
        IF v_deposits_to_move > 0 THEN
            UPDATE deposits SET user_id = v_auth_user_id WHERE user_id = v_users_id;
            RAISE NOTICE '✅ Depósitos movidos: % depósitos al usuario correcto', v_deposits_to_move;
        END IF;
        
        -- ACTUALIZAR usuario duplicado (NO ELIMINAR) - Cambiar wallet para evitar conflictos
        UPDATE users 
        SET wallet_address = v_wallet_address || '_old_' || v_users_id::TEXT,
            updated_at = NOW()
        WHERE id = v_users_id;
        
        RAISE NOTICE '✅ Usuario duplicado actualizado (no eliminado para seguridad)';
    END IF;

    -- PASO 3.3: Crear/actualizar entrada en tabla "users" con el user_id correcto
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

    -- PASO 3.4: Vincular wallet en user_wallets
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

    -- Re-habilitar trigger
    RAISE NOTICE '✅ Re-habilitando trigger update_wallet_last_used...';
    ALTER TABLE user_credits ENABLE TRIGGER trigger_update_wallet_last_used_on_credits;
    
    -- PASO 3.5: Verificar resultado final
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ VINCULACIÓN COMPLETA';
    RAISE NOTICE 'Wallet: %', v_wallet_address;
    RAISE NOTICE 'Usuario: %', v_auth_user_id;
    RAISE NOTICE '========================================';

END $$;

-- PASO 4: Verificación final (SOLO LECTURA)
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
