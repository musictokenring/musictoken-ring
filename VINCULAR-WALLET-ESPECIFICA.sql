-- ============================================
-- VINCULAR WALLET ESPECÍFICA MANUALMENTE
-- Este script vincula una wallet específica que no se pudo vincular automáticamente
-- Wallet: 0x2cff890f0378a11913b6129b2e97417a2c302680
-- User ID: 18af16ee-ddc2-4829-8a6d-df3f9976336a
-- ============================================

DO $$
DECLARE
    v_wallet_address TEXT := LOWER('0x2cff890f0378a11913b6129b2e97417a2c302680');
    v_user_id UUID := '18af16ee-ddc2-4829-8a6d-df3f9976336a'::UUID;
    v_wallet_exists BOOLEAN := FALSE;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VINCULANDO WALLET ESPECÍFICA';
    RAISE NOTICE 'Wallet: %', v_wallet_address;
    RAISE NOTICE 'User ID: %', v_user_id;
    RAISE NOTICE '========================================';
    
    -- Deshabilitar trigger temporalmente
    ALTER TABLE user_credits DISABLE TRIGGER trigger_update_wallet_last_used_on_credits;
    
    -- Verificar si la wallet ya está vinculada
    SELECT EXISTS(
        SELECT 1 FROM user_wallets WHERE wallet_address = v_wallet_address
    ) INTO v_wallet_exists;
    
    IF v_wallet_exists THEN
        RAISE NOTICE '⚠️ La wallet ya está vinculada a otro usuario. Actualizando...';
        UPDATE user_wallets
        SET user_id = v_user_id,
            is_primary = TRUE,
            linked_via = 'manual',
            updated_at = NOW()
        WHERE wallet_address = v_wallet_address;
        RAISE NOTICE '✅ Wallet actualizada al usuario: %', v_user_id;
    ELSE
        RAISE NOTICE '✅ Wallet no está vinculada. Creando nueva vinculación...';
        
        -- Asegurar que el usuario existe en tabla users
        INSERT INTO users (
            id,
            wallet_address,
            created_at,
            updated_at
        )
        VALUES (
            v_user_id,
            v_wallet_address,
            NOW(),
            NOW()
        )
        ON CONFLICT (id) 
        DO UPDATE SET
            wallet_address = COALESCE(users.wallet_address, v_wallet_address),
            updated_at = NOW();
        
        RAISE NOTICE '✅ Usuario verificado/actualizado en tabla users';
        
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
            v_wallet_address,
            TRUE,
            'manual',
            NOW(),
            NOW()
        )
        ON CONFLICT (wallet_address) 
        DO UPDATE SET
            user_id = v_user_id,
            is_primary = TRUE,
            linked_via = COALESCE(user_wallets.linked_via, 'manual'),
            updated_at = NOW();
        
        RAISE NOTICE '✅ Wallet vinculada exitosamente';
    END IF;
    
    -- Re-habilitar trigger
    ALTER TABLE user_credits ENABLE TRIGGER trigger_update_wallet_last_used_on_credits;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ VINCULACIÓN COMPLETA';
    RAISE NOTICE '========================================';
    
END $$;

-- Verificación inmediata
SELECT 
    '✅ VERIFICACIÓN INMEDIATA' AS tipo,
    uw.user_id::TEXT AS user_id,
    uw.wallet_address AS wallet_vinculada,
    uw.is_primary AS es_principal,
    uw.linked_via AS metodo_vinculacion,
    uw.created_at AS vinculada_en,
    COALESCE(uc.credits, 0) AS creditos
FROM user_wallets uw
LEFT JOIN user_credits uc ON uc.user_id = uw.user_id
WHERE uw.wallet_address = '0x2cff890f0378a11913b6129b2e97417a2c302680';
