-- ============================================
-- VERIFICAR USUARIO ANTES DE VINCULAR
-- Verifica si el usuario tiene depósitos, créditos o está relacionado con otros usuarios
-- ============================================

-- Verificar usuario específico
SELECT 
    '🔍 VERIFICACIÓN DEL USUARIO' AS tipo,
    u.id::TEXT AS user_id_en_users,
    u.wallet_address AS wallet,
    au.id::TEXT AS user_id_en_auth_users,
    au.email AS email,
    COALESCE(uc.credits, 0) AS creditos,
    (SELECT COUNT(*) FROM deposits d WHERE d.user_id = u.id) AS num_depositos,
    (SELECT SUM(credits_awarded) FROM deposits d WHERE d.user_id = u.id) AS total_creditos_depositados,
    (SELECT MAX(created_at) FROM deposits d WHERE d.user_id = u.id) AS ultimo_deposito,
    CASE 
        WHEN au.id IS NOT NULL THEN '✅ Existe en auth.users'
        ELSE '❌ NO existe en auth.users'
    END AS existe_en_auth_users
FROM users u
LEFT JOIN auth.users au ON au.id = u.id
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.id = '18af16ee-ddc2-4829-8a6d-df3f9976336a'::UUID;

-- Verificar si esta wallet está vinculada a otro usuario en user_wallets
SELECT 
    '🔗 VERIFICAR SI WALLET ESTÁ VINCULADA A OTRO USUARIO' AS tipo,
    uw.user_id::TEXT AS user_id_en_user_wallets,
    uw.wallet_address AS wallet,
    au.email AS email,
    COALESCE(uc.credits, 0) AS creditos
FROM user_wallets uw
LEFT JOIN auth.users au ON au.id = uw.user_id
LEFT JOIN user_credits uc ON uc.user_id = uw.user_id
WHERE uw.wallet_address = '0x2cff890f0378a11913b6129b2e97417a2c302680';

-- Verificar si hay otros usuarios en auth.users que deberían tener esta wallet
SELECT 
    '👥 BUSCAR USUARIOS EN auth.users SIN WALLET' AS tipo,
    au.id::TEXT AS user_id,
    au.email AS email,
    au.created_at::TEXT AS fecha_registro,
    u.wallet_address AS wallet_en_users,
    uw.wallet_address AS wallet_en_user_wallets,
    COALESCE(uc.credits, 0) AS creditos
FROM auth.users au
LEFT JOIN users u ON u.id = au.id
LEFT JOIN user_wallets uw ON uw.user_id = au.id
LEFT JOIN user_credits uc ON uc.user_id = au.id
WHERE au.email IS NOT NULL
    AND (u.wallet_address IS NULL OR uw.wallet_address IS NULL)
ORDER BY au.created_at DESC
LIMIT 10;
