-- ==========================================
-- CONFIGURAR WALLET DE TESORERÍA PARA TESTING (VERSIÓN SIMPLE)
-- ==========================================
-- Versión simplificada que evita problemas con triggers y columnas faltantes

-- PASO 1: Buscar usuario por email
SELECT 
    au.id as user_id,
    au.email,
    au.raw_user_meta_data->>'full_name' as name
FROM auth.users au
WHERE LOWER(au.email) = 'fermorillomusic@gmail.com'
LIMIT 1;

-- PASO 2: Si encontraste el usuario, ejecuta estos pasos manualmente o usa el DO block de abajo
-- Reemplaza 'TU_USER_ID_AQUI' con el ID que obtuviste del PASO 1

DO $$
DECLARE
    treasury_wallet TEXT := '0x75376BC58830f27415402875D26B73A6BE8E2253';
    user_email TEXT := 'fermorillomusic@gmail.com';
    user_id_found UUID;
    credits_to_add NUMERIC := 1000;
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'CONFIGURACIÓN WALLET TESORERÍA PARA TESTING';
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
    
    -- Vincular wallet (sin columna network)
    INSERT INTO user_wallets (user_id, wallet_address, linked_via, linked_at)
    VALUES (user_id_found, treasury_wallet, 'manual', NOW())
    ON CONFLICT (wallet_address) DO UPDATE SET 
        user_id = user_id_found,
        linked_via = 'manual',
        linked_at = NOW();
    
    RAISE NOTICE '✅ Wallet vinculada';
    
    -- Verificar créditos actuales
    DECLARE
        current_credits NUMERIC;
    BEGIN
        SELECT COALESCE(SUM(credits), 0) INTO current_credits
        FROM user_credits
        WHERE user_id = user_id_found;
        
        RAISE NOTICE '';
        RAISE NOTICE 'Créditos actuales: %', current_credits;
        
        -- Agregar créditos si es necesario (DESHABILITANDO TRIGGERS primero)
        IF current_credits < 100 THEN
            RAISE NOTICE '';
            RAISE NOTICE 'Agregando créditos de prueba...';
            
            -- Deshabilitar triggers problemáticos
            ALTER TABLE user_credits DISABLE TRIGGER ALL;
            
            -- Insertar créditos (solo user_id y credits, sin columnas opcionales)
            INSERT INTO user_credits (user_id, credits)
            VALUES (user_id_found, credits_to_add);
            
            -- Rehabilitar triggers
            ALTER TABLE user_credits ENABLE TRIGGER ALL;
            
            RAISE NOTICE '✅ Agregados % créditos de prueba', credits_to_add;
            RAISE NOTICE '   Nuevo total: % créditos', current_credits + credits_to_add;
        ELSE
            RAISE NOTICE '';
            RAISE NOTICE 'Usuario ya tiene suficientes créditos (%)', current_credits;
        END IF;
    END;
    
    RAISE NOTICE '';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '✅ CONFIGURACIÓN COMPLETA';
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
WHERE u.wallet_address = '0x75376BC58830f27415402875D26B73A6BE8E2253'
GROUP BY u.id, au.email, u.wallet_address;
