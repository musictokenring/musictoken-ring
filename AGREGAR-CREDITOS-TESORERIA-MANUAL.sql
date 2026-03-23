-- ==========================================
-- AGREGAR CRÉDITOS MANUALMENTE A TESORERÍA
-- ==========================================
-- Este script agrega créditos directamente a la wallet de tesorería
-- Úsalo cuando CORS bloquea la conversión automática desde el frontend

DO $$
DECLARE
    treasury_wallet TEXT := '0x0000000000000000000000000000000000000001';
    user_email TEXT := 'fermorillomusic@gmail.com';
    user_id_found UUID;
    credits_to_add NUMERIC := 1000000; -- 1 millón de créditos (ajusta según necesites)
    has_reason BOOLEAN;
    has_created_at BOOLEAN;
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'AGREGAR CRÉDITOS MANUALMENTE';
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
    
    -- Verificar columnas opcionales
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'user_credits' 
        AND column_name = 'reason'
    ) INTO has_reason;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'user_credits' 
        AND column_name = 'created_at'
    ) INTO has_created_at;
    
    RAISE NOTICE 'Columnas disponibles - reason: %, created_at: %', has_reason, has_created_at;
    RAISE NOTICE '';
    
    -- Deshabilitar triggers temporalmente para evitar errores
    ALTER TABLE user_credits DISABLE TRIGGER ALL;
    
    -- Agregar créditos
    IF has_reason AND has_created_at THEN
        INSERT INTO user_credits (user_id, credits, reason, created_at)
        VALUES (user_id_found, credits_to_add, 'manual_treasury_setup', NOW())
        ON CONFLICT (user_id) DO UPDATE SET 
            credits = user_credits.credits + credits_to_add,
            updated_at = NOW();
        
        RAISE NOTICE '✅ Créditos agregados con reason y created_at';
    ELSIF has_reason THEN
        INSERT INTO user_credits (user_id, credits, reason)
        VALUES (user_id_found, credits_to_add, 'manual_treasury_setup')
        ON CONFLICT (user_id) DO UPDATE SET 
            credits = user_credits.credits + credits_to_add,
            updated_at = NOW();
        
        RAISE NOTICE '✅ Créditos agregados con reason';
    ELSIF has_created_at THEN
        INSERT INTO user_credits (user_id, credits, created_at)
        VALUES (user_id_found, credits_to_add, NOW())
        ON CONFLICT (user_id) DO UPDATE SET 
            credits = user_credits.credits + credits_to_add,
            updated_at = NOW();
        
        RAISE NOTICE '✅ Créditos agregados con created_at';
    ELSE
        INSERT INTO user_credits (user_id, credits)
        VALUES (user_id_found, credits_to_add)
        ON CONFLICT (user_id) DO UPDATE SET 
            credits = user_credits.credits + credits_to_add,
            updated_at = NOW();
        
        RAISE NOTICE '✅ Créditos agregados (sin columnas opcionales)';
    END IF;
    
    -- Rehabilitar triggers
    ALTER TABLE user_credits ENABLE TRIGGER ALL;
    
    RAISE NOTICE '';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '✅ CRÉDITOS AGREGADOS EXITOSAMENTE';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Créditos agregados: %', credits_to_add;
    RAISE NOTICE '';
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
