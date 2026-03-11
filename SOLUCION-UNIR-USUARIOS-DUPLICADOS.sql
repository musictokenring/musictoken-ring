-- ============================================
-- SOLUCIÓN: Unir usuarios duplicados (Google Login vs Wallet)
-- 
-- PROBLEMA: Cuando un usuario se registra con Google y luego hace un depósito,
-- el backend crea un NUEVO usuario en tabla "users" con la wallet, pero NO lo
-- vincula al user_id de auth.users. Esto causa que haya DOS usuarios separados.
-- ============================================

-- PASO 1: Identificar usuarios con créditos pero sin wallet vinculada
-- Y buscar si existe un usuario en "users" con depósitos pero diferente ID
WITH usuarios_problema AS (
    SELECT DISTINCT
        uc.user_id AS auth_user_id,
        au.email,
        uc.credits AS creditos_actuales
    FROM user_credits uc
    INNER JOIN auth.users au ON au.id = uc.user_id
    WHERE NOT EXISTS (
        SELECT 1 FROM user_wallets uw WHERE uw.user_id = uc.user_id
    )
    AND uc.credits > 0
),
depositos_por_auth_user AS (
    SELECT 
        d.user_id AS deposit_user_id,
        COUNT(*) AS total_depositos,
        SUM(d.credits_awarded) AS creditos_depositados,
        MAX(d.created_at) AS ultimo_deposito
    FROM deposits d
    GROUP BY d.user_id
),
usuarios_en_users AS (
    SELECT 
        u.id AS users_id,
        u.wallet_address,
        u.created_at
    FROM users u
)
SELECT 
    '🔍 Usuario con créditos pero sin wallet' AS tipo,
    up.auth_user_id::TEXT AS auth_user_id,
    up.email,
    up.creditos_actuales::TEXT AS creditos_en_auth_users,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM deposits d 
            WHERE d.user_id IN (
                SELECT uu.users_id FROM usuarios_en_users uu
                WHERE uu.wallet_address IN (
                    -- Buscar wallets que hicieron depósitos pero están vinculadas a otro user_id
                    SELECT DISTINCT 
                        -- Necesitamos obtener la wallet del depósito desde el backend
                        -- Por ahora, solo podemos identificar el problema
                        'N/A' AS wallet
                )
            )
        )
        THEN '⚠️ Posible usuario duplicado en tabla users'
        ELSE '❌ No se encontró wallet relacionada'
    END AS estado,
    'Revisar logs del backend para obtener wallet desde tx_hash' AS solucion
FROM usuarios_problema up;

-- ============================================
-- PASO 2: Buscar usuarios en "users" que tienen depósitos pero NO están en auth.users
-- Estos son usuarios creados automáticamente por el backend cuando procesó depósitos
-- ============================================
SELECT 
    '🔍 Usuario en "users" con depósitos pero posiblemente sin auth.users' AS tipo,
    u.id::TEXT AS users_id,
    u.wallet_address AS wallet,
    u.created_at::TEXT AS creado_en,
    COUNT(DISTINCT d.id)::TEXT AS total_depositos,
    SUM(d.credits_awarded)::TEXT AS creditos_depositados,
    CASE 
        WHEN EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.id)
        THEN '✅ Existe en auth.users'
        ELSE '❌ NO existe en auth.users - Usuario creado solo por depósito'
    END AS estado,
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.id)
        THEN 'Este usuario fue creado automáticamente cuando se procesó el depósito. Necesita vincularse al auth.users correcto.'
        ELSE 'Usuario existe en ambos lugares'
    END AS nota
FROM users u
LEFT JOIN deposits d ON d.user_id = u.id
WHERE d.id IS NOT NULL
GROUP BY u.id, u.wallet_address, u.created_at
ORDER BY total_depositos DESC;

-- ============================================
-- PASO 3: SOLUCIÓN MANUAL - Para el usuario específico identificado
-- User ID: 52053c46-f6da-4861-9143-fd76d3e8e5d9
-- 
-- INSTRUCCIONES:
-- 1. Ejecuta PASO 2 para encontrar la wallet address
-- 2. Una vez que tengas la wallet, ejecuta este bloque reemplazando WALLET_ADDRESS
-- ============================================
/*
DO $$
DECLARE
    v_auth_user_id UUID := '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID;
    v_wallet_address TEXT := 'WALLET_ADDRESS_AQUI'; -- ⚠️ REEMPLAZA CON LA WALLET REAL
    v_users_id UUID;
BEGIN
    -- Buscar si existe usuario en "users" con esta wallet
    SELECT id INTO v_users_id
    FROM users
    WHERE LOWER(wallet_address) = LOWER(v_wallet_address)
    LIMIT 1;
    
    -- Si existe usuario en "users" con diferente ID, necesitamos unirlos
    IF v_users_id IS NOT NULL AND v_users_id != v_auth_user_id THEN
        -- Opción 1: Actualizar todos los depósitos y créditos al auth_user_id
        UPDATE deposits SET user_id = v_auth_user_id WHERE user_id = v_users_id;
        UPDATE user_credits SET user_id = v_auth_user_id WHERE user_id = v_users_id;
        
        -- Opción 2: Actualizar el ID del usuario en "users" al auth_user_id
        UPDATE users SET id = v_auth_user_id WHERE id = v_users_id;
        
        RAISE NOTICE '✅ Usuarios unidos: % -> %', v_users_id, v_auth_user_id;
    END IF;
    
    -- Crear entrada en "users" si no existe
    INSERT INTO users (
        id,
        wallet_address,
        created_at,
        updated_at
    )
    VALUES (
        v_auth_user_id,
        LOWER(v_wallet_address),
        NOW(),
        NOW()
    )
    ON CONFLICT (wallet_address) 
    DO UPDATE SET
        id = v_auth_user_id,
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
        v_auth_user_id,
        LOWER(v_wallet_address),
        TRUE,
        'manual',
        NOW(),
        NOW()
    )
    ON CONFLICT (wallet_address) 
    DO UPDATE SET
        user_id = v_auth_user_id,
        is_primary = TRUE,
        linked_via = 'manual',
        updated_at = NOW();
    
    RAISE NOTICE '✅ Wallet % vinculada al usuario %', v_wallet_address, v_auth_user_id;
END $$;
*/
