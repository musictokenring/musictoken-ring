-- ==========================================
-- CONFIGURAR WALLET DE TESORERÍA PARA TESTING
-- ==========================================
-- Este script configura la wallet de tesorería para que pueda usarse en testing
-- Vincula la wallet de tesorería al usuario de Google (fermorillomusic@gmail.com)
-- y verifica/crea créditos si es necesario

DO $$
DECLARE
    treasury_wallet TEXT := '0x75376BC58830f27415402875D26B73A6BE8E2253';
    user_email TEXT := 'fermorillomusic@gmail.com'; -- Buscará usuarios con este email
    user_record RECORD;
    wallet_record RECORD;
    credits_record RECORD;
    user_id_found UUID;
    credits_to_add NUMERIC := 1000; -- Créditos de prueba a agregar si no tiene
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'CONFIGURACIÓN WALLET TESORERÍA PARA TESTING';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '';
    
    -- PASO 1: Buscar usuario por email
    RAISE NOTICE 'PASO 1: Buscando usuario por email...';
    SELECT 
        au.id,
        au.email,
        au.raw_user_meta_data->>'full_name' as name
    INTO user_record
    FROM auth.users au
    WHERE LOWER(au.email) LIKE '%' || LOWER(user_email) || '%'
    LIMIT 1;
    
    IF user_record IS NULL THEN
        RAISE NOTICE '❌ Usuario NO encontrado con email que contenga: %', user_email;
        RAISE NOTICE '';
        RAISE NOTICE 'Listando todos los usuarios disponibles:';
        FOR user_record IN 
            SELECT id, email, raw_user_meta_data->>'full_name' as name
            FROM auth.users
            ORDER BY created_at DESC
            LIMIT 10
        LOOP
            RAISE NOTICE '  - Email: %, ID: %, Name: %', 
                user_record.email, user_record.id, COALESCE(user_record.name, 'N/A');
        END LOOP;
        RETURN;
    ELSE
        RAISE NOTICE '✅ Usuario encontrado:';
        RAISE NOTICE '   Email: %', user_record.email;
        RAISE NOTICE '   ID: %', user_record.id;
        RAISE NOTICE '   Name: %', COALESCE(user_record.name, 'N/A');
        user_id_found := user_record.id;
    END IF;
    
    RAISE NOTICE '';
    
    -- PASO 2: Verificar si existe en tabla users
    RAISE NOTICE 'PASO 2: Verificando si existe en tabla users...';
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = user_id_found) THEN
        RAISE NOTICE '⚠️ Usuario NO existe en tabla users, creándolo...';
        INSERT INTO users (id, wallet_address, created_at, updated_at)
        VALUES (user_id_found, treasury_wallet, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET wallet_address = treasury_wallet;
        RAISE NOTICE '✅ Usuario creado/actualizado en tabla users';
    ELSE
        RAISE NOTICE '✅ Usuario ya existe en tabla users';
        -- Actualizar wallet_address si es necesario
        UPDATE users 
        SET wallet_address = treasury_wallet, updated_at = NOW()
        WHERE id = user_id_found;
        RAISE NOTICE '✅ Wallet de tesorería asignada al usuario';
    END IF;
    
    RAISE NOTICE '';
    
    -- PASO 3: Verificar/crear vinculación en user_wallets
    RAISE NOTICE 'PASO 3: Verificando vinculación en user_wallets...';
    IF NOT EXISTS (
        SELECT 1 FROM user_wallets 
        WHERE user_id = user_id_found 
        AND LOWER(wallet_address) = LOWER(treasury_wallet)
    ) THEN
        RAISE NOTICE '⚠️ Wallet NO está vinculada, vinculando...';
        -- Verificar si la columna network existe antes de usarla
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'user_wallets' 
            AND column_name = 'network'
        ) THEN
            -- Si existe la columna network, usarla
            INSERT INTO user_wallets (user_id, wallet_address, linked_via, linked_at, network)
            VALUES (
                user_id_found, 
                treasury_wallet, 
                'manual', 
                NOW(), 
                'base'
            )
            ON CONFLICT (wallet_address) DO UPDATE SET 
                user_id = user_id_found,
                linked_via = 'manual',
                linked_at = NOW(),
                network = 'base';
        ELSE
            -- Si NO existe la columna network, insertar sin ella
            INSERT INTO user_wallets (user_id, wallet_address, linked_via, linked_at)
            VALUES (
                user_id_found, 
                treasury_wallet, 
                'manual', 
                NOW()
            )
            ON CONFLICT (wallet_address) DO UPDATE SET 
                user_id = user_id_found,
                linked_via = 'manual',
                linked_at = NOW();
        END IF;
        RAISE NOTICE '✅ Wallet vinculada exitosamente';
    ELSE
        RAISE NOTICE '✅ Wallet ya está vinculada';
    END IF;
    
    RAISE NOTICE '';
    
    -- PASO 4: Verificar créditos actuales
    RAISE NOTICE 'PASO 4: Verificando créditos actuales...';
    SELECT 
        COALESCE(SUM(credits), 0) as total_credits
    INTO credits_record
    FROM user_credits
    WHERE user_id = user_id_found;
    
    RAISE NOTICE 'Créditos actuales: %', credits_record.total_credits;
    
    -- PASO 5: Agregar créditos si no tiene suficientes
    IF credits_record.total_credits < 100 THEN
        RAISE NOTICE '';
        RAISE NOTICE 'PASO 5: Agregando créditos de prueba...';
        INSERT INTO user_credits (user_id, credits, reason, created_at)
        VALUES (user_id_found, credits_to_add, 'testing_treasury_setup', NOW());
        RAISE NOTICE '✅ Agregados % créditos de prueba', credits_to_add;
        RAISE NOTICE '   Nuevo total: % créditos', credits_record.total_credits + credits_to_add;
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE 'PASO 5: Usuario ya tiene suficientes créditos (% créditos)', credits_record.total_credits;
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'RESUMEN FINAL';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Usuario: % (%)', user_record.email, user_id_found;
    RAISE NOTICE 'Wallet: %', treasury_wallet;
    RAISE NOTICE 'Créditos: %', credits_record.total_credits + CASE WHEN credits_record.total_credits < 100 THEN credits_to_add ELSE 0 END;
    RAISE NOTICE 'Estado: ✅ Configurado para testing';
    RAISE NOTICE '==========================================';
END $$;

-- Verificación final: Mostrar estado completo
SELECT 
    u.id as user_id,
    au.email,
    u.wallet_address,
    COALESCE(SUM(uc.credits), 0) as total_credits,
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_wallets uw WHERE uw.user_id = u.id AND uw.wallet_address = u.wallet_address) 
        THEN '✅ Vinculada' 
        ELSE '❌ No vinculada' 
    END as wallet_status,
    COUNT(d.id) as total_deposits
FROM users u
LEFT JOIN auth.users au ON au.id = u.id
LEFT JOIN user_credits uc ON uc.user_id = u.id
LEFT JOIN deposits d ON d.user_id = u.id
WHERE u.wallet_address = '0x75376BC58830f27415402875D26B73A6BE8E2253'
GROUP BY u.id, au.email, u.wallet_address;
