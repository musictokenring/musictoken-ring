-- ==========================================
-- VERIFICAR CRÉDITOS EN LA BASE DE DATOS
-- ==========================================
-- Verifica si los créditos están realmente guardados en la BD

-- Verificar créditos para la wallet de tesorería
SELECT 
    u.id as user_id,
    u.wallet_address,
    COALESCE(uc.credits, 0) as credits_en_bd,
    uc.updated_at as ultima_actualizacion,
    CASE 
        WHEN uc.credits IS NULL THEN '❌ NO HAY REGISTRO EN user_credits'
        WHEN uc.credits = 0 THEN '⚠️  HAY REGISTRO PERO CRÉDITOS = 0'
        ELSE '✅ CRÉDITOS EXISTEN'
    END as estado
FROM users u
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.wallet_address = '0x75376BC58830f27415402875D26B73A6BE8E2253';

-- Verificar todos los usuarios con créditos
SELECT 
    u.wallet_address,
    COALESCE(uc.credits, 0) as credits,
    uc.updated_at
FROM users u
LEFT JOIN user_credits uc ON uc.user_id = u.id
ORDER BY uc.credits DESC NULLS LAST
LIMIT 10;

-- Verificar si hay registros recientes en user_credits
SELECT 
    user_id,
    credits,
    updated_at,
    NOW() - updated_at as tiempo_desde_actualizacion
FROM user_credits
ORDER BY updated_at DESC
LIMIT 5;
