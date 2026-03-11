-- ============================================
-- DIAGNÓSTICO PASO 1 Y PASO 4
-- Este script muestra solo el diagnóstico completo y usuarios con wallet en users pero no vinculada
-- ============================================

-- ============================================
-- PASO 1: DIAGNÓSTICO COMPLETO - TODOS LOS USUARIOS REGISTRADOS
-- ============================================
SELECT 
    '🔍 DIAGNÓSTICO COMPLETO' AS tipo,
    au.id::TEXT AS user_id,
    au.email AS email,
    au.created_at::TEXT AS fecha_registro,
    -- Wallet en tabla users
    u.wallet_address AS wallet_en_users,
    -- Wallet vinculada en user_wallets
    uw.wallet_address AS wallet_en_user_wallets,
    -- Estado de vinculación
    CASE 
        WHEN uw.wallet_address IS NOT NULL THEN '✅ VINCULADA'
        WHEN u.wallet_address IS NOT NULL THEN '⚠️ EN USERS PERO NO EN USER_WALLETS'
        ELSE '❌ SIN WALLET'
    END AS estado_wallet,
    -- Créditos
    COALESCE(uc.credits, 0) AS creditos,
    -- Depósitos
    (SELECT COUNT(*) FROM deposits d WHERE d.user_id = au.id) AS num_depositos,
    -- Último depósito
    (SELECT MAX(d.created_at) FROM deposits d WHERE d.user_id = au.id) AS ultimo_deposito,
    -- Problemas detectados
    CASE 
        WHEN uw.wallet_address IS NULL AND u.wallet_address IS NOT NULL THEN '⚠️ Wallet en users pero no vinculada'
        WHEN uw.wallet_address IS NULL AND u.wallet_address IS NULL AND (SELECT COUNT(*) FROM deposits d WHERE d.user_id = au.id) > 0 THEN '⚠️ Tiene depósitos pero no tiene wallet'
        WHEN uw.wallet_address IS NULL AND uc.credits > 0 THEN '❌ CRÍTICO: Tiene créditos pero no tiene wallet vinculada'
        WHEN uw.wallet_address IS NULL THEN '⚠️ Sin wallet vinculada'
        ELSE '✅ OK'
    END AS problema_detectado
FROM auth.users au
LEFT JOIN users u ON u.id = au.id
LEFT JOIN user_wallets uw ON uw.user_id = au.id
LEFT JOIN user_credits uc ON uc.user_id = au.id
ORDER BY 
    CASE 
        WHEN uw.wallet_address IS NULL AND uc.credits > 0 THEN 1  -- Críticos primero
        WHEN uw.wallet_address IS NULL AND u.wallet_address IS NOT NULL THEN 2  -- Fáciles de corregir
        WHEN uw.wallet_address IS NULL THEN 3  -- Sin wallet
        ELSE 4  -- OK
    END,
    au.created_at DESC;

-- ============================================
-- PASO 4: USUARIOS CON WALLET EN USERS PERO NO VINCULADA
-- ============================================
-- Estos usuarios pueden corregirse automáticamente porque tienen wallet en users
SELECT 
    '⚠️ USUARIOS CON WALLET EN USERS PERO NO VINCULADA' AS tipo,
    au.id::TEXT AS user_id,
    au.email AS email,
    u.wallet_address AS wallet_en_users,
    COALESCE(uc.credits, 0) AS creditos,
    (SELECT COUNT(*) FROM deposits d WHERE d.user_id = au.id) AS num_depositos,
    '✅ PUEDE CORREGIRSE AUTOMÁTICAMENTE' AS accion_posible
FROM auth.users au
INNER JOIN users u ON u.id = au.id
LEFT JOIN user_wallets uw ON uw.user_id = au.id
LEFT JOIN user_credits uc ON uc.user_id = au.id
WHERE u.wallet_address IS NOT NULL
    AND u.wallet_address != ''
    AND uw.wallet_address IS NULL
ORDER BY uc.credits DESC NULLS LAST;
