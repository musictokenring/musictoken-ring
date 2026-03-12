-- ==========================================
-- CORREGIR SALDO DUPLICADO EN CRÉDITOS
-- Este script corrige créditos que fueron agregados múltiples veces
-- ==========================================

-- IMPORTANTE: Reemplaza 'TU_WALLET_ADDRESS' con tu dirección de wallet real
-- Ejemplo: '0x75376BC58830f27415402875D26B73A6BE8E2253'

-- 1. Ver el saldo actual antes de corregir
DO $$
DECLARE
    wallet_addr TEXT := 'TU_WALLET_ADDRESS'; -- ⚠️ CAMBIAR ESTA DIRECCIÓN
    user_id_found UUID;
    current_credits DECIMAL;
    correct_credits DECIMAL := 98024480; -- Balance on-chain correcto (1:1)
BEGIN
    -- Buscar el user_id por wallet_address
    SELECT id INTO user_id_found
    FROM public.users
    WHERE wallet_address = wallet_addr
    LIMIT 1;
    
    IF user_id_found IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado con wallet: %', wallet_addr;
    END IF;
    
    -- Obtener créditos actuales
    SELECT credits INTO current_credits
    FROM public.user_credits
    WHERE user_id = user_id_found;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ANTES DE CORRECCIÓN:';
    RAISE NOTICE '  Wallet: %', wallet_addr;
    RAISE NOTICE '  User ID: %', user_id_found;
    RAISE NOTICE '  Créditos actuales: %', current_credits;
    RAISE NOTICE '  Créditos correctos: %', correct_credits;
    RAISE NOTICE '========================================';
    
    -- Actualizar a la cantidad correcta
    UPDATE public.user_credits
    SET 
        credits = correct_credits,
        updated_at = NOW()
    WHERE user_id = user_id_found;
    
    -- Verificar después de actualizar
    SELECT credits INTO current_credits
    FROM public.user_credits
    WHERE user_id = user_id_found;
    
    RAISE NOTICE 'DESPUÉS DE CORRECCIÓN:';
    RAISE NOTICE '  Créditos actualizados: %', current_credits;
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Saldo corregido exitosamente';
END $$;

-- ==========================================
-- VERSIÓN ALTERNATIVA: Corregir por user_id directamente
-- ==========================================
-- Si conoces el user_id, usa este script en su lugar:

/*
DO $$
DECLARE
    user_id_found UUID := 'TU_USER_ID_AQUI'; -- ⚠️ CAMBIAR ESTE UUID
    correct_credits DECIMAL := 98024480; -- Balance on-chain correcto (1:1)
BEGIN
    UPDATE public.user_credits
    SET 
        credits = correct_credits,
        updated_at = NOW()
    WHERE user_id = user_id_found;
    
    RAISE NOTICE '✅ Créditos corregidos para user_id: %', user_id_found;
END $$;
*/

-- ==========================================
-- VERIFICAR SALDO DESPUÉS DE CORRECCIÓN
-- ==========================================
-- Ejecuta este query para verificar el saldo corregido:

/*
SELECT 
    u.wallet_address,
    u.id as user_id,
    uc.credits,
    uc.updated_at
FROM public.users u
LEFT JOIN public.user_credits uc ON u.id = uc.user_id
WHERE u.wallet_address = 'TU_WALLET_ADDRESS'; -- ⚠️ CAMBIAR ESTA DIRECCIÓN
*/
