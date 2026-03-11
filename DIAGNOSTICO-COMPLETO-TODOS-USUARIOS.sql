-- ============================================
-- DIAGNÓSTICO COMPLETO DE TODOS LOS USUARIOS
-- Este script muestra el estado completo de TODOS los usuarios registrados
-- y diagnostica problemas de vinculación de wallets
-- ============================================

-- PASO 1: DIAGNÓSTICO COMPLETO - TODOS LOS USUARIOS REGISTRADOS
SELECT 
    '🔍 DIAGNÓSTICO COMPLETO' AS tipo,
    au.id::TEXT AS user_id,
    au.email AS email,
    au.created_at::TEXT AS fecha_registro,
    -- Wallet en tabla users
    u.wallet_address AS wallet_en_users,
    -- Wallet vinculada en user_wallets
    uw.wallet_address AS wallet_en_user_wallets,
    -- Estado de vinculación
    CASE 
        WHEN uw.wallet_address IS NOT NULL THEN '✅ VINCULADA'
        WHEN u.wallet_address IS NOT NULL THEN '⚠️ EN USERS PERO NO EN USER_WALLETS'
        ELSE '❌ SIN WALLET'
    END AS estado_wallet,
    -- Créditos
    COALESCE(uc.credits, 0) AS creditos,
    -- Depósitos
    (SELECT COUNT(*) FROM deposits d WHERE d.user_id = au.id) AS num_depositos,
    -- Último depósito
    (SELECT MAX(d.created_at) FROM deposits d WHERE d.user_id = au.id) AS ultimo_deposito,
    -- Problemas detectados
    CASE 
        WHEN uw.wallet_address IS NULL AND u.wallet_address IS NOT NULL THEN '⚠️ Wallet en users pero no vinculada'
        WHEN uw.wallet_address IS NULL AND u.wallet_address IS NULL AND (SELECT COUNT(*) FROM deposits d WHERE d.user_id = au.id) > 0 THEN '⚠️ Tiene depósitos pero no tiene wallet'
        WHEN uw.wallet_address IS NULL AND uc.credits > 0 THEN '❌ CRÍTICO: Tiene créditos pero no tiene wallet vinculada'
        WHEN uw.wallet_address IS NULL THEN '⚠️ Sin wallet vinculada'
        ELSE '✅ OK'
    END AS problema_detectado
FROM auth.users au
LEFT JOIN users u ON u.id = au.id
LEFT JOIN user_wallets uw ON uw.user_id = au.id
LEFT JOIN user_credits uc ON uc.user_id = au.id
ORDER BY 
    CASE 
        WHEN uw.wallet_address IS NULL AND uc.credits > 0 THEN 1  -- Críticos primero
        WHEN uw.wallet_address IS NULL AND u.wallet_address IS NOT NULL THEN 2  -- Fáciles de corregir
        WHEN uw.wallet_address IS NULL THEN 3  -- Sin wallet
        ELSE 4  -- OK
    END,
    au.created_at DESC;

-- ============================================
-- PASO 2: RESUMEN POR ESTADO
-- ============================================
SELECT 
    '📊 RESUMEN POR ESTADO' AS tipo,
    CASE 
        WHEN uw.wallet_address IS NOT NULL THEN '✅ Con wallet vinculada'
        WHEN u.wallet_address IS NOT NULL THEN '⚠️ Wallet en users pero no vinculada'
        ELSE '❌ Sin wallet'
    END AS estado,
    COUNT(DISTINCT au.id) AS total_usuarios,
    SUM(COALESCE(uc.credits, 0)) AS total_creditos,
    COUNT(DISTINCT CASE WHEN (SELECT COUNT(*) FROM deposits d WHERE d.user_id = au.id) > 0 THEN au.id END) AS usuarios_con_depositos
FROM auth.users au
LEFT JOIN users u ON u.id = au.id
LEFT JOIN user_wallets uw ON uw.user_id = au.id
LEFT JOIN user_credits uc ON uc.user_id = au.id
GROUP BY 
    CASE 
        WHEN uw.wallet_address IS NOT NULL THEN '✅ Con wallet vinculada'
        WHEN u.wallet_address IS NOT NULL THEN '⚠️ Wallet en users pero no vinculada'
        ELSE '❌ Sin wallet'
    END
ORDER BY 
    CASE 
        WHEN uw.wallet_address IS NOT NULL THEN 1
        WHEN u.wallet_address IS NOT NULL THEN 2
        ELSE 3
    END;

