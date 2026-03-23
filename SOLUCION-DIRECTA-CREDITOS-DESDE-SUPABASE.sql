-- ==========================================
-- SOLUCIÓN DIRECTA: Leer créditos desde Supabase
-- ==========================================
-- Si el backend no está devolviendo los créditos correctos,
-- podemos hacer que el frontend lea directamente desde Supabase

-- Primero, verificar qué userId tiene los créditos
SELECT 
    u.id as user_id,
    u.wallet_address,
    COALESCE(uc.credits, 0) as credits,
    uc.updated_at
FROM users u
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.wallet_address = '0x0000000000000000000000000000000000000001'
   OR u.id = '0940db31-9a51-403b-bfcc-cc66c383eb91';

-- Verificar RLS policies en user_credits que puedan estar bloqueando
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'user_credits';
