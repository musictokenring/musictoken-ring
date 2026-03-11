-- ============================================
-- AUDITORÍA DE SALDOS AL INICIAR BATALLAS
-- Verificación de saldos reales en Supabase
-- ============================================

-- ============================================
-- 1. VERIFICAR SALDOS ACTUALES DE USUARIOS
-- ============================================

-- Ver todos los usuarios con sus créditos actuales
SELECT 
    u.id AS user_id,
    u.email,
    u.created_at AS usuario_creado,
    uc.credits AS creditos_actuales,
    uc.updated_at AS ultima_actualizacion_creditos,
    CASE 
        WHEN uc.credits >= 5 THEN '✅ Suficiente para batalla mínima (5 créditos)'
        WHEN uc.credits > 0 THEN '⚠️ Insuficiente para batalla mínima'
        ELSE '❌ Sin créditos'
    END AS estado_saldo
FROM auth.users u
LEFT JOIN user_credits uc ON uc.user_id = u.id
ORDER BY uc.credits DESC NULLS LAST;

-- ============================================
-- 2. VERIFICAR USUARIO ESPECÍFICO POR EMAIL O WALLET
-- ============================================

-- Por email
SELECT 
    u.id AS user_id,
    u.email,
    uc.credits AS creditos_actuales,
    uc.updated_at AS ultima_actualizacion,
    wl.wallet_address,
    wl.network,
    wl.created_at AS wallet_vinculada_en
FROM auth.users u
LEFT JOIN user_credits uc ON uc.user_id = u.id
LEFT JOIN wallet_links wl ON wl.user_id = u.id
WHERE u.email = 'homefix.creador@gmail.com'; -- CAMBIAR POR EL EMAIL A VERIFICAR

-- Por wallet address
SELECT 
    u.id AS user_id,
    u.email,
    uc.credits AS creditos_actuales,
    uc.updated_at AS ultima_actualizacion,
    uw.wallet_address,
    uw.is_primary AS es_wallet_principal,
    uw.linked_via AS metodo_vinculacion,
    uw.created_at AS wallet_vinculada_en,
    uw.last_used_at AS ultimo_uso
