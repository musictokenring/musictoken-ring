-- ==========================================
-- VERIFICAR WALLET Y USER_ID CORRESPONDIENTE
-- ==========================================
-- Verifica qué userId corresponde a la wallet de tesorería

-- Verificar wallet de tesorería y su userId
SELECT 
    u.id as user_id,
    u.wallet_address,
    COALESCE(uc.credits, 0) as credits_en_bd,
    uc.updated_at as ultima_actualizacion,
    CASE 
        WHEN uc.credits IS NULL THEN '❌ NO HAY REGISTRO EN user_credits'
        WHEN uc.credits = 0 THEN '⚠️  HAY REGISTRO PERO CRÉDITOS = 0'
        ELSE '✅ CRÉDITOS EXISTEN: ' || uc.credits::text
    END as estado
FROM users u
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.wallet_address = '0x75376BC58830f27415402875D26B73A6BE8E2253';

-- Verificar si hay múltiples usuarios con esa wallet
SELECT 
    u.id as user_id,
    u.wallet_address,
    u.created_at,
    COALESCE(uc.credits, 0) as credits
FROM users u
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE LOWER(u.wallet_address) = LOWER('0x75376BC58830f27415402875D26B73A6BE8E2253');

-- Verificar el userId que aparece en los logs del frontend
-- (0940db31-9a51-403b-bfcc-cc66c383eb91 según los logs)
SELECT 
    u.id as user_id,
    u.wallet_address,
    COALESCE(uc.credits, 0) as credits_en_bd,
    uc.updated_at
FROM users u
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.id = '0940db31-9a51-403b-bfcc-cc66c383eb91';

-- Verificar si hay usuarios vinculados con auth.users
SELECT 
    au.id as auth_user_id,
    au.email,
    u.id as public_user_id,
    u.wallet_address,
    COALESCE(uc.credits, 0) as credits
FROM auth.users au
LEFT JOIN public.users u ON LOWER(u.wallet_address) = LOWER(COALESCE(au.raw_user_meta_data->>'wallet_address', au.email))
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE au.email = 'fermorillomusic@gmail.com'
   OR u.wallet_address = '0x75376BC58830f27415402875D26B73A6BE8E2253';
