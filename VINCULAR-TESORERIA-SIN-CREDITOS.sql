-- ==========================================
-- VINCULAR WALLET DE TESORERÍA (SIN AGREGAR CRÉDITOS ARTIFICIALES)
-- ==========================================
-- Este script SOLO vincula la wallet de tesorería a tu usuario
-- NO agrega créditos artificiales - el sistema debe convertir MTR on-chain automáticamente

DO $$
DECLARE
    treasury_wallet TEXT := '0x0000000000000000000000000000000000000001';
    user_email TEXT := 'fermorillomusic@gmail.com';
    user_id_found UUID;
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'VINCULACIÓN WALLET TESORERÍA';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '';
    
    -- Buscar usuario
    SELECT id INTO user_id_found
    FROM auth.users
    WHERE LOWER(email) = LOWER(user_email)
    LIMIT 1;
    
    IF user_id_found IS NULL THEN
        RAISE NOTICE '❌ Usuario NO encontrado con email: %', user_email;
        RETURN;
    END IF;
    
    RAISE NOTICE '✅ Usuario encontrado: %', user_id_found;
    RAISE NOTICE '';
    
    -- Crear/actualizar en tabla users
    INSERT INTO users (id, wallet_address, created_at, updated_at)
    VALUES (user_id_found, treasury_wallet, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET 
        wallet_address = treasury_wallet,
        updated_at = NOW();
    
    RAISE NOTICE '✅ Usuario creado/actualizado en tabla users';
    
    -- Vincular wallet
    INSERT INTO user_wallets (user_id, wallet_address, linked_via, linked_at)
    VALUES (user_id_found, treasury_wallet, 'manual', NOW())
    ON CONFLICT (wallet_address) DO UPDATE SET 
        user_id = user_id_found,
        linked_via = 'manual',
        linked_at = NOW();
    
    RAISE NOTICE '✅ Wallet vinculada';
    RAISE NOTICE '';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '✅ VINCULACIÓN COMPLETA';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'El sistema debería convertir automáticamente tu MTR on-chain';
    RAISE NOTICE 'a créditos cuando intentes aceptar un desafío.';
    RAISE NOTICE '';
    RAISE NOTICE 'Si no funciona, verifica que:';
    RAISE NOTICE '1. El backend pueda leer el balance on-chain de la wallet';
    RAISE NOTICE '2. El sistema de conversión MTR → créditos esté funcionando';
    RAISE NOTICE '==========================================';
END $$;

-- Verificación final
SELECT 
    u.id as user_id,
    au.email,
    u.wallet_address,
    COALESCE(SUM(uc.credits), 0) as total_credits,
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_wallets uw WHERE uw.user_id = u.id AND uw.wallet_address = u.wallet_address) 
        THEN '✅ Vinculada' 
        ELSE '❌ No vinculada' 
    END as wallet_status
FROM users u
LEFT JOIN auth.users au ON au.id = u.id
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.wallet_address = '0x0000000000000000000000000000000000000001'
GROUP BY u.id, au.email, u.wallet_address;