FROM user_wallets uw
LEFT JOIN auth.users u ON u.id = uw.user_id
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE LOWER(uw.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd'); -- CAMBIAR POR LA WALLET A VERIFICAR

-- ============================================
-- 3. VERIFICAR HISTORIAL DE CRÉDITOS DE USUARIOS
-- ============================================
-- NOTA: El sistema usa funciones RPC (decrement_user_credits/increment_user_credits)
-- que actualizan directamente user_credits sin tabla de transacciones separada.
-- Para auditoría, verificamos user_credits y desafíos sociales creados.

-- Ver usuarios con sus créditos actuales y última actualización
SELECT 
    u.id AS user_id,
    u.email,
    uc.credits AS creditos_actuales,
    uc.updated_at AS ultima_actualizacion,
    -- Contar desafíos sociales creados recientemente
    (SELECT COUNT(*) 
     FROM social_challenges sc 
     WHERE sc.challenger_id = u.id 
     AND sc.created_at >= NOW() - INTERVAL '7 days') AS desafios_creados_7dias,
    -- Último desafío creado
    (SELECT MAX(sc.created_at) 
     FROM social_challenges sc 
     WHERE sc.challenger_id = u.id) AS ultimo_desafio_creado
FROM auth.users u
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE uc.credits IS NOT NULL
ORDER BY uc.updated_at DESC
LIMIT 50;

-- ============================================
-- 4. VERIFICAR DESAFÍOS SOCIALES CREADOS Y SUS DEDUCCIONES
-- ============================================

-- Ver desafíos sociales creados y verificar balance del usuario
-- NOTA: El sistema usa funciones RPC que actualizan user_credits directamente
-- Para verificar deducciones, comparamos el bet_amount con cambios en user_credits
SELECT 
    sc.id AS challenge_id,
    sc.challenge_id AS challenge_uuid,
    sc.challenger_id,
    u.email AS challenger_email,
    sc.bet_amount AS apuesta,
    sc.status AS estado_desafio,
    sc.created_at AS fecha_creacion,
    -- Balance actual del usuario
    uc.credits AS creditos_actuales,
    uc.updated_at AS creditos_actualizados_en,
    -- Verificar si el usuario tenía suficientes créditos al momento de crear el desafío
    CASE 
        WHEN uc.credits >= sc.bet_amount THEN '✅ Usuario tiene suficientes créditos ahora'
        WHEN uc.credits > 0 THEN '⚠️ Usuario tiene créditos pero insuficientes'
        ELSE '❌ Usuario sin créditos'
    END AS estado_saldo_actual,
    -- Calcular si el balance fue actualizado cerca del momento de creación del desafío
    CASE 
        WHEN uc.updated_at BETWEEN sc.created_at - INTERVAL '2 minutes' AND sc.created_at + INTERVAL '2 minutes' 
        THEN '✅ Balance actualizado cerca del momento de creación'
        ELSE '⚠️ Balance NO actualizado cerca del momento de creación'
    END AS sincronizacion_balance
FROM social_challenges sc
LEFT JOIN auth.users u ON u.id = sc.challenger_id
LEFT JOIN user_credits uc ON uc.user_id = sc.challenger_id
WHERE sc.created_at >= NOW() - INTERVAL '7 days' -- Últimos 7 días
ORDER BY sc.created_at DESC;

-- ============================================
-- 5. VERIFICAR DISCREPANCIAS: DESAFÍOS SIN DEDUCCIÓN
-- ============================================

-- Encontrar desafíos sociales donde el balance NO fue actualizado cerca del momento de creación
-- Esto puede indicar que la deducción de créditos falló
SELECT 
    sc.id AS challenge_id,
    sc.challenge_id AS challenge_uuid,
    sc.challenger_id,
    u.email AS challenger_email,
    sc.bet_amount AS apuesta,
    sc.status AS estado_desafio,
    sc.created_at AS fecha_creacion,
    uc.credits AS creditos_actuales_usuario,
    uc.updated_at AS creditos_actualizados_en,
    -- Calcular diferencia de tiempo entre creación del desafío y actualización de créditos
    EXTRACT(EPOCH FROM (uc.updated_at - sc.created_at)) / 60 AS minutos_diferencia,
    CASE 
        WHEN uc.credits >= sc.bet_amount THEN '✅ Usuario tiene suficientes créditos ahora'
        ELSE '❌ Usuario NO tiene suficientes créditos'
    END AS estado_saldo_actual,
    CASE 
        WHEN uc.updated_at BETWEEN sc.created_at - INTERVAL '2 minutes' AND sc.created_at + INTERVAL '2 minutes' 
        THEN '✅ Balance actualizado cerca del momento de creación (deducción probablemente exitosa)'
        WHEN uc.updated_at < sc.created_at - INTERVAL '2 minutes'
        THEN '⚠️ Balance actualizado ANTES de crear desafío (deducción puede haber fallado)'
        WHEN uc.updated_at > sc.created_at + INTERVAL '2 minutes'
        THEN '⚠️ Balance actualizado DESPUÉS de crear desafío (deducción puede haber sido tardía)'
        WHEN uc.updated_at IS NULL
        THEN '❌ Balance nunca actualizado'
        ELSE '⚠️ Diferencia de tiempo significativa'
    END AS estado_deduccion_probable
FROM social_challenges sc
LEFT JOIN auth.users u ON u.id = sc.challenger_id
LEFT JOIN user_credits uc ON uc.user_id = sc.challenger_id
WHERE sc.created_at >= NOW() - INTERVAL '7 days' -- Últimos 7 días
    AND sc.status = 'pending' -- Solo desafíos pendientes
    AND (
        -- Balance NO actualizado cerca del momento de creación
        uc.updated_at IS NULL 
        OR uc.updated_at NOT BETWEEN sc.created_at - INTERVAL '2 minutes' AND sc.created_at + INTERVAL '2 minutes'
    )
ORDER BY sc.created_at DESC;

-- ============================================
-- 6. VERIFICAR HISTORIAL DE BALANCE DE UN USUARIO ESPECÍFICO
-- ============================================

-- Ver historial de desafíos sociales y depósitos de un usuario
-- NOTA: El sistema no tiene tabla de transacciones, pero podemos ver:
-- 1. Desafíos sociales creados (indican deducciones)
-- 2. Depósitos recibidos (indican acreditaciones)
-- 3. Cambios en user_credits.updated_at (indican actualizaciones)
SELECT 
    'Desafío Social' AS tipo_operacion,
    sc.id AS operacion_id,
    sc.created_at AS fecha,
    -sc.bet_amount AS cambio_creditos,
    '➖ Deducción (Apuesta)' AS tipo,
    sc.bet_amount AS monto_absoluto,
    sc.challenge_id AS referencia,
    uc.credits AS creditos_actuales,
    uc.updated_at AS creditos_actualizados_en
FROM social_challenges sc
LEFT JOIN user_credits uc ON uc.user_id = sc.challenger_id
WHERE sc.challenger_id = '978e9e29-11b0-405d-bf68-b20622016aad' -- CAMBIAR POR EL USER_ID A VERIFICAR

UNION ALL

SELECT 
    'Depósito' AS tipo_operacion,
    d.id AS operacion_id,
    d.created_at AS fecha,
    d.credits_awarded AS cambio_creditos,
    '➕ Acreditación (Depósito)' AS tipo,
    d.credits_awarded AS monto_absoluto,
    d.tx_hash AS referencia,
    NULL AS creditos_actuales,
    NULL AS creditos_actualizados_en
FROM deposits d
WHERE d.user_id = '978e9e29-11b0-405d-bf68-b20622016aad' -- CAMBIAR POR EL USER_ID A VERIFICAR

ORDER BY fecha DESC
LIMIT 50;

-- ============================================
-- 7. VERIFICAR INTENTOS FALLIDOS DE DEDUCCIÓN
-- ============================================

-- Buscar patrones de errores en logs o transacciones fallidas
-- (Nota: Esto requiere que tengas una tabla de logs o transacciones fallidas)

-- Si tienes una tabla de logs de errores:
-- SELECT 
--     log_id,
--     user_id,
--     error_message,
--     credits_intentados,
--     created_at
-- FROM error_logs
-- WHERE error_message LIKE '%Insufficient credits%'
--     OR error_message LIKE '%insufficient%'
-- ORDER BY created_at DESC;

-- ============================================
-- 8. VERIFICAR SALDOS MÍNIMOS PARA BATALLAS
-- ============================================

-- Usuarios que tienen suficiente para batalla mínima (5 créditos)
SELECT 
    u.id AS user_id,
    u.email,
    uc.credits AS creditos_actuales,
    CASE 
        WHEN uc.credits >= 5 THEN '✅ Puede iniciar batalla'
        WHEN uc.credits > 0 THEN '⚠️ Insuficiente (mínimo 5)'
        ELSE '❌ Sin créditos'
    END AS puede_batallar,
    uc.updated_at AS ultima_actualizacion
FROM auth.users u
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE uc.credits IS NOT NULL
ORDER BY uc.credits DESC;

-- ============================================
-- 9. VERIFICAR DESAFÍOS SOCIALES RECIENTES CON PROBLEMAS
-- ============================================

-- Desafíos creados en las últimas 24 horas con posibles problemas
SELECT 
    sc.id,
    sc.challenge_id,
    sc.challenger_id,
    u.email,
    sc.bet_amount,
    sc.status,
    sc.created_at AS fecha_creacion,
    uc.credits AS creditos_actuales_challenger,
    uc.updated_at AS creditos_actualizados_en,
    -- Verificar si el usuario tenía suficientes créditos al momento de crear el desafío
    CASE 
        WHEN uc.credits >= sc.bet_amount THEN '✅ Tiene suficientes créditos ahora'
        ELSE '❌ NO tiene suficientes créditos ahora'
    END AS estado_saldo_actual,
    -- Verificar si el balance fue actualizado cerca del momento de creación
    CASE 
        WHEN uc.updated_at BETWEEN sc.created_at - INTERVAL '2 minutes' AND sc.created_at + INTERVAL '2 minutes' 
        THEN '✅ Balance actualizado cerca de creación (deducción probablemente exitosa)'
        WHEN uc.updated_at IS NULL
        THEN '❌ Balance nunca actualizado (deducción probablemente falló)'
        ELSE '⚠️ Balance actualizado fuera del rango esperado'
    END AS estado_deduccion_probable,
    -- Calcular diferencia de tiempo
    EXTRACT(EPOCH FROM (uc.updated_at - sc.created_at)) / 60 AS minutos_diferencia
FROM social_challenges sc
LEFT JOIN auth.users u ON u.id = sc.challenger_id
LEFT JOIN user_credits uc ON uc.user_id = sc.challenger_id
WHERE sc.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY sc.created_at DESC;

-- ============================================
-- 10. VERIFICAR WALLETS VINCULADAS Y SUS SALDOS
-- ============================================

-- Ver todas las wallets vinculadas con sus usuarios y créditos
SELECT 
    uw.id AS wallet_id,
    uw.user_id,
    u.email,
    uw.wallet_address,
    uw.is_primary AS es_wallet_principal,
    uw.linked_via AS metodo_vinculacion,
    uc.credits AS creditos_actuales,
    uw.created_at AS wallet_vinculada_en,
    uw.last_used_at AS ultimo_uso,
    uc.updated_at AS creditos_actualizados_en
FROM user_wallets uw
LEFT JOIN auth.users u ON u.id = uw.user_id
LEFT JOIN user_credits uc ON uc.user_id = uw.user_id
WHERE LOWER(uw.wallet_address) = LOWER('0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd') -- CAMBIAR POR LA WALLET A VERIFICAR
ORDER BY uw.created_at DESC;

-- ============================================
-- 11. RESUMEN DE AUDITORÍA COMPLETA
-- ============================================

-- Resumen ejecutivo de saldos y transacciones
SELECT 
    'Total usuarios con créditos' AS metrica,
    COUNT(DISTINCT uc.user_id) AS valor
FROM user_credits uc
WHERE uc.credits > 0

UNION ALL

SELECT 
    'Total créditos en el sistema' AS metrica,
    SUM(uc.credits)::TEXT AS valor
FROM user_credits uc

UNION ALL

SELECT 
    'Usuarios con suficientes créditos para batalla (>=5)' AS metrica,
    COUNT(DISTINCT uc.user_id)::TEXT AS valor
FROM user_credits uc
WHERE uc.credits >= 5

UNION ALL

SELECT 
    'Desafíos sociales creados (últimos 7 días)' AS metrica,
    COUNT(*)::TEXT AS valor
FROM social_challenges sc
WHERE sc.created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
    'Desafíos sociales creados (últimos 7 días - indica deducciones)' AS metrica,
    COUNT(*)::TEXT AS valor
FROM social_challenges sc
WHERE sc.created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
    'Desafíos donde balance NO fue actualizado cerca de creación (últimos 7 días)' AS metrica,
    COUNT(*)::TEXT AS valor
FROM social_challenges sc
LEFT JOIN user_credits uc ON uc.user_id = sc.challenger_id
WHERE sc.created_at >= NOW() - INTERVAL '7 days'
    AND sc.status = 'pending'
    AND (
        uc.updated_at IS NULL 
        OR uc.updated_at NOT BETWEEN sc.created_at - INTERVAL '2 minutes' AND sc.created_at + INTERVAL '2 minutes'
    );

-- ============================================
-- 12. VERIFICAR USUARIO ESPECÍFICO COMPLETO
-- ============================================

-- Query completo para verificar un usuario específico (reemplazar USER_ID)
-- Ejecutar este query con el user_id del usuario que está teniendo problemas

WITH user_info AS (
    SELECT 
        u.id AS user_id,
        u.email,
        uc.credits AS creditos_actuales,
        uc.updated_at AS creditos_actualizados_en
    FROM auth.users u
    LEFT JOIN user_credits uc ON uc.user_id = u.id
    WHERE u.id = '978e9e29-11b0-405d-bf68-b20622016aad' -- CAMBIAR POR EL USER_ID
),
wallet_info AS (
    SELECT 
        uw.wallet_address,
        uw.is_primary AS es_wallet_principal,
        uw.linked_via AS metodo_vinculacion,
        uw.created_at AS wallet_vinculada_en,
        uw.last_used_at AS ultimo_uso
    FROM user_wallets uw
    WHERE uw.user_id = (SELECT user_id FROM user_info)
),
recent_challenges AS (
    SELECT 
        sc.id AS challenge_id,
        sc.challenge_id AS challenge_uuid,
        sc.bet_amount,
        sc.status,
        sc.created_at AS fecha_creacion
    FROM social_challenges sc
    WHERE sc.challenger_id = (SELECT user_id FROM user_info)
        AND sc.created_at >= NOW() - INTERVAL '7 days'
    ORDER BY sc.created_at DESC
    LIMIT 10
),
recent_challenges AS (
    SELECT 
        sc.id,
        sc.challenge_id AS challenge_uuid,
        -sc.bet_amount AS credits,
        'Desafío Social' AS reason,
        sc.created_at AS fecha,
        sc.status AS note
    FROM social_challenges sc
    WHERE sc.challenger_id = (SELECT user_id FROM user_info)
        AND sc.created_at >= NOW() - INTERVAL '7 days'
    ORDER BY sc.created_at DESC
    LIMIT 20
),
recent_deposits AS (
    SELECT 
        d.id,
        d.tx_hash AS challenge_uuid,
        d.credits_awarded AS credits,
        CONCAT('Depósito ', d.token) AS reason,
        d.created_at AS fecha,
        d.status AS note
    FROM deposits d
    WHERE d.user_id = (SELECT user_id FROM user_info)
        AND d.created_at >= NOW() - INTERVAL '7 days'
    ORDER BY d.created_at DESC
    LIMIT 20
)
SELECT 
    '=== INFORMACIÓN DEL USUARIO ===' AS seccion,
    NULL AS detalle,
    NULL AS valor
UNION ALL
SELECT 
    'User ID' AS seccion,
    ui.user_id::TEXT AS detalle,
    NULL AS valor
FROM user_info ui
UNION ALL
SELECT 
    'Email' AS seccion,
    ui.email AS detalle,
    NULL AS valor
FROM user_info ui
UNION ALL
SELECT 
    'Créditos Actuales' AS seccion,
    ui.creditos_actuales::TEXT AS detalle,
    CASE 
        WHEN ui.creditos_actuales >= 5 THEN '✅ Suficiente'
        ELSE '❌ Insuficiente'
    END AS valor
FROM user_info ui
UNION ALL
SELECT 
    'Última Actualización' AS seccion,
    ui.creditos_actualizados_en::TEXT AS detalle,
    NULL AS valor
FROM user_info ui
UNION ALL
SELECT 
    '=== WALLET VINCULADA ===' AS seccion,
    NULL AS detalle,
    NULL AS valor
UNION ALL
SELECT 
    'Wallet Address' AS seccion,
    wi.wallet_address AS detalle,
    NULL AS valor
FROM wallet_info wi
UNION ALL
SELECT 
    'Network' AS seccion,
    wi.network AS detalle,
    NULL AS valor
FROM wallet_info wi
UNION ALL
SELECT 
    '=== DESAFÍOS RECIENTES ===' AS seccion,
    NULL AS detalle,
    NULL AS valor
UNION ALL
SELECT 
    'Challenge ID' AS seccion,
    rc.challenge_uuid AS detalle,
    CONCAT('Apuesta: ', rc.bet_amount, ' | Estado: ', rc.status) AS valor
FROM recent_challenges rc
UNION ALL
SELECT 
    '=== DESAFÍOS SOCIALES RECIENTES ===' AS seccion,
    NULL AS detalle,
    NULL AS valor
UNION ALL
SELECT 
    'Fecha' AS seccion,
    rc.fecha::TEXT AS detalle,
    CONCAT('Créditos: ', rc.credits, ' | Razón: ', rc.reason, ' | Estado: ', rc.note) AS valor
FROM recent_challenges rc
UNION ALL
SELECT 
    '=== DEPÓSITOS RECIENTES ===' AS seccion,
    NULL AS detalle,
    NULL AS valor
UNION ALL
SELECT 
    'Fecha' AS seccion,
    rd.fecha::TEXT AS detalle,
    CONCAT('Créditos: +', rd.credits, ' | Razón: ', rd.reason, ' | Estado: ', rd.note) AS valor
FROM recent_deposits rd;

-- ============================================
-- INSTRUCCIONES DE USO
-- ============================================
-- 
-- 1. Ejecutar estos queries en Supabase SQL Editor
-- 2. Reemplazar los valores de ejemplo (emails, wallet addresses, user_ids) con los valores reales
-- 3. Verificar especialmente:
--    - Query #2: Verificar usuario específico por email o wallet
--    - Query #4: Verificar desafíos sociales y sus deducciones
--    - Query #5: Encontrar desafíos sin deducción (problemas)
--    - Query #12: Verificación completa de un usuario específico
--
-- 4. Comparar los resultados con lo que muestra el frontend
-- 5. Identificar discrepancias entre frontend y backend
--
-- ============================================
