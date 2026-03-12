-- ============================================
-- SOLUCIÓN SEGURA: Vincular Wallet al Usuario
-- Verifica primero qué usuario tiene la wallet y sus créditos
-- ============================================

-- PASO 1: Verificar qué usuario tiene actualmente la wallet en tabla users
SELECT 
    'Usuario Actual con esta Wallet' AS seccion,
    u.id::TEXT AS user_id_actual,
    u.wallet_address,
    u.created_at AS creado_en
FROM users u
WHERE LOWER(u.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd');

-- PASO 2: Verificar créditos del usuario actual
SELECT 
    'Créditos del Usuario Actual' AS seccion,
    uc.user_id::TEXT AS user_id,
    uc.credits AS creditos,
    uc.updated_at AS ultima_actualizacion
FROM user_credits uc
WHERE uc.user_id IN (
    SELECT u.id FROM users u 
    WHERE LOWER(u.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd')
);

-- PASO 3: Verificar créditos del usuario objetivo
SELECT 
    'Créditos del Usuario Objetivo' AS seccion,
    uc.user_id::TEXT AS user_id,
    uc.credits AS creditos,
    uc.updated_at AS ultima_actualizacion
FROM user_credits uc
WHERE uc.user_id = '978e9e29-11b0-405d-bf68-b20622016aad'::UUID;

-- PASO 4: Asegurar que el usuario existe en tabla "users"
-- Si la wallet ya existe con otro ID, actualizamos el ID al objetivo
-- Si no existe, creamos el usuario con el ID objetivo
INSERT INTO users (
    id,
    wallet_address,
    created_at,
    updated_at
)
VALUES (
    '978e9e29-11b0-405d-bf68-b20622016aad'::UUID,
    LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd'),
    NOW(),
    NOW()
)
ON CONFLICT (wallet_address) 
DO UPDATE SET
    id = '978e9e29-11b0-405d-bf68-b20622016aad'::UUID,
    updated_at = NOW();

-- PASO 5: Vincular wallet en user_wallets
-- Ahora que el usuario existe en "users", podemos vincular sin problemas de foreign key
INSERT INTO user_wallets (
    user_id,
    wallet_address,
    is_primary,
    linked_via,
    created_at,
    updated_at
)
VALUES (
    '978e9e29-11b0-405d-bf68-b20622016aad'::UUID,
    LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd'),
    TRUE,
    'manual',
    NOW(),
    NOW()
)
ON CONFLICT (wallet_address) 
DO UPDATE SET
    user_id = '978e9e29-11b0-405d-bf68-b20622016aad'::UUID,
    is_primary = TRUE,
    linked_via = 'manual',
    updated_at = NOW();

-- PASO 6: Verificar vinculación exitosa
SELECT 
    '✅ Verificación Final' AS estado,
    uw.wallet_address,
    uw.user_id::TEXT AS usuario_vinculado,
    u.email,
    uw.is_primary AS es_principal,
    uw.linked_via AS metodo_vinculacion,
    uw.created_at AS vinculada_en
FROM user_wallets uw
LEFT JOIN auth.users u ON u.id = uw.user_id
WHERE LOWER(uw.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd');