-- ============================================
-- PASO 3: USUARIOS CRÍTICOS (Tienen créditos pero no wallet vinculada)
-- ============================================
SELECT 
    '🚨 USUARIOS CRÍTICOS' AS tipo,
    au.id::TEXT AS user_id,
    au.email AS email,
    COALESCE(uc.credits, 0) AS creditos,
    u.wallet_address AS wallet_en_users,
    uw.wallet_address AS wallet_en_user_wallets,
    '❌ CRÍTICO: Tiene créditos pero no tiene wallet vinculada' AS problema
FROM auth.users au
LEFT JOIN users u ON u.id = au.id
LEFT JOIN user_wallets uw ON uw.user_id = au.id
LEFT JOIN user_credits uc ON uc.user_id = au.id
WHERE uc.credits > 0
    AND uw.wallet_address IS NULL
ORDER BY uc.credits DESC;

-- ============================================
-- PASO 4: USUARIOS CON WALLET EN USERS PERO NO VINCULADA
-- ============================================
SELECT 
    '⚠️ USUARIOS CON WALLET EN USERS PERO NO VINCULADA' AS tipo,
    au.id::TEXT AS user_id,
    au.email AS email,
    u.wallet_address AS wallet_en_users,
    COALESCE(uc.credits, 0) AS creditos,
    (SELECT COUNT(*) FROM deposits d WHERE d.user_id = au.id) AS num_depositos
FROM auth.users au
INNER JOIN users u ON u.id = au.id
LEFT JOIN user_wallets uw ON uw.user_id = au.id
LEFT JOIN user_credits uc ON uc.user_id = au.id
WHERE u.wallet_address IS NOT NULL
    AND u.wallet_address != ''
    AND uw.wallet_address IS NULL
ORDER BY uc.credits DESC NULLS LAST;

-- ============================================
-- PASO 5: CORRECCIÓN AUTOMÁTICA
-- ============================================
-- Este bloque DO procesa usuarios con wallet en users pero no vinculada en user_wallets
DO $$
DECLARE
    v_user_record RECORD;
    v_wallet_address TEXT;
    v_users_processed INTEGER := 0;
    v_wallets_linked INTEGER := 0;
    v_errors INTEGER := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'INICIANDO CORRECCIÓN AUTOMÁTICA';
    RAISE NOTICE '========================================';
    
    -- Deshabilitar trigger temporalmente para evitar errores
    ALTER TABLE user_credits DISABLE TRIGGER trigger_update_wallet_last_used_on_credits;
    
    -- Iterar sobre usuarios con wallet en users pero no vinculada en user_wallets
    FOR v_user_record IN 
        SELECT DISTINCT
            au.id AS user_id,
            au.email,
            u.wallet_address AS wallet_from_users,
            COALESCE(uc.credits, 0) AS credits
        FROM auth.users au
        INNER JOIN users u ON u.id = au.id
        LEFT JOIN user_wallets uw ON uw.user_id = au.id
        LEFT JOIN user_credits uc ON uc.user_id = au.id
        WHERE u.wallet_address IS NOT NULL
            AND u.wallet_address != ''
            AND uw.wallet_address IS NULL  -- No tiene wallet vinculada en user_wallets
    LOOP
        v_wallet_address := NULL;
        
        RAISE NOTICE '----------------------------------------';
        RAISE NOTICE 'Procesando usuario: %', v_user_record.user_id;
        RAISE NOTICE 'Email: %', v_user_record.email;
        RAISE NOTICE 'Créditos: %', v_user_record.credits;
        
        -- Obtener wallet de users
        IF v_user_record.wallet_from_users IS NOT NULL AND v_user_record.wallet_from_users != '' THEN
            v_wallet_address := LOWER(v_user_record.wallet_from_users);
            RAISE NOTICE '✅ Wallet encontrada en tabla users: %', v_wallet_address;
            
            BEGIN
                -- Verificar si la wallet ya está vinculada a otro usuario
                DECLARE
                    v_existing_user_id UUID;
                BEGIN
                    SELECT user_id INTO v_existing_user_id
                    FROM user_wallets
                    WHERE wallet_address = v_wallet_address
                    LIMIT 1;
                    
                    IF v_existing_user_id IS NOT NULL AND v_existing_user_id != v_user_record.user_id THEN
                        RAISE NOTICE '⚠️ Wallet % ya está vinculada a otro usuario: %', v_wallet_address, v_existing_user_id;
                        RAISE NOTICE '⚠️ Se vinculará al usuario actual (%), pero puede haber duplicados', v_user_record.user_id;
                    END IF;
                END;
                
                -- Asegurar que el usuario existe en tabla users (ya debería existir)
                INSERT INTO users (
                    id,
                    wallet_address,
                    created_at,
                    updated_at
                )
                VALUES (
                    v_user_record.user_id,
                    v_wallet_address,
                    NOW(),
                    NOW()
                )
                ON CONFLICT (id) 
                DO UPDATE SET
                    wallet_address = COALESCE(users.wallet_address, v_wallet_address),
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
                    v_user_record.user_id,
                    v_wallet_address,
                    TRUE,
                    'auto_correction',
                    NOW(),
                    NOW()
                )
                ON CONFLICT (wallet_address) 
                DO UPDATE SET
                    user_id = v_user_record.user_id,
                    is_primary = TRUE,
                    linked_via = COALESCE(user_wallets.linked_via, 'auto_correction'),
                    updated_at = NOW();
                
                v_wallets_linked := v_wallets_linked + 1;
                RAISE NOTICE '✅ Wallet vinculada exitosamente';
                
            EXCEPTION WHEN OTHERS THEN
                v_errors := v_errors + 1;
                RAISE NOTICE '❌ Error al vincular wallet: %', SQLERRM;
            END;
        ELSE
            RAISE NOTICE '⚠️ No se encontró wallet para este usuario';
        END IF;
        
        v_users_processed := v_users_processed + 1;
    END LOOP;
    
    -- Re-habilitar trigger
    ALTER TABLE user_credits ENABLE TRIGGER trigger_update_wallet_last_used_on_credits;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ CORRECCIÓN COMPLETA';
    RAISE NOTICE 'Usuarios procesados: %', v_users_processed;
    RAISE NOTICE 'Wallets vinculadas: %', v_wallets_linked;
    RAISE NOTICE 'Errores: %', v_errors;
    RAISE NOTICE '========================================';
    
