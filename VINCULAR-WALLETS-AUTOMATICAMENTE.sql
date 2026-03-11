-- ============================================
-- VINCULAR WALLETS AUTOMÁTICAMENTE
-- Este script vincula automáticamente wallets que están en users
-- pero no están vinculadas en user_wallets
-- ============================================

-- PASO 1: IDENTIFICAR WALLETS QUE NECESITAN VINCULACIÓN
SELECT 
    '🔍 WALLETS QUE NECESITAN VINCULACIÓN' AS tipo,
    u.id::TEXT AS user_id_en_users,
    u.wallet_address AS wallet_en_users,
    au.id::TEXT AS user_id_en_auth_users,
    au.email AS email,
    uw.wallet_address AS wallet_en_user_wallets,
    COALESCE(uc.credits, 0) AS creditos,
    (SELECT COUNT(*) FROM deposits d WHERE d.user_id = u.id) AS num_depositos,
    CASE 
        WHEN au.id IS NOT NULL THEN '✅ Usuario existe en auth.users - puede vincularse'
        ELSE '⚠️ Usuario NO existe en auth.users - necesita registro'
    END AS estado
FROM users u
LEFT JOIN auth.users au ON au.id = u.id
LEFT JOIN user_wallets uw ON uw.wallet_address = u.wallet_address
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.wallet_address IS NOT NULL
    AND u.wallet_address != ''
    -- Excluir wallet de plataforma/tesorería
    AND LOWER(u.wallet_address) != '0x75376bc58830f27415402875d26b73a6be8e2253'
    -- Excluir wallets renombradas (que terminan en _old_)
    AND u.wallet_address NOT LIKE '%_old_%'
    -- Solo wallets que NO están en user_wallets
    AND uw.wallet_address IS NULL
ORDER BY 
    CASE WHEN au.id IS NOT NULL THEN 1 ELSE 2 END,  -- Usuarios existentes primero
    creditos DESC NULLS LAST,
    num_depositos DESC;

