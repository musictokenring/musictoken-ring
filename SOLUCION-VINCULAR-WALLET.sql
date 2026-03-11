-- ============================================
-- SOLUCIÓN: Vincular Wallet al Usuario
-- Wallet: 0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd
-- User ID: 978e9e29-11b0-405d-bf68-b20622016aad
-- ============================================

-- ============================================
-- PASO 1: Verificar que el usuario existe
-- ============================================
SELECT 
    'Verificando usuario...' AS paso,
    u.id::TEXT AS user_id,
    u.email,
    '✅ Usuario existe' AS estado
FROM auth.users u
WHERE u.id = '978e9e29-11b0-405d-bf68-b20622016aad';

-- ============================================
-- PASO 2: Verificar créditos actuales
-- ============================================
SELECT 
    'Verificando créditos...' AS paso,
    COALESCE(uc.credits, 0) AS creditos_actuales,
    uc.updated_at AS ultima_actualizacion,
    CASE 
        WHEN uc.credits >= 5 THEN '✅ Suficiente para batalla'
        WHEN uc.credits > 0 THEN '⚠️ Insuficiente'
        ELSE '❌ Sin créditos'
    END AS estado
FROM user_credits uc
WHERE uc.user_id = '978e9e29-11b0-405d-bf68-b20622016aad';

-- ============================================
-- PASO 3: Verificar si la wallet ya existe en user_wallets (con otro usuario)
-- ============================================
SELECT 
    'Verificando si wallet existe...' AS paso,
    uw.wallet_address,
    uw.user_id::TEXT AS usuario_vinculado,
    uw.is_primary,
    uw.created_at AS vinculada_en,
    CASE 
        WHEN uw.user_id = '978e9e29-11b0-405d-bf68-b20622016aad' THEN '✅ Ya está vinculada al usuario correcto'
        WHEN uw.user_id IS NOT NULL THEN '⚠️ Está vinculada a OTRO usuario'
        ELSE '❌ No existe en user_wallets'
    END AS estado
FROM user_wallets uw
WHERE LOWER(uw.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd');

-- ============================================
-- PASO 4: VINCULAR LA WALLET AL USUARIO
-- ============================================
-- IMPORTANTE: Solo ejecutar si la wallet NO está vinculada o está vinculada a otro usuario
-- Si está vinculada al usuario correcto, NO ejecutar este paso

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
    TRUE, -- Marcar como wallet principal
    'manual', -- Vinculación manual desde SQL
    NOW(),
    NOW()
)
ON CONFLICT (wallet_address) 
DO UPDATE SET
    user_id = '978e9e29-11b0-405d-bf68-b20622016aad'::UUID,
    is_primary = TRUE,
    linked_via = 'manual',
    updated_at = NOW();

-- ============================================
-- PASO 5: Verificar que la vinculación fue exitosa
-- ============================================
SELECT 
    'Verificando vinculación...' AS paso,
    uw.wallet_address,
    uw.user_id::TEXT AS usuario_vinculado,
    u.email,
    uw.is_primary AS es_principal,
    uw.linked_via AS metodo_vinculacion,
    uw.created_at AS vinculada_en,
    '✅ Wallet vinculada correctamente' AS estado
FROM user_wallets uw
LEFT JOIN auth.users u ON u.id = uw.user_id
WHERE LOWER(uw.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd');

-- ============================================
-- PASO 6: Verificar créditos después de vincular
-- ============================================
SELECT 
    'Resumen Final' AS seccion,
    u.email AS usuario,
    uw.wallet_address AS wallet,
    uc.credits AS creditos,
    CASE 
        WHEN uc.credits >= 5 THEN '✅ Puede crear batallas'
        ELSE '❌ Necesita más créditos (mínimo 5)'
    END AS puede_batallar
FROM user_wallets uw
LEFT JOIN auth.users u ON u.id = uw.user_id
LEFT JOIN user_credits uc ON uc.user_id = uw.user_id
WHERE LOWER(uw.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd');

-- ============================================
-- INSTRUCCIONES DE USO
-- ============================================
-- 
-- 1. Ejecuta PASO 1, 2 y 3 primero para verificar el estado actual
-- 2. Si PASO 3 muestra "❌ No existe en user_wallets" o "⚠️ Está vinculada a OTRO usuario":
--    → Ejecuta PASO 4 para vincular la wallet
-- 3. Si PASO 3 muestra "✅ Ya está vinculada al usuario correcto":
--    → NO ejecutes PASO 4, el problema es otro
-- 4. Ejecuta PASO 5 y 6 para verificar que todo está correcto
--
-- IMPORTANTE:
-- - Si la wallet está vinculada a otro usuario, el PASO 4 la moverá al usuario correcto
-- - Después de vincular, el backend debería poder encontrar el userId desde la wallet
-- - Esto debería resolver el error "Insufficient credits"
--
-- ============================================
