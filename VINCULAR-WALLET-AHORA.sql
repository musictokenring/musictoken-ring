-- ============================================
-- SOLUCIÓN INMEDIATA: Vincular Wallet al Usuario
-- Ejecuta este query en Supabase SQL Editor
-- ============================================

-- PASO 1: Verificar estado actual
SELECT 
    'Verificando wallet...' AS paso,
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_wallets uw WHERE LOWER(uw.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd'))
        THEN '⚠️ Wallet existe pero vinculada a otro usuario'
        ELSE '✅ Wallet no existe, se creará nueva vinculación'
    END AS estado;

-- PASO 2: VINCULAR LA WALLET AL USUARIO
-- IMPORTANTE: Solo ejecutar si la wallet NO está vinculada al usuario correcto
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

-- PASO 3: Verificar que la vinculación fue exitosa
SELECT 
    '✅ Verificación de vinculación' AS paso,
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

-- PASO 4: Verificar créditos después de vincular
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
