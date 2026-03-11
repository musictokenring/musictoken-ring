-- ============================================
-- DIAGNÓSTICO ESPECÍFICO: Usuario con problemas
-- Wallet: 0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd
-- User ID conocido: 978e9e29-11b0-405d-bf68-b20622016aad
-- ============================================

-- ============================================
-- QUERY 1: Verificar usuario directamente por User ID
-- ============================================
SELECT 
    '=== INFORMACIÓN DEL USUARIO ===' AS seccion,
    u.id::TEXT AS detalle,
    u.email AS valor
FROM auth.users u
WHERE u.id = '978e9e29-11b0-405d-bf68-b20622016aad';

-- ============================================
-- QUERY 2: Verificar créditos del usuario directamente
-- ============================================
SELECT 
    '=== CRÉDITOS DEL USUARIO ===' AS seccion,
    uc.user_id::TEXT AS detalle,
    uc.credits::TEXT AS valor,
    uc.updated_at::TEXT AS ultima_actualizacion
FROM user_credits uc
WHERE uc.user_id = '978e9e29-11b0-405d-bf68-b20622016aad';

-- ============================================
-- QUERY 3: Verificar si la wallet está vinculada en user_wallets
-- ============================================
SELECT 
    '=== WALLET EN user_wallets ===' AS seccion,
    uw.wallet_address AS detalle,
    uw.user_id::TEXT AS valor,
    uw.is_primary::TEXT AS es_principal,
    uw.linked_via AS metodo_vinculacion,
    uw.created_at::TEXT AS vinculada_en
FROM user_wallets uw
WHERE LOWER(uw.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd');

-- ============================================
-- QUERY 4: Verificar si hay usuario en tabla users (legacy)
-- ============================================
SELECT 
    '=== USUARIO EN tabla users (legacy) ===' AS seccion,
    u.id::TEXT AS detalle,
    u.wallet_address AS valor,
    u.created_at::TEXT AS creado_en
FROM users u
WHERE LOWER(u.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd');

-- ============================================
-- QUERY 5: Verificar todos los desafíos sociales creados por este usuario
-- ============================================
SELECT 
    '=== DESAFÍOS SOCIALES CREADOS ===' AS seccion,
    sc.challenge_id AS detalle,
    sc.bet_amount::TEXT AS valor,
    sc.status AS estado,
    sc.created_at::TEXT AS fecha_creacion
FROM social_challenges sc
WHERE sc.challenger_id = '978e9e29-11b0-405d-bf68-b20622016aad'
ORDER BY sc.created_at DESC
LIMIT 10;

-- ============================================
-- QUERY 6: Verificar depósitos del usuario
-- ============================================
SELECT 
    '=== DEPÓSITOS RECIBIDOS ===' AS seccion,
    d.tx_hash AS detalle,
    d.credits_awarded::TEXT AS valor,
    d.token AS tipo_token,
    d.created_at::TEXT AS fecha_deposito
FROM deposits d
WHERE d.user_id = '978e9e29-11b0-405d-bf68-b20622016aad'
ORDER BY d.created_at DESC
LIMIT 10;

-- ============================================
-- QUERY 7: DIAGNÓSTICO COMPLETO - Todo en uno
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

-- ============================================
-- QUERY 8: Verificar si el problema es que la wallet NO está vinculada
-- ============================================
-- Si este query devuelve resultados, significa que la wallet NO está vinculada al usuario
-- Esto explicaría por qué el backend rechaza la deducción

SELECT 
    '⚠️ PROBLEMA DETECTADO: Wallet NO vinculada' AS problema,
    'La wallet 0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd NO está en user_wallets vinculada al usuario 978e9e29-11b0-405d-bf68-b20622016aad' AS descripcion,
    'SOLUCIÓN: Vincular la wallet al usuario usando POST /api/user/link-wallet' AS solucion
WHERE NOT EXISTS (
    SELECT 1 
    FROM user_wallets uw 
    WHERE uw.user_id = '978e9e29-11b0-405d-bf68-b20622016aad'
    AND LOWER(uw.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd')
);

-- ============================================
-- QUERY 9: Verificar balance real vs balance esperado
-- ============================================
SELECT 
    'Balance Real en DB' AS metrica,
    uc.credits::TEXT AS valor,
    'Este es el balance que el backend ve' AS descripcion
FROM user_credits uc
WHERE uc.user_id = '978e9e29-11b0-405d-bf68-b20622016aad'

UNION ALL

SELECT 
    'Balance Esperado (Frontend muestra 5.04)',
    '5.04' AS valor,
    'Este es el balance que muestra el frontend' AS descripcion

UNION ALL

SELECT 
    'Diferencia',
    (5.04 - COALESCE((SELECT uc.credits FROM user_credits uc WHERE uc.user_id = '978e9e29-11b0-405d-bf68-b20622016aad'), 0))::TEXT AS valor,
    'Si hay diferencia, hay desincronización' AS descripcion;

-- ============================================
-- QUERY 10: Verificar últimos desafíos y su estado de deducción
-- ============================================
SELECT 
    sc.id AS challenge_id,
    sc.challenge_id AS challenge_uuid,
    sc.bet_amount AS apuesta,
    sc.status AS estado,
    sc.created_at AS fecha_creacion,
    uc.credits AS creditos_actuales,
    uc.updated_at AS creditos_actualizados_en,
    CASE 
        WHEN uc.credits >= sc.bet_amount THEN '✅ Tiene suficientes créditos'
        ELSE '❌ NO tiene suficientes créditos'
    END AS puede_apostar,
    CASE 
        WHEN uc.updated_at BETWEEN sc.created_at - INTERVAL '2 minutes' AND sc.created_at + INTERVAL '2 minutes' 
        THEN '✅ Balance actualizado cerca de creación (deducción probablemente exitosa)'
        WHEN uc.updated_at IS NULL
        THEN '❌ Balance nunca actualizado (deducción probablemente falló)'
        ELSE '⚠️ Balance actualizado fuera del rango esperado'
    END AS estado_deduccion
FROM social_challenges sc
LEFT JOIN user_credits uc ON uc.user_id = sc.challenger_id
WHERE sc.challenger_id = '978e9e29-11b0-405d-bf68-b20622016aad'
ORDER BY sc.created_at DESC
LIMIT 10;

-- ============================================
-- INSTRUCCIONES DE USO
-- ============================================
-- 
-- 1. Ejecuta QUERY 7 primero para ver el diagnóstico completo
-- 2. Si "Wallet Vinculada" muestra "❌ NO VINCULADA", ese es el problema
-- 3. Ejecuta QUERY 9 para ver si hay desincronización de balance
-- 4. Ejecuta QUERY 10 para ver el estado de los últimos desafíos
--
-- PROBLEMA PROBABLE:
-- - La wallet NO está vinculada en user_wallets
-- - El backend no puede encontrar el userId desde la wallet
-- - Por eso rechaza la deducción con "Insufficient credits"
--
-- SOLUCIÓN:
-- - Vincular la wallet al usuario usando el endpoint POST /api/user/link-wallet
-- - O crear la vinculación manualmente en Supabase
--
-- ============================================