-- ============================================
-- PASO 2: CORRECCIÓN AUTOMÁTICA
-- ============================================
-- Vincular automáticamente wallets que están en users pero no en user_wallets
DO $$
DECLARE
    v_user_record RECORD;
    v_wallet_address TEXT;
    v_users_processed INTEGER := 0;
    v_wallets_linked INTEGER := 0;
    v_errors INTEGER := 0;
    v_platform_wallet TEXT := '0x75376bc58830f27415402875d26b73a6be8e2253';
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'INICIANDO VINCULACIÓN AUTOMÁTICA';
    RAISE NOTICE '========================================';
    
    -- Deshabilitar trigger temporalmente para evitar errores
    ALTER TABLE user_credits DISABLE TRIGGER trigger_update_wallet_last_used_on_credits;
    
    -- Iterar sobre wallets en users que no están en user_wallets
    FOR v_user_record IN 
        SELECT DISTINCT
            u.id AS user_id,
            u.wallet_address AS wallet_from_users,
            au.id AS auth_user_id,
            COALESCE(uc.credits, 0) AS credits
        FROM users u
        LEFT JOIN auth.users au ON au.id = u.id
        LEFT JOIN user_wallets uw ON uw.wallet_address = u.wallet_address
        LEFT JOIN user_credits uc ON uc.user_id = u.id
        WHERE u.wallet_address IS NOT NULL
            AND u.wallet_address != ''
            -- Excluir wallet de plataforma/tesorería
            AND LOWER(u.wallet_address) != LOWER(v_platform_wallet)
            -- Excluir wallets renombradas
            AND u.wallet_address NOT LIKE '%_old_%'
            -- Solo wallets que NO están en user_wallets
            AND uw.wallet_address IS NULL
    LOOP
        v_wallet_address := NULL;
        
        RAISE NOTICE '----------------------------------------';
        RAISE NOTICE 'Procesando wallet: %', v_user_record.wallet_from_users;
        RAISE NOTICE 'User ID en users: %', v_user_record.user_id;
        RAISE NOTICE 'User ID en auth.users: %', v_user_record.auth_user_id;
        RAISE NOTICE 'Créditos: %', v_user_record.credits;
        
        -- Obtener wallet de users
        IF v_user_record.wallet_from_users IS NOT NULL AND v_user_record.wallet_from_users != '' THEN
            v_wallet_address := LOWER(v_user_record.wallet_from_users);
            RAISE NOTICE '✅ Wallet encontrada: %', v_wallet_address;
            
            -- Determinar qué user_id usar
            -- Preferir auth_user_id si existe, sino usar user_id de users
            DECLARE
                v_target_user_id UUID;
            BEGIN
                IF v_user_record.auth_user_id IS NOT NULL THEN
                    v_target_user_id := v_user_record.auth_user_id;
                    RAISE NOTICE '✅ Usando user_id de auth.users: %', v_target_user_id;
                ELSE
                    v_target_user_id := v_user_record.user_id;
                    RAISE NOTICE '⚠️ Usando user_id de users (no existe en auth.users): %', v_target_user_id;
                END IF;
                
                BEGIN
                    -- Verificar si la wallet ya está vinculada a otro usuario
                    DECLARE
                        v_existing_user_id UUID;
                    BEGIN
                        SELECT user_id INTO v_existing_user_id
                        FROM user_wallets
                        WHERE wallet_address = v_wallet_address
                        LIMIT 1;
                        
                        IF v_existing_user_id IS NOT NULL AND v_existing_user_id != v_target_user_id THEN
                            RAISE NOTICE '⚠️ Wallet % ya está vinculada a otro usuario: %', v_wallet_address, v_existing_user_id;
                            RAISE NOTICE '⚠️ Se vinculará al usuario actual (%), pero puede haber duplicados', v_target_user_id;
                        END IF;
                    END;
                    
                    -- Asegurar que el usuario existe en tabla users
                    INSERT INTO users (
                        id,
                        wallet_address,
                        created_at,
                        updated_at
                    )
                    VALUES (
                        v_target_user_id,
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
                        v_target_user_id,
                        v_wallet_address,
                        TRUE,
                        'auto_correction',
                        NOW(),
                        NOW()
                    )
                    ON CONFLICT (wallet_address) 
                    DO UPDATE SET
                        user_id = v_target_user_id,
                        is_primary = TRUE,
                        linked_via = COALESCE(user_wallets.linked_via, 'auto_correction'),
                        updated_at = NOW();
                    
                    v_wallets_linked := v_wallets_linked + 1;
                    RAISE NOTICE '✅ Wallet vinculada exitosamente a usuario: %', v_target_user_id;
                    
                EXCEPTION WHEN OTHERS THEN
                    v_errors := v_errors + 1;
                    RAISE NOTICE '❌ Error al vincular wallet: %', SQLERRM;
                END;
            END;
        ELSE
            RAISE NOTICE '⚠️ No se encontró wallet para este usuario';
        END IF;
        
        v_users_processed := v_users_processed + 1;
    END LOOP;
    
    -- Re-habilitar trigger
    ALTER TABLE user_credits ENABLE TRIGGER trigger_update_wallet_last_used_on_credits;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ VINCULACIÓN COMPLETA';
    RAISE NOTICE 'Wallets procesadas: %', v_users_processed;
    RAISE NOTICE 'Wallets vinculadas: %', v_wallets_linked;
    RAISE NOTICE 'Errores: %', v_errors;
    RAISE NOTICE '========================================';
    
END $$;

-- ============================================
-- PASO 3: VERIFICACIÓN POST-CORRECCIÓN
-- ============================================
SELECT 
    '✅ VERIFICACIÓN POST-CORRECCIÓN' AS tipo,
    u.id::TEXT AS user_id,
    au.email AS email,
    u.wallet_address AS wallet_en_users,
    uw.wallet_address AS wallet_en_user_wallets,
    CASE 
        WHEN uw.wallet_address IS NOT NULL THEN '✅ VINCULADA'
        ELSE '❌ AÚN SIN VINCULAR'
    END AS estado_final,
    COALESCE(uc.credits, 0) AS creditos
FROM users u
LEFT JOIN auth.users au ON au.id = u.id
LEFT JOIN user_wallets uw ON uw.wallet_address = u.wallet_address
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.wallet_address IS NOT NULL
    AND u.wallet_address != ''
    -- Excluir wallet de plataforma/tesorería
    AND LOWER(u.wallet_address) != '0x75376bc58830f27415402875d26b73a6be8e2253'
    -- Excluir wallets renombradas
    AND u.wallet_address NOT LIKE '%_old_%'
ORDER BY 
    CASE WHEN uw.wallet_address IS NULL THEN 0 ELSE 1 END,  -- Sin vincular primero
    creditos DESC NULLS LAST;
