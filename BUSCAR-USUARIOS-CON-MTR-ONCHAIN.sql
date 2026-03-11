-- ============================================
-- BUSCAR USUARIOS CON MTR ON-CHAIN PERO SIN WALLET VINCULADA
-- Este script busca usuarios que pueden tener MTR on-chain pero no aparecen
-- en user_wallets o user_credits porque nunca hicieron depósito
-- ============================================

-- ============================================
-- PASO 1: USUARIOS CON DEPÓSITOS PERO SIN WALLET VINCULADA EN user_wallets
-- ============================================
-- Estos usuarios hicieron depósitos pero su wallet no está vinculada correctamente
SELECT 
    '💰 USUARIOS CON DEPÓSITOS PERO SIN WALLET VINCULADA' AS tipo,
    au.id::TEXT AS user_id,
    au.email AS email,
    u.wallet_address AS wallet_en_users,
    uw.wallet_address AS wallet_en_user_wallets,
    COUNT(DISTINCT d.id) AS num_depositos,
    SUM(d.credits_awarded) AS total_creditos_depositados,
    MAX(d.created_at) AS ultimo_deposito,
    COALESCE(uc.credits, 0) AS creditos_actuales,
    CASE 
        WHEN uw.wallet_address IS NULL AND u.wallet_address IS NOT NULL THEN '⚠️ Tiene wallet en users pero no vinculada en user_wallets'
        WHEN uw.wallet_address IS NULL AND u.wallet_address IS NULL THEN '❌ Tiene depósitos pero no tiene wallet en ninguna parte'
        ELSE '✅ OK'
    END AS problema
FROM auth.users au
INNER JOIN deposits d ON d.user_id = au.id
LEFT JOIN users u ON u.id = au.id
LEFT JOIN user_wallets uw ON uw.user_id = au.id
LEFT JOIN user_credits uc ON uc.user_id = au.id
WHERE uw.wallet_address IS NULL  -- No tiene wallet vinculada en user_wallets
GROUP BY au.id, au.email, u.wallet_address, uw.wallet_address, uc.credits
ORDER BY num_depositos DESC, total_creditos_depositados DESC;

-- ============================================
-- PASO 2: WALLETS EN users QUE NO ESTÁN EN user_wallets
-- ============================================
-- Estas wallets están en users pero no vinculadas en user_wallets
SELECT 
    '🔗 WALLETS EN users PERO NO VINCULADAS' AS tipo,
    u.id::TEXT AS user_id,
    au.email AS email,
    u.wallet_address AS wallet_en_users,
    uw.wallet_address AS wallet_en_user_wallets,
    COALESCE(uc.credits, 0) AS creditos,
    (SELECT COUNT(*) FROM deposits d WHERE d.user_id = u.id) AS num_depositos,
    '✅ PUEDE CORREGIRSE AUTOMÁTICAMENTE' AS accion
FROM users u
LEFT JOIN auth.users au ON au.id = u.id
LEFT JOIN user_wallets uw ON uw.wallet_address = u.wallet_address
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.wallet_address IS NOT NULL
    AND u.wallet_address != ''
    AND uw.wallet_address IS NULL  -- No está vinculada en user_wallets
ORDER BY creditos DESC NULLS LAST, num_depositos DESC;

-- ============================================
-- PASO 3: USUARIOS CON CRÉDITOS PERO SIN WALLET VINCULADA
-- ============================================
-- Estos usuarios tienen créditos pero no tienen wallet vinculada
SELECT 
    '💳 USUARIOS CON CRÉDITOS PERO SIN WALLET VINCULADA' AS tipo,
    uc.user_id::TEXT AS user_id,
    au.email AS email,
    uc.credits AS creditos,
    u.wallet_address AS wallet_en_users,
    uw.wallet_address AS wallet_en_user_wallets,
    (SELECT COUNT(*) FROM deposits d WHERE d.user_id = uc.user_id) AS num_depositos,
    CASE 
        WHEN u.wallet_address IS NOT NULL THEN '⚠️ Tiene wallet en users pero no vinculada'
        ELSE '❌ No tiene wallet en ninguna parte'
    END AS problema
FROM user_credits uc
LEFT JOIN auth.users au ON au.id = uc.user_id
LEFT JOIN users u ON u.id = uc.user_id
LEFT JOIN user_wallets uw ON uw.user_id = uc.user_id
WHERE uc.credits > 0
    AND uw.wallet_address IS NULL  -- No tiene wallet vinculada
ORDER BY uc.credits DESC;

-- ============================================
-- PASO 4: TODAS LAS WALLETS ÚNICAS EN deposits
-- ============================================
-- Buscar todas las wallets que han hecho depósitos
-- Esto puede ayudar a identificar usuarios que tienen wallets pero no están vinculadas
SELECT 
    '📥 WALLETS QUE HAN HECHO DEPÓSITOS' AS tipo,
    COUNT(DISTINCT d.user_id) AS usuarios_con_depositos,
    COUNT(DISTINCT d.id) AS total_depositos,
    SUM(d.credits_awarded) AS total_creditos_depositados
FROM deposits d;

-- ============================================
-- PASO 5: VERIFICAR DISCREPANCIAS ENTRE users Y user_wallets
-- ============================================
-- Encontrar wallets que están en users pero no en user_wallets
SELECT 
    '🔍 DISCREPANCIAS users vs user_wallets' AS tipo,
    u.id::TEXT AS user_id_users,
    u.wallet_address AS wallet_en_users,
    uw.user_id::TEXT AS user_id_user_wallets,
    uw.wallet_address AS wallet_en_user_wallets,
    au.email AS email,
    COALESCE(uc.credits, 0) AS creditos,
    CASE 
        WHEN uw.wallet_address IS NULL THEN '❌ Wallet en users pero NO en user_wallets'
        WHEN u.wallet_address IS NULL AND uw.wallet_address IS NOT NULL THEN '⚠️ Wallet en user_wallets pero NO en users'
        ELSE '✅ Coincide'
    END AS estado
FROM users u
FULL OUTER JOIN user_wallets uw ON uw.wallet_address = u.wallet_address
LEFT JOIN auth.users au ON au.id = COALESCE(u.id, uw.user_id)
LEFT JOIN user_credits uc ON uc.user_id = COALESCE(u.id, uw.user_id)
WHERE (uw.wallet_address IS NULL AND u.wallet_address IS NOT NULL)
    OR (u.wallet_address IS NULL AND uw.wallet_address IS NOT NULL)
ORDER BY creditos DESC NULLS LAST;
