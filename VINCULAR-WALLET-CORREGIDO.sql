-- ============================================
-- SOLUCIÓN CORREGIDA: Vincular Wallet al Usuario
-- El problema: user_wallets referencia tabla "users" pero el usuario está en "auth.users"
-- ============================================

-- PASO 1: Verificar si el usuario existe en tabla "users" (legacy)
SELECT 
    'Verificando usuario en tabla users (legacy)...' AS paso,
    u.id::TEXT AS user_id,
    u.wallet_address,
    u.created_at
FROM users u
WHERE u.id = '978e9e29-11b0-405d-bf68-b20622016aad'::UUID
   OR LOWER(u.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd');

-- PASO 2: Verificar si el usuario existe en auth.users
SELECT 
    'Verificando usuario en auth.users...' AS paso,
    u.id::TEXT AS user_id,
    u.email
FROM auth.users u
WHERE u.id = '978e9e29-11b0-405d-bf68-b20622016aad'::UUID;

-- PASO 3: Crear usuario en tabla "users" si no existe (para compatibilidad con foreign key)
-- IMPORTANTE: Solo ejecutar si el usuario NO existe en tabla "users"
INSERT INTO users (
    id,
    wallet_address,
    created_at,
    updated_at
)
SELECT 
    '978e9e29-11b0-405d-bf68-b20622016aad'::UUID,
    LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd'),
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = '978e9e29-11b0-405d-bf68-b20622016aad'::UUID
);

-- PASO 4: Ahora vincular la wallet en user_wallets
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

-- PASO 5: Verificar que la vinculación fue exitosa
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

-- PASO 6: Verificar créditos
SELECT 
    'Créditos del Usuario' AS seccion,
    uc.credits AS creditos_actuales,
    uc.updated_at AS ultima_actualizacion,
    CASE 
        WHEN uc.credits >= 5 THEN '✅ Puede crear batallas'
        ELSE '❌ Necesita más créditos (mínimo 5)'
    END AS puede_batallar
FROM user_credits uc
WHERE uc.user_id = '978e9e29-11b0-405d-bf68-b20622016aad'::UUID;
