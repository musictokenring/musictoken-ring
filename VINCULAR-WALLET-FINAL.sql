-- ============================================
-- SOLUCIÓN FINAL: Vincular Wallet al Usuario
-- Maneja el caso donde la wallet ya existe en tabla users
-- ============================================

-- PASO 1: Verificar estado actual
SELECT 
    'Estado Actual' AS seccion,
    CASE 
        WHEN EXISTS (SELECT 1 FROM users u WHERE LOWER(u.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd'))
        THEN '⚠️ Wallet ya existe en tabla users'
        ELSE '✅ Wallet no existe en tabla users'
    END AS estado_users,
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_wallets uw WHERE LOWER(uw.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd'))
        THEN '⚠️ Wallet ya existe en user_wallets'
        ELSE '✅ Wallet no existe en user_wallets'
    END AS estado_user_wallets;

-- PASO 2: Actualizar o crear usuario en tabla "users"
-- Si la wallet ya existe, actualizar el ID del usuario
-- Si no existe, crear nuevo registro
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

-- PASO 3: Vincular la wallet en user_wallets
-- Si ya existe, actualizar el user_id
-- Si no existe, crear nueva vinculación
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

-- PASO 4: Verificar que la vinculación fue exitosa
SELECT 
    '✅ Verificación Final' AS estado,
    uw.wallet_address,
    uw.user_id::TEXT AS usuario_vinculado,
    u.email,
    uw.is_primary AS es_principal,
    uw.linked_via AS metodo_vinculacion,
    uw.created_at AS vinculada_en,
    CASE 
        WHEN uw.user_id = '978e9e29-11b0-405d-bf68-b20622016aad'::UUID THEN '✅ Vinculada correctamente'
        ELSE '❌ Error en vinculación'
    END AS estado_vinculacion
FROM user_wallets uw
LEFT JOIN auth.users u ON u.id = uw.user_id
WHERE LOWER(uw.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd');

-- PASO 5: Verificar créditos del usuario
SELECT 
    'Créditos del Usuario' AS seccion,
    COALESCE(uc.credits, 0) AS creditos_actuales,
    uc.updated_at AS ultima_actualizacion,
    CASE 
        WHEN COALESCE(uc.credits, 0) >= 5 THEN '✅ Puede crear batallas'
        ELSE '❌ Necesita más créditos (mínimo 5)'
    END AS puede_batallar
FROM user_credits uc
WHERE uc.user_id = '978e9e29-11b0-405d-bf68-b20622016aad'::UUID;
