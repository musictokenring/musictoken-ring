-- ============================================
-- PASO 1: IDENTIFICAR WALLETS QUE NECESITAN VINCULACIÓN
-- Ejecuta este script primero para ver qué wallets necesitan vincularse
-- ============================================

SELECT 
    '🔍 WALLETS QUE NECESITAN VINCULACIÓN' AS tipo,
    u.id::TEXT AS user_id_en_users,
    u.wallet_address AS wallet_en_users,
    au.id::TEXT AS user_id_en_auth_users,
    au.email AS email,
    uw.wallet_address AS wallet_en_user_wallets,
    COALESCE(uc.credits, 0) AS creditos,
    (SELECT COUNT(*) FROM deposits d WHERE d.user_id = u.id) AS num_depositos,
    CASE 
        WHEN au.id IS NOT NULL THEN '✅ Usuario existe en auth.users - puede vincularse'
        ELSE '⚠️ Usuario NO existe en auth.users - necesita registro'
    END AS estado
FROM users u
LEFT JOIN auth.users au ON au.id = u.id
LEFT JOIN user_wallets uw ON uw.wallet_address = u.wallet_address
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.wallet_address IS NOT NULL
    AND u.wallet_address != ''
    -- Excluir wallet de plataforma/tesorería
    AND LOWER(u.wallet_address) != '0x75376bc58830f27415402875d26b73a6be8e2253'
    -- Excluir wallets renombradas (que terminan en _old_)
    AND u.wallet_address NOT LIKE '%_old_%'
    -- Solo wallets que NO están en user_wallets
    AND uw.wallet_address IS NULL
ORDER BY 
    CASE WHEN au.id IS NOT NULL THEN 1 ELSE 2 END,  -- Usuarios existentes primero
    creditos DESC NULLS LAST,
    num_depositos DESC;