END $$;

-- ============================================
-- PASO 6: VERIFICACIÓN POST-CORRECCIÓN
-- ============================================
SELECT 
    '✅ VERIFICACIÓN POST-CORRECCIÓN' AS tipo,
    au.id::TEXT AS user_id,
    au.email AS email,
    COALESCE(uc.credits, 0) AS creditos,
    uw.wallet_address AS wallet_vinculada,
    CASE 
        WHEN uw.wallet_address IS NOT NULL THEN '✅ CORREGIDO'
        WHEN u.wallet_address IS NOT NULL THEN '⚠️ AÚN SIN VINCULAR'
        ELSE '❌ SIN WALLET'
    END AS estado_final,
    uw.is_primary AS es_principal,
    uw.linked_via AS metodo_vinculacion
FROM auth.users au
LEFT JOIN users u ON u.id = au.id
LEFT JOIN user_wallets uw ON uw.user_id = au.id
LEFT JOIN user_credits uc ON uc.user_id = au.id
ORDER BY 
    CASE WHEN uw.wallet_address IS NULL THEN 0 ELSE 1 END,  -- Sin wallet primero
    uc.credits DESC NULLS LAST;

-- ============================================
-- PASO 7: RESUMEN FINAL COMPLETO
-- ============================================
SELECT 
    '📊 RESUMEN FINAL COMPLETO' AS tipo,
    COUNT(DISTINCT au.id) AS total_usuarios_registrados,
    COUNT(DISTINCT uw.user_id) AS usuarios_con_wallet_vinculada,
    COUNT(DISTINCT au.id) - COUNT(DISTINCT uw.user_id) AS usuarios_sin_wallet_vinculada,
    COUNT(DISTINCT CASE WHEN uc.credits > 0 THEN au.id END) AS usuarios_con_creditos,
    COUNT(DISTINCT CASE WHEN uc.credits > 0 AND uw.wallet_address IS NULL THEN au.id END) AS usuarios_criticos,
    SUM(COALESCE(uc.credits, 0)) AS total_creditos,
    SUM(CASE WHEN uw.wallet_address IS NULL THEN COALESCE(uc.credits, 0) ELSE 0 END) AS creditos_en_usuarios_sin_wallet,
    COUNT(DISTINCT CASE WHEN (SELECT COUNT(*) FROM deposits d WHERE d.user_id = au.id) > 0 THEN au.id END) AS usuarios_con_depositos
FROM auth.users au
LEFT JOIN user_wallets uw ON uw.user_id = au.id
LEFT JOIN user_credits uc ON uc.user_id = au.id;
