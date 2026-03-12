-- ==========================================
-- VERIFICAR SALDO ACTUAL DE CRÉDITOS
-- Ejecuta este script para ver tu saldo actual antes de corregir
-- ==========================================

-- Reemplaza 'TU_WALLET_ADDRESS' con tu dirección de wallet
-- Ejemplo: '0x75376BC58830f27415402875D26B73A6BE8E2253'

SELECT 
    u.wallet_address,
    u.id as user_id,
    COALESCE(uc.credits, 0) as credits_actuales,
    uc.updated_at as ultima_actualizacion,
    CASE 
        WHEN COALESCE(uc.credits, 0) > 98024480 THEN 
            '⚠️ SALDO DUPLICADO - Debería ser 98,024,480'
        WHEN COALESCE(uc.credits, 0) = 98024480 THEN 
            '✅ SALDO CORRECTO'
        ELSE 
            'ℹ️ Saldo menor al esperado'
    END as estado
FROM public.users u
LEFT JOIN public.user_credits uc ON u.id = uc.user_id
WHERE u.wallet_address = 'TU_WALLET_ADDRESS' -- ⚠️ CAMBIAR ESTA DIRECCIÓN
ORDER BY uc.updated_at DESC;

-- ==========================================
-- VER TODOS LOS USUARIOS CON CRÉDITOS ALTOS (posiblemente duplicados)
-- ==========================================

SELECT 
    u.wallet_address,
    u.id as user_id,
    COALESCE(uc.credits, 0) as credits,
    uc.updated_at,
    CASE 
        WHEN COALESCE(uc.credits, 0) > 100000000 THEN '⚠️ Posible duplicado'
        ELSE '✅ Normal'
    END as observacion
FROM public.users u
LEFT JOIN public.user_credits uc ON u.id = uc.user_id
WHERE COALESCE(uc.credits, 0) > 0
ORDER BY uc.credits DESC
LIMIT 10;
