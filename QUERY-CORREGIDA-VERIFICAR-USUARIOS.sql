-- ============================================================================
-- QUERY CORREGIDA: Verificar usuarios existentes (SIN columna email)
-- Ejecuta esto en Supabase SQL Editor
-- ============================================================================

-- 1. Verificar usuarios existentes y sus wallets
SELECT 
    u.id,
    u.wallet_address,
    u.created_at as user_created_at,
    uc.credits,
    CASE 
        WHEN uw.id IS NOT NULL THEN '✅ Vinculado en user_wallets'
        ELSE '⚠️ Solo en users (compatible)'
    END as wallet_status
FROM users u
LEFT JOIN user_credits uc ON u.id = uc.user_id
LEFT JOIN user_wallets uw ON LOWER(u.wallet_address) = LOWER(uw.wallet_address)
ORDER BY u.created_at DESC
LIMIT 20;

-- 2. Contar usuarios existentes vs usuarios con wallet link
SELECT 
    COUNT(DISTINCT u.id) as total_usuarios,
    COUNT(DISTINCT CASE WHEN uw.id IS NOT NULL THEN u.id END) as usuarios_con_wallet_link,
    COUNT(DISTINCT CASE WHEN uw.id IS NULL THEN u.id END) as usuarios_sin_wallet_link
FROM users u
LEFT JOIN user_wallets uw ON LOWER(u.wallet_address) = LOWER(uw.wallet_address);

-- 3. Verificar que usuarios existentes tienen wallet_address válida
SELECT 
    COUNT(*) as usuarios_con_wallet_valida,
    COUNT(CASE WHEN wallet_address IS NULL OR wallet_address = '' THEN 1 END) as usuarios_sin_wallet
FROM users;

-- 4. Verificar usuarios que podrían tener problemas (no debería haber ninguno)
SELECT 
    u.id,
    u.wallet_address,
    u.created_at,
    'Usuario sin wallet_address - podría tener problemas' as problema
FROM users u
WHERE u.wallet_address IS NULL OR u.wallet_address = '';
