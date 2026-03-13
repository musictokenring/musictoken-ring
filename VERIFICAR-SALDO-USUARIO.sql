-- Script para verificar el saldo de un usuario específico
-- Reemplaza 'USER_EMAIL_AQUI' con el email del usuario que quieres verificar
-- O reemplaza 'USER_ID_AQUI' con el ID del usuario

-- Opción 1: Buscar por email
SELECT 
    u.id as user_id,
    u.email,
    u.wallet_address,
    uc.credits as saldo_user_credits,
    ub.balance as saldo_user_balances,
    u.total_matches,
    u.total_wins,
    u.total_losses,
    u.total_credits_won,
    u.total_wagered
FROM public.users u
LEFT JOIN public.user_credits uc ON uc.user_id = u.id
LEFT JOIN public.user_balances ub ON ub.user_id = u.id
WHERE u.email = 'USER_EMAIL_AQUI'  -- CAMBIAR AQUÍ
   OR u.id::text = 'USER_ID_AQUI';  -- O CAMBIAR AQUÍ

-- Opción 2: Buscar por wallet address
SELECT 
    u.id as user_id,
    u.email,
    u.wallet_address,
    uc.credits as saldo_user_credits,
    ub.balance as saldo_user_balances,
    u.total_matches,
    u.total_wins,
    u.total_losses,
    u.total_credits_won,
    u.total_wagered
FROM public.users u
LEFT JOIN public.user_credits uc ON uc.user_id = u.id
LEFT JOIN public.user_balances ub ON ub.user_id = u.id
WHERE LOWER(u.wallet_address) = LOWER('WALLET_ADDRESS_AQUI');  -- CAMBIAR AQUÍ

-- Opción 3: Ver todos los usuarios con sus saldos
SELECT 
    u.id as user_id,
    u.email,
    u.wallet_address,
    uc.credits as saldo_user_credits,
    ub.balance as saldo_user_balances,
    u.total_matches,
    u.total_wins,
    u.total_losses,
    u.total_credits_won,
    u.total_wagered,
    u.created_at
FROM public.users u
LEFT JOIN public.user_credits uc ON uc.user_id = u.id
LEFT JOIN public.user_balances ub ON ub.user_id = u.id
ORDER BY uc.credits DESC NULLS LAST
LIMIT 20;

-- Opción 4: Verificar si hay usuarios con créditos pero sin registro en user_credits
SELECT 
    u.id as user_id,
    u.email,
    u.wallet_address,
    ub.balance as saldo_user_balances,
    CASE WHEN uc.user_id IS NULL THEN '❌ NO TIENE REGISTRO EN user_credits' ELSE '✅ TIENE REGISTRO' END as estado_user_credits,
    uc.credits as saldo_user_credits
FROM public.users u
LEFT JOIN public.user_credits uc ON uc.user_id = u.id
LEFT JOIN public.user_balances ub ON ub.user_id = u.id
WHERE ub.balance > 0 AND uc.user_id IS NULL;
