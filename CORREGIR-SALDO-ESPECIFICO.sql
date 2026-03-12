-- ==========================================
-- CORREGIR SALDO ESPECÍFICO DE UNA WALLET
-- Script rápido para corregir el saldo de una wallet específica
-- ==========================================

-- Reemplaza 'TU_WALLET_ADDRESS' con tu dirección de wallet
-- Ejemplo: '0x75376BC58830f27415402875D26B73A6BE8E2253'

DO $$
DECLARE
    wallet_addr TEXT := 'TU_WALLET_ADDRESS'; -- ⚠️ CAMBIAR ESTA DIRECCIÓN
    user_id_found UUID;
    current_credits DECIMAL;
    correct_credits DECIMAL := 98024480; -- Balance on-chain correcto (1:1)
BEGIN
    -- Buscar el user_id por wallet_address (case-insensitive)
    SELECT id INTO user_id_found
    FROM public.users
    WHERE LOWER(wallet_address) = LOWER(wallet_addr)
    ORDER BY created_at ASC -- Tomar el más antiguo si hay duplicados
    LIMIT 1;
    
    IF user_id_found IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado con wallet: %', wallet_addr;
    END IF;
    
    -- Obtener créditos actuales
    SELECT COALESCE(credits, 0) INTO current_credits
    FROM public.user_credits
    WHERE user_id = user_id_found;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CORRECCIÓN DE SALDO';
    RAISE NOTICE '  Wallet: %', wallet_addr;
    RAISE NOTICE '  User ID: %', user_id_found;
    RAISE NOTICE '  Créditos actuales: %', current_credits;
    RAISE NOTICE '  Créditos correctos: %', correct_credits;
    RAISE NOTICE '  Diferencia: %', current_credits - correct_credits;
    RAISE NOTICE '========================================';
    
    -- Actualizar a la cantidad correcta
    INSERT INTO public.user_credits (user_id, credits, updated_at)
    VALUES (user_id_found, correct_credits, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        credits = correct_credits,
        updated_at = NOW();
    
    -- Verificar después de actualizar
    SELECT credits INTO current_credits
    FROM public.user_credits
    WHERE user_id = user_id_found;
    
    RAISE NOTICE 'DESPUÉS DE CORRECCIÓN:';
    RAISE NOTICE '  Créditos actualizados: %', current_credits;
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Saldo corregido exitosamente';
END $$;
