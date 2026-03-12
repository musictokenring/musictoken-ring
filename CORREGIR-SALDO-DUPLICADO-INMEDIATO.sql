-- ==========================================
-- CORREGIR SALDO DUPLICADO INMEDIATAMENTE
-- Establece el saldo correcto basado en el balance on-chain (98,024,480)
-- ==========================================

-- ==========================================
-- CORREGIR SALDO DUPLICADO INMEDIATAMENTE
-- Establece el saldo correcto basado en el balance on-chain (98,024,480)
-- ==========================================

-- IMPORTANTE: Reemplaza la wallet address con la tuya
-- O ejecuta esto para todas las wallets con saldo duplicado

DO $$
DECLARE
    wallet_correcta TEXT := '0x75376BC58830f27415402875D26B73A6BE8E2253'; -- ⚠️ REEMPLAZA CON TU WALLET
    correct_credits DECIMAL := 98024480; -- Balance on-chain correcto (1:1)
    user_id_encontrado UUID;
    credits_actuales DECIMAL;
BEGIN
    -- Buscar usuario por wallet (case-insensitive)
    SELECT id INTO user_id_encontrado
    FROM public.users
    WHERE LOWER(wallet_address) = LOWER(wallet_correcta)
    LIMIT 1;
    
    IF user_id_encontrado IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado para wallet: %', wallet_correcta;
    END IF;
    
    -- Obtener créditos actuales
    SELECT COALESCE(credits, 0) INTO credits_actuales
    FROM public.user_credits
    WHERE user_id = user_id_encontrado;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Wallet: %', wallet_correcta;
    RAISE NOTICE 'User ID: %', user_id_encontrado;
    RAISE NOTICE 'Créditos actuales: %', credits_actuales;
    RAISE NOTICE 'Créditos correctos: %', correct_credits;
    RAISE NOTICE '========================================';
    
    -- Corregir créditos al valor correcto
    INSERT INTO public.user_credits (user_id, credits, updated_at)
    VALUES (user_id_encontrado, correct_credits, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        credits = correct_credits,
        updated_at = NOW();
    
    RAISE NOTICE '✅ Créditos corregidos a: %', correct_credits;
END $$;

-- ==========================================
-- VERIFICAR RESULTADO
-- ==========================================

SELECT 
    u.wallet_address,
    u.id as user_id,
    COALESCE(uc.credits, 0) as credits,
    CASE 
        WHEN COALESCE(uc.credits, 0) = 98024480 THEN '✅ Saldo correcto'
        WHEN COALESCE(uc.credits, 0) > 100000000 THEN '⚠️ Aún duplicado'
        ELSE 'ℹ️ Otro valor'
    END as estado
FROM public.users u
LEFT JOIN public.user_credits uc ON u.id = uc.user_id
WHERE LOWER(u.wallet_address) = LOWER('0x75376BC58830f27415402875D26B73A6BE8E2253'); -- Reemplaza con tu wallet
