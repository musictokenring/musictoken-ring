-- ============================================
-- VINCULAR WALLET A AMBOS USUARIOS
-- Wallet: 0x72ecA083FBceb05A4f21B1A9883A57bCD638b6Dd
-- Usuario 1: 52053c46-f6da-4861-9143-fd76d3e8e5d9 (ya vinculado)
-- Usuario 2: 978e9e29-11b0-405d-bf68-b20622016aad (el que usa el frontend)
-- ============================================

-- PASO 1: Verificar ambos usuarios
SELECT 
    '🔍 USUARIO 1' AS seccion,
    au1.id::TEXT AS user_id,
    au1.email AS email,
    au1.created_at::TEXT AS fecha_registro
FROM auth.users au1
WHERE au1.id = '52053c46-f6da-4861-9143-fd76d3e8e5d9'

UNION ALL

SELECT 
    '🔍 USUARIO 2',
    au2.id::TEXT,
    au2.email,
    au2.created_at::TEXT
FROM auth.users au2
WHERE au2.id = '978e9e29-11b0-405d-bf68-b20622016aad';

-- PASO 2: Verificar créditos de ambos usuarios
SELECT 
    '💰 CRÉDITOS USUARIO 1' AS seccion,
    uc1.user_id::TEXT AS user_id,
    uc1.credits AS creditos
FROM user_credits uc1
WHERE uc1.user_id = '52053c46-f6da-4861-9143-fd76d3e8e5d9'

UNION ALL

SELECT 
    '💰 CRÉDITOS USUARIO 2',
    uc2.user_id::TEXT,
    uc2.credits
FROM user_credits uc2
WHERE uc2.user_id = '978e9e29-11b0-405d-bf68-b20622016aad';

-- PASO 3: Verificar wallets vinculadas
SELECT 
    '🔗 WALLETS VINCULADAS' AS seccion,
    uw.user_id::TEXT AS user_id,
    uw.wallet_address AS wallet,
    uw.is_primary AS es_principal
FROM user_wallets uw
WHERE uw.user_id IN ('52053c46-f6da-4861-9143-fd76d3e8e5d9', '978e9e29-11b0-405d-bf68-b20622016aad')
    OR uw.wallet_address = LOWER('0x72ecA083FBceb05A4f21B1A9883A57bCD638b6Dd');

-- ============================================
-- PASO 4: UNIR AMBOS USUARIOS Y SUS DATOS
-- ============================================
-- Estrategia: Mover todo al usuario que usa el frontend (978e9e29-11b0-405d-bf68-b20622016aad)
-- porque ese es el que está autenticado actualmente

