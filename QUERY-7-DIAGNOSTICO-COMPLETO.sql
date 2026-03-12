-- ============================================
-- QUERY 7: DIAGNÓSTICO COMPLETO - Todo en uno
-- Ejecuta este query en Supabase SQL Editor
-- ============================================

SELECT 
    'Usuario ID' AS campo,
    u.id::TEXT AS valor
FROM auth.users u
WHERE u.id = '978e9e29-11b0-405d-bf68-b20622016aad'

UNION ALL

SELECT 
    'Email',
    u.email
FROM auth.users u
WHERE u.id = '978e9e29-11b0-405d-bf68-b20622016aad'

UNION ALL

SELECT 
    'Créditos Actuales',
    COALESCE(uc.credits::TEXT, '0') AS valor
FROM user_credits uc
WHERE uc.user_id = '978e9e29-11b0-405d-bf68-b20622016aad'

UNION ALL

SELECT 
    'Última Actualización Créditos',
    COALESCE(uc.updated_at::TEXT, 'Nunca') AS valor
FROM user_credits uc
WHERE uc.user_id = '978e9e29-11b0-405d-bf68-b20622016aad'

UNION ALL

SELECT 
    'Wallet Vinculada en user_wallets',
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_wallets uw WHERE uw.user_id = '978e9e29-11b0-405d-bf68-b20622016aad')
        THEN (SELECT uw.wallet_address FROM user_wallets uw WHERE uw.user_id = '978e9e29-11b0-405d-bf68-b20622016aad' LIMIT 1)
        ELSE '❌ NO VINCULADA'
    END AS valor

UNION ALL

SELECT 
    'Wallet Buscada Existe',
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_wallets uw WHERE LOWER(uw.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd'))
        THEN '✅ SÍ EXISTE'
        ELSE '❌ NO EXISTE en user_wallets'
    END AS valor

UNION ALL

SELECT 
    'Desafíos Creados (últimos 7 días)',
    COUNT(*)::TEXT AS valor
FROM social_challenges sc
WHERE sc.challenger_id = '978e9e29-11b0-405d-bf68-b20622016aad'
    AND sc.created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
    'Desafíos Pendientes',
    COUNT(*)::TEXT AS valor
FROM social_challenges sc
WHERE sc.challenger_id = '978e9e29-11b0-405d-bf68-b20622016aad'
    AND sc.status = 'pending';
