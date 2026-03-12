-- ==========================================
-- VERIFICAR SALDO DE USUARIO PARA DESAFÍO
-- ==========================================
-- Este script verifica el estado completo de un usuario:
-- - Créditos en la base de datos
-- - Wallet vinculada
-- - Depósitos realizados
-- - Estado del desafío

-- PASO 1: Verificar usuario por wallet address
-- Reemplaza '0x7537...2253' con la wallet del usuario que está aceptando el desafío
DO $$
DECLARE
    target_wallet TEXT := '0x7537...2253'; -- ⚠️ CAMBIAR ESTA WALLET
    user_record RECORD;
    credits_record RECORD;
    deposits_record RECORD;
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'VERIFICACIÓN DE SALDO PARA DESAFÍO';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '';
    
    -- Buscar usuario por wallet
    SELECT 
        u.id as user_id,
        u.wallet_address,
        au.email,
        au.id as auth_user_id
    INTO user_record
    FROM users u
    LEFT JOIN auth.users au ON au.id = u.id
    WHERE LOWER(u.wallet_address) = LOWER(target_wallet)
    LIMIT 1;
    
    IF user_record IS NULL THEN
        RAISE NOTICE '❌ Usuario NO encontrado con wallet: %', target_wallet;
        RAISE NOTICE '';
        RAISE NOTICE 'Buscando en user_wallets...';
        
        -- Buscar en user_wallets
        SELECT 
            uw.user_id,
            uw.wallet_address,
            au.email,
            au.id as auth_user_id
        INTO user_record
        FROM user_wallets uw
        LEFT JOIN auth.users au ON au.id = uw.user_id
        WHERE LOWER(uw.wallet_address) = LOWER(target_wallet)
        LIMIT 1;
        
        IF user_record IS NULL THEN
            RAISE NOTICE '❌ Wallet NO encontrada en user_wallets tampoco';
            RETURN;
        ELSE
            RAISE NOTICE '✅ Usuario encontrado en user_wallets';
        END IF;
    ELSE
        RAISE NOTICE '✅ Usuario encontrado en users';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '--- INFORMACIÓN DEL USUARIO ---';
    RAISE NOTICE 'User ID: %', user_record.user_id;
    RAISE NOTICE 'Wallet: %', user_record.wallet_address;
    RAISE NOTICE 'Email: %', COALESCE(user_record.email, 'NO REGISTRADO');
    RAISE NOTICE 'Auth User ID: %', COALESCE(user_record.auth_user_id::TEXT, 'NO EXISTE EN auth.users');
    RAISE NOTICE '';
    
    -- Verificar créditos
    SELECT 
        COALESCE(SUM(credits), 0) as total_credits
    INTO credits_record
    FROM user_credits
    WHERE user_id = user_record.user_id;
    
    RAISE NOTICE '--- CRÉDITOS ---';
    RAISE NOTICE 'Total créditos: %', credits_record.total_credits;
    
    -- Verificar depósitos
    SELECT 
        COUNT(*) as total_deposits,
        COALESCE(SUM(amount), 0) as total_deposited
    INTO deposits_record
    FROM deposits
    WHERE user_id = user_record.user_id;
    
    RAISE NOTICE '';
    RAISE NOTICE '--- DEPÓSITOS ---';
    RAISE NOTICE 'Total depósitos: %', deposits_record.total_deposits;
    RAISE NOTICE 'Total depositado: %', deposits_record.total_deposited;
    RAISE NOTICE '';
    
    -- Verificar wallet vinculada
    RAISE NOTICE '--- WALLET VINCULADA ---';
    IF EXISTS (
        SELECT 1 FROM user_wallets 
        WHERE user_id = user_record.user_id 
        AND LOWER(wallet_address) = LOWER(target_wallet)
    ) THEN
        RAISE NOTICE '✅ Wallet está vinculada en user_wallets';
    ELSE
        RAISE NOTICE '❌ Wallet NO está vinculada en user_wallets';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '--- RESUMEN ---';
    IF credits_record.total_credits > 0 THEN
        RAISE NOTICE '✅ El usuario TIENE créditos: %', credits_record.total_credits;
    ELSE
        RAISE NOTICE '⚠️ El usuario NO tiene créditos (0)';
        IF deposits_record.total_deposits > 0 THEN
            RAISE NOTICE '⚠️ PERO tiene % depósito(s) por un total de %', 
                deposits_record.total_deposits, deposits_record.total_deposited;
            RAISE NOTICE '⚠️ Esto sugiere que los depósitos no se convirtieron a créditos';
        ELSE
            RAISE NOTICE 'ℹ️ El usuario NO ha hecho depósitos aún';
        END IF;
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '==========================================';
END $$;

-- PASO 2: Verificar desafío específico
-- Reemplaza 'ZCAX6BQJ4JBY' con el ID del desafío
SELECT 
    sc.id,
    sc.challenge_id,
    sc.challenger_id,
    sc.status,
    sc.bet_amount,
    sc.challenger_song_name,
    sc.created_at,
    au_challenger.email as challenger_email,
    au_accepter.email as accepter_email,
    sc.accepter_id
FROM social_challenges sc
LEFT JOIN auth.users au_challenger ON au_challenger.id = sc.challenger_id
LEFT JOIN auth.users au_accepter ON au_accepter.id = sc.accepter_id
WHERE sc.challenge_id = 'ZCAX6BQJ4JBY' -- ⚠️ CAMBIAR ESTE ID
LIMIT 1;

-- PASO 3: Verificar todos los usuarios con wallet similar (para encontrar la correcta)
-- Si no estás seguro de la wallet exacta, usa este query
SELECT 
    u.id as user_id,
    u.wallet_address,
    au.email,
    COALESCE(SUM(uc.credits), 0) as total_credits,
    COUNT(d.id) as total_deposits,
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_wallets uw WHERE uw.user_id = u.id AND uw.wallet_address = u.wallet_address) 
        THEN '✅ Vinculada' 
        ELSE '❌ No vinculada' 
    END as wallet_status
FROM users u
LEFT JOIN auth.users au ON au.id = u.id
LEFT JOIN user_credits uc ON uc.user_id = u.id
LEFT JOIN deposits d ON d.user_id = u.id
WHERE u.wallet_address LIKE '%7537%' -- ⚠️ Busca wallets que contengan '7537'
GROUP BY u.id, u.wallet_address, au.email
ORDER BY total_credits DESC;
