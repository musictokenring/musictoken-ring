-- ==========================================
-- CONSOLIDAR USUARIOS DUPLICADOS POR WALLET
-- Este script identifica y consolida usuarios duplicados con la misma wallet
-- ==========================================

-- 1. IDENTIFICAR USUARIOS DUPLICADOS (misma wallet, diferente case)
SELECT 
    LOWER(wallet_address) as wallet_normalizada,
    COUNT(*) as cantidad_registros,
    STRING_AGG(id::text, ', ') as user_ids,
    STRING_AGG(wallet_address, ', ') as wallets_originales
FROM public.users
WHERE wallet_address IS NOT NULL
GROUP BY LOWER(wallet_address)
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- ==========================================
-- 2. CONSOLIDAR USUARIOS DUPLICADOS
-- ==========================================
-- Este script consolida todos los créditos en un solo usuario
-- y elimina los registros duplicados

DO $$
DECLARE
    wallet_duplicada TEXT;
    user_id_principal UUID;
    user_id_duplicado UUID;
    credits_duplicado DECIMAL;
    credits_total DECIMAL;
    correct_credits DECIMAL := 98024480; -- Balance on-chain correcto (1:1)
    rec RECORD;
BEGIN
    -- Iterar sobre todas las wallets duplicadas
    FOR rec IN 
        SELECT 
            LOWER(wallet_address) as wallet_norm,
            array_agg(id ORDER BY created_at ASC) as user_ids_array,
            array_agg(wallet_address) as wallets_array
        FROM public.users
        WHERE wallet_address IS NOT NULL
        GROUP BY LOWER(wallet_address)
        HAVING COUNT(*) > 1
    LOOP
        wallet_duplicada := rec.wallet_norm;
        
        -- El primer usuario creado será el principal
        user_id_principal := rec.user_ids_array[1];
        
        RAISE NOTICE '========================================';
        RAISE NOTICE 'Procesando wallet duplicada: %', wallet_duplicada;
        RAISE NOTICE 'User ID principal: %', user_id_principal;
        RAISE NOTICE 'User IDs duplicados: %', rec.user_ids_array;
        
        -- Sumar todos los créditos de los usuarios duplicados
        SELECT COALESCE(SUM(credits), 0) INTO credits_total
        FROM public.user_credits
        WHERE user_id = ANY(rec.user_ids_array);
        
        RAISE NOTICE 'Créditos totales encontrados: %', credits_total;
        
        -- Consolidar créditos en el usuario principal
        -- Si los créditos son mayores al correcto, establecer el valor correcto
        IF credits_total > correct_credits THEN
            RAISE NOTICE '⚠️ Créditos duplicados detectados. Corrigiendo a: %', correct_credits;
            
            -- Actualizar o insertar créditos correctos en el usuario principal
            INSERT INTO public.user_credits (user_id, credits, updated_at)
            VALUES (user_id_principal, correct_credits, NOW())
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                credits = correct_credits,
                updated_at = NOW();
        ELSE
            -- Si los créditos son correctos o menores, consolidarlos
            INSERT INTO public.user_credits (user_id, credits, updated_at)
            VALUES (user_id_principal, credits_total, NOW())
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                credits = credits_total,
                updated_at = NOW();
        END IF;
        
        -- Normalizar wallet_address del usuario principal a minúsculas
        UPDATE public.users
        SET wallet_address = LOWER(wallet_address)
        WHERE id = user_id_principal;
        
        -- Eliminar registros duplicados (todos excepto el principal)
        FOR i IN 2..array_length(rec.user_ids_array, 1) LOOP
            user_id_duplicado := rec.user_ids_array[i];
            
            RAISE NOTICE 'Eliminando usuario duplicado: %', user_id_duplicado;
            
            -- Eliminar créditos del usuario duplicado
            DELETE FROM public.user_credits WHERE user_id = user_id_duplicado;
            
            -- Eliminar el usuario duplicado
            DELETE FROM public.users WHERE id = user_id_duplicado;
        END LOOP;
        
        RAISE NOTICE '✅ Wallet consolidada exitosamente';
        RAISE NOTICE '========================================';
    END LOOP;
    
    RAISE NOTICE '✅✅✅ Consolidación completada';
END $$;

-- ==========================================
-- 3. VERIFICAR RESULTADO DESPUÉS DE CONSOLIDACIÓN
-- ==========================================

SELECT 
    LOWER(u.wallet_address) as wallet_normalizada,
    u.id as user_id,
    COALESCE(uc.credits, 0) as credits,
    uc.updated_at,
    CASE 
        WHEN COALESCE(uc.credits, 0) > 100000000 THEN '⚠️ Posible duplicado'
        WHEN COALESCE(uc.credits, 0) = 98024480 THEN '✅ Saldo correcto'
        ELSE 'ℹ️ Saldo normal'
    END as estado
FROM public.users u
LEFT JOIN public.user_credits uc ON u.id = uc.user_id
WHERE u.wallet_address IS NOT NULL
ORDER BY uc.credits DESC NULLS LAST
LIMIT 10;

-- ==========================================
-- 4. VERIFICAR QUE NO QUEDEN DUPLICADOS
-- ==========================================

SELECT 
    LOWER(wallet_address) as wallet_normalizada,
    COUNT(*) as cantidad
FROM public.users
WHERE wallet_address IS NOT NULL
GROUP BY LOWER(wallet_address)
HAVING COUNT(*) > 1;

-- Si este query no devuelve resultados, significa que no hay duplicados
