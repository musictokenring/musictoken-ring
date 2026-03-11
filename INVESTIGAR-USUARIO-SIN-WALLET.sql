-- ============================================
-- INVESTIGAR: Usuario con créditos pero SIN wallet vinculada
-- User ID: 52053c46-f6da-4861-9143-fd76d3e8e5d9
-- ============================================

-- 1. Verificar si el usuario existe en auth.users
SELECT 
    'Usuario en auth.users' AS seccion,
    u.id::TEXT AS user_id,
    u.email,
    u.created_at::TEXT AS fecha_registro,
    u.raw_user_meta_data->>'provider' AS metodo_registro
FROM auth.users u
WHERE u.id = '52053c46-f6da-4861-9143-fd76d3e8e5d9';

-- 2. Verificar créditos del usuario
SELECT 
    'Créditos del usuario' AS seccion,
    uc.user_id::TEXT AS user_id,
    uc.credits AS creditos,
    uc.updated_at::TEXT AS ultima_actualizacion
FROM user_credits uc
WHERE uc.user_id = '52053c46-f6da-4861-9143-fd76d3e8e5d9';

-- 3. Verificar si tiene depósitos
SELECT 
    'Depósitos del usuario' AS seccion,
    d.id::TEXT AS deposito_id,
    d.tx_hash AS transaccion,
    d.token AS tipo_token,
    d.amount AS monto,
    d.credits_awarded AS creditos_otorgados,
    d.created_at::TEXT AS fecha_deposito
FROM deposits d
WHERE d.user_id = '52053c46-f6da-4861-9143-fd76d3e8e5d9'
ORDER BY d.created_at DESC;

-- 4. Verificar si existe en tabla users (legacy)
SELECT 
    'Usuario en tabla users (legacy)' AS seccion,
    u.id::TEXT AS user_id,
    u.wallet_address AS wallet,
    u.created_at::TEXT AS fecha_creacion
FROM users u
WHERE u.id = '52053c46-f6da-4861-9143-fd76d3e8e5d9';

-- 5. Verificar wallets vinculadas en user_wallets
SELECT 
    'Wallets en user_wallets' AS seccion,
    uw.wallet_address AS wallet,
    uw.user_id::TEXT AS user_id,
    uw.is_primary AS es_principal,
    uw.linked_via AS metodo_vinculacion,
    uw.created_at::TEXT AS vinculada_en
FROM user_wallets uw
WHERE uw.user_id = '52053c46-f6da-4861-9143-fd76d3e8e5d9';

-- 6. Buscar si hay alguna wallet relacionada en depósitos o transacciones
SELECT 
    'Posible wallet del usuario (de depósitos)' AS seccion,
    d.tx_hash AS transaccion,
    'Revisar tx_hash para extraer wallet del remitente' AS nota
FROM deposits d
WHERE d.user_id = '52053c46-f6da-4861-9143-fd76d3e8e5d9'
LIMIT 1;
