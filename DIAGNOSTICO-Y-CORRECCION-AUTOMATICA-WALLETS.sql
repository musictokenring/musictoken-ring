-- ============================================
-- DIAGNÓSTICO Y CORRECCIÓN AUTOMÁTICA DE WALLETS
-- Este script identifica usuarios con créditos pero sin wallet vinculada
-- y los corrige automáticamente
-- ============================================

-- PASO 1: DIAGNÓSTICO - Usuarios con créditos pero sin wallet vinculada
SELECT 
    '🔍 DIAGNÓSTICO' AS tipo,
    uc.user_id::TEXT AS user_id,
    au.email AS email,
    uc.credits AS creditos,
    u.wallet_address AS wallet_en_users,
    CASE 
        WHEN uw.wallet_address IS NOT NULL THEN '✅ VINCULADA'
        ELSE '❌ NO VINCULADA'
    END AS estado_wallet,
    uw.wallet_address AS wallet_en_user_wallets,
    (SELECT COUNT(*) FROM deposits d WHERE d.user_id = uc.user_id) AS num_depositos
FROM user_credits uc
LEFT JOIN auth.users au ON au.id = uc.user_id
LEFT JOIN users u ON u.id = uc.user_id
LEFT JOIN user_wallets uw ON uw.user_id = uc.user_id
WHERE uc.credits > 0
    AND uw.wallet_address IS NULL  -- No tiene wallet vinculada en user_wallets
ORDER BY uc.credits DESC;

-- ============================================
-- PASO 2: CORRECCIÓN AUTOMÁTICA
-- ============================================
-- Este bloque DO procesa cada usuario sin wallet vinculada
-- y busca su wallet en users o deposits para vincularla automáticamente

DO $$
DECLARE
    v_user_record RECORD;
    v_wallet_address TEXT;
    v_found_wallet BOOLEAN := FALSE;
    v_users_processed INTEGER := 0;
    v_wallets_linked INTEGER := 0;
    v_errors INTEGER := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'INICIANDO CORRECCIÓN AUTOMÁTICA';
    RAISE NOTICE '========================================';
    
    -- Deshabilitar trigger temporalmente para evitar errores
    ALTER TABLE user_credits DISABLE TRIGGER trigger_update_wallet_last_used_on_credits;
    
    -- Iterar sobre usuarios con créditos pero sin wallet vinculada
    FOR v_user_record IN 
        SELECT DISTINCT
            uc.user_id,
            uc.credits,
            u.wallet_address AS wallet_from_users
        FROM user_credits uc
        LEFT JOIN users u ON u.id = uc.user_id
        LEFT JOIN user_wallets uw ON uw.user_id = uc.user_id
        WHERE uc.credits > 0
            AND uw.wallet_address IS NULL  -- No tiene wallet vinculada
    LOOP
        v_found_wallet := FALSE;
        v_wallet_address := NULL;
        
        RAISE NOTICE '----------------------------------------';
        RAISE NOTICE 'Procesando usuario: %', v_user_record.user_id;
        RAISE NOTICE 'Créditos: %', v_user_record.credits;
        
        -- Estrategia 1: Buscar wallet en tabla users
        IF v_user_record.wallet_from_users IS NOT NULL AND v_user_record.wallet_from_users != '' THEN
            v_wallet_address := LOWER(v_user_record.wallet_from_users);
            v_found_wallet := TRUE;
            RAISE NOTICE '✅ Wallet encontrada en tabla users: %', v_wallet_address;
        END IF;
        
        -- Estrategia 2: Si no se encontró en users, buscar en deposits
        IF NOT v_found_wallet AND v_user_record.wallet_from_deposits IS NOT NULL AND v_user_record.wallet_from_deposits != '' THEN
            v_wallet_address := LOWER(v_user_record.wallet_from_deposits);
            v_found_wallet := TRUE;
            RAISE NOTICE '✅ Wallet encontrada en deposits: %', v_wallet_address;
        END IF;
        
        -- Si encontramos una wallet, vincularla
        IF v_found_wallet AND v_wallet_address IS NOT NULL THEN
            BEGIN
                -- Verificar si la wallet ya está vinculada a otro usuario
                DECLARE
                    v_existing_user_id UUID;
                    v_existing_wallet_user_id UUID;
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
                
                -- Asegurar que el usuario existe en tabla users
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
                    TRUE,  -- Marcar como principal si es la única
                    'auto_correction',  -- Método de vinculación
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
            RAISE NOTICE '⚠️ No se encontró wallet para este usuario en tabla users';
            RAISE NOTICE '   - Wallet en users: %', v_user_record.wallet_from_users;
            RAISE NOTICE '   - Este usuario necesita vincular su wallet manualmente o hacer un depósito';
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
-- PASO 3: VERIFICACIÓN POST-CORRECCIÓN
-- ============================================
SELECT 
    '✅ VERIFICACIÓN POST-CORRECCIÓN' AS tipo,
    uc.user_id::TEXT AS user_id,
    au.email AS email,
    uc.credits AS creditos,
    uw.wallet_address AS wallet_vinculada,
    CASE 
        WHEN uw.wallet_address IS NOT NULL THEN '✅ CORREGIDO'
        ELSE '❌ AÚN SIN WALLET'
    END AS estado_final,
    uw.is_primary AS es_principal,
    uw.linked_via AS metodo_vinculacion
FROM user_credits uc
LEFT JOIN auth.users au ON au.id = uc.user_id
LEFT JOIN user_wallets uw ON uw.user_id = uc.user_id
WHERE uc.credits > 0
ORDER BY 
    CASE WHEN uw.wallet_address IS NULL THEN 0 ELSE 1 END,  -- Sin wallet primero
    uc.credits DESC;

-- ============================================
-- PASO 4: RESUMEN FINAL
-- ============================================
SELECT 
    '📊 RESUMEN FINAL' AS tipo,
    COUNT(DISTINCT uc.user_id) AS total_usuarios_con_creditos,
    COUNT(DISTINCT uw.user_id) AS usuarios_con_wallet_vinculada,
    COUNT(DISTINCT uc.user_id) - COUNT(DISTINCT uw.user_id) AS usuarios_sin_wallet_vinculada,
    SUM(uc.credits) AS total_creditos,
    SUM(CASE WHEN uw.wallet_address IS NULL THEN uc.credits ELSE 0 END) AS creditos_en_usuarios_sin_wallet
FROM user_credits uc
LEFT JOIN user_wallets uw ON uw.user_id = uc.user_id
WHERE uc.credits > 0;