DO $$
DECLARE
    v_wallet_address TEXT := LOWER('0x72ecA083FBceb05A4f21B1A9883A57bCD638b6Dd');
    v_user1_id UUID := '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID;
    v_user2_id UUID := '978e9e29-11b0-405d-bf68-b20622016aad'::UUID; -- Usuario que usa el frontend
    v_credits_user1 DECIMAL;
    v_credits_user2 DECIMAL;
    v_credits_to_move DECIMAL;
    v_deposits_to_move INTEGER;
    v_existing_user_id UUID;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'UNIENDO USUARIOS Y VINCULANDO WALLET';
    RAISE NOTICE 'Wallet: %', v_wallet_address;
    RAISE NOTICE 'Usuario 1: %', v_user1_id;
    RAISE NOTICE 'Usuario 2 (frontend): %', v_user2_id;
    RAISE NOTICE '========================================';

    -- Obtener créditos de ambos usuarios
    SELECT COALESCE(credits, 0) INTO v_credits_user1
    FROM user_credits
    WHERE user_id = v_user1_id;
    
    SELECT COALESCE(credits, 0) INTO v_credits_user2
    FROM user_credits
    WHERE user_id = v_user2_id;

    RAISE NOTICE 'Créditos Usuario 1: %', v_credits_user1;
    RAISE NOTICE 'Créditos Usuario 2: %', v_credits_user2;

    -- CRÍTICO: Crear entrada en tabla "users" para Usuario 2 si no existe
    -- Esto es necesario porque user_credits tiene foreign key a users
    -- Primero verificar si la wallet ya existe con otro user_id
    SELECT id INTO v_existing_user_id
    FROM users
    WHERE LOWER(wallet_address) = v_wallet_address
    LIMIT 1;
    
    IF v_existing_user_id IS NOT NULL AND v_existing_user_id != v_user2_id THEN
        -- La wallet existe con otro usuario (Usuario 1), actualizar al Usuario 2
        UPDATE users 
        SET id = v_user2_id,
            updated_at = NOW()
        WHERE id = v_existing_user_id;
        RAISE NOTICE '✅ Wallet existente actualizada al Usuario 2 (era Usuario 1: %)', v_existing_user_id;
    ELSIF v_existing_user_id IS NULL THEN
        -- La wallet no existe, crear nuevo registro
        INSERT INTO users (
            id,
            wallet_address,
            created_at,
            updated_at
        )
        VALUES (
            v_user2_id,
            v_wallet_address,
            NOW(),
            NOW()
        );
        RAISE NOTICE '✅ Usuario 2 creado en tabla users';
    ELSE
        -- La wallet ya existe con el Usuario 2, solo actualizar timestamp
        UPDATE users 
        SET updated_at = NOW()
        WHERE id = v_user2_id;
        RAISE NOTICE '✅ Usuario 2 ya existe en tabla users';
    END IF;

    -- Mover créditos del Usuario 1 al Usuario 2 (el que usa el frontend)
    IF v_credits_user1 > 0 THEN
        v_credits_to_move := v_credits_user1;
        
        -- Sumar créditos al Usuario 2
        INSERT INTO user_credits (user_id, credits, updated_at)
        VALUES (v_user2_id, v_credits_to_move, NOW())
        ON CONFLICT (user_id) 
        DO UPDATE SET 
            credits = user_credits.credits + v_credits_to_move,
            updated_at = NOW();
        
        -- Actualizar créditos del Usuario 1 a 0
        UPDATE user_credits SET credits = 0, updated_at = NOW() WHERE user_id = v_user1_id;
        
        RAISE NOTICE '✅ Créditos movidos: % créditos de Usuario 1 a Usuario 2', v_credits_to_move;
    END IF;

    -- Mover depósitos del Usuario 1 al Usuario 2
    SELECT COUNT(*) INTO v_deposits_to_move
    FROM deposits
    WHERE user_id = v_user1_id;
    
    IF v_deposits_to_move > 0 THEN
        UPDATE deposits SET user_id = v_user2_id WHERE user_id = v_user1_id;
        RAISE NOTICE '✅ Depósitos movidos: % depósitos al Usuario 2', v_deposits_to_move;
    END IF;

    -- Actualizar entrada en tabla "users" con la wallet (ya fue creada arriba)
    UPDATE users
    SET wallet_address = v_wallet_address,
        updated_at = NOW()
    WHERE id = v_user2_id;
    
    RAISE NOTICE '✅ Wallet actualizada en tabla users para Usuario 2';

    -- Vincular wallet al Usuario 2 (el que usa el frontend)
    INSERT INTO user_wallets (
        user_id,
        wallet_address,
        is_primary,
        linked_via,
        created_at,
        updated_at
    )
    VALUES (
        v_user2_id,
        v_wallet_address,
        TRUE,
        'manual',
        NOW(),
        NOW()
    )
    ON CONFLICT (wallet_address) 
    DO UPDATE SET
        user_id = v_user2_id,
        is_primary = TRUE,
        linked_via = COALESCE(user_wallets.linked_via, 'manual'),
        updated_at = NOW();
    
    RAISE NOTICE '✅ Wallet vinculada al Usuario 2 (frontend)';

    -- Actualizar wallet del Usuario 1 para evitar conflictos
    UPDATE users 
    SET wallet_address = v_wallet_address || '_old_' || v_user1_id::TEXT,
        updated_at = NOW()
    WHERE id = v_user1_id;
    
    RAISE NOTICE '✅ Usuario 1 actualizado (wallet cambiada para evitar conflictos)';

    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ UNIÓN COMPLETA';
    RAISE NOTICE 'Todo movido al Usuario 2 (frontend): %', v_user2_id;
    RAISE NOTICE 'Wallet vinculada: %', v_wallet_address;
    RAISE NOTICE '========================================';

END $$;

-- PASO 5: Verificación final del Usuario 2 (el que usa el frontend)
SELECT 
    '✅ Verificación Final - Usuario Frontend' AS estado,
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
WHERE uw.user_id = '978e9e29-11b0-405d-bf68-b20622016aad';
