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
    wl.wallet_address,
    wl.network,
    wl.created_at AS wallet_vinculada_en
FROM wallet_links wl
LEFT JOIN auth.users u ON u.id = wl.user_id
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE wl.wallet_address = '0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd'; -- CAMBIAR POR LA WALLET A VERIFICAR

-- ============================================
-- 3. VERIFICAR TRANSACCIONES DE DEDUCCIÓN DE CRÉDITOS
-- ============================================

-- Ver todas las deducciones de créditos relacionadas con batallas
SELECT 
    ct.id,
    ct.user_id,
    u.email,
    ct.credits AS creditos_descontados,
    ct.reason,
    ct.match_id,
    ct.created_at AS fecha_deduccion,
    -- Obtener balance ANTES de la deducción (si hay registro)
    LAG(ct.credits, 1) OVER (PARTITION BY ct.user_id ORDER BY ct.created_at) AS creditos_anteriores,
    -- Obtener balance DESPUÉS de la deducción
    uc.credits AS creditos_actuales,
    CASE 
        WHEN ct.reason LIKE '%bet%' OR ct.reason LIKE '%match%' OR ct.reason LIKE '%challenge%' THEN 'Batalla/Apuesta'
        ELSE 'Otro'
    END AS tipo_transaccion
FROM credit_transactions ct
LEFT JOIN auth.users u ON u.id = ct.user_id
LEFT JOIN user_credits uc ON uc.user_id = ct.user_id
WHERE ct.credits < 0 -- Solo deducciones
    AND ct.created_at >= NOW() - INTERVAL '7 days' -- Últimos 7 días
ORDER BY ct.created_at DESC;

-- ============================================
-- 4. VERIFICAR DESAFÍOS SOCIALES CREADOS Y SUS DEDUCCIONES
-- ============================================

-- Ver desafíos sociales creados y verificar si se descontaron créditos
SELECT 
    sc.id AS challenge_id,
    sc.challenge_id AS challenge_uuid,
    sc.challenger_id,
    u.email AS challenger_email,
    sc.bet_amount AS apuesta,
    sc.status AS estado_desafio,
    sc.created_at AS fecha_creacion,
    -- Verificar si hay deducción de créditos para este desafío
    ct.id AS transaccion_id,
    ct.credits AS creditos_descontados,
    ct.created_at AS fecha_deduccion,
    -- Balance actual del usuario
    uc.credits AS creditos_actuales,
    CASE 
        WHEN ct.id IS NULL THEN '❌ NO se descontaron créditos'
        WHEN ABS(ct.credits) != sc.bet_amount THEN '⚠️ Monto descontado diferente a la apuesta'
        ELSE '✅ Créditos descontados correctamente'
    END AS estado_deduccion
FROM social_challenges sc
LEFT JOIN auth.users u ON u.id = sc.challenger_id
LEFT JOIN user_credits uc ON uc.user_id = sc.challenger_id
LEFT JOIN credit_transactions ct ON ct.user_id = sc.challenger_id 
    AND ct.reason LIKE '%match_bet%' 
    AND ct.created_at BETWEEN sc.created_at - INTERVAL '1 minute' AND sc.created_at + INTERVAL '1 minute'
WHERE sc.created_at >= NOW() - INTERVAL '7 days' -- Últimos 7 días
ORDER BY sc.created_at DESC;

-- ============================================
-- 5. VERIFICAR DISCREPANCIAS: DESAFÍOS SIN DEDUCCIÓN
-- ============================================

-- Encontrar desafíos sociales que NO tienen deducción de créditos asociada
SELECT 
    sc.id AS challenge_id,
    sc.challenge_id AS challenge_uuid,
    sc.challenger_id,
    u.email AS challenger_email,
    sc.bet_amount AS apuesta,
    sc.status AS estado_desafio,
    sc.created_at AS fecha_creacion,
    uc.credits AS creditos_actuales_usuario,
    CASE 
        WHEN uc.credits >= sc.bet_amount THEN '✅ Usuario tiene suficientes créditos ahora'
        ELSE '❌ Usuario NO tiene suficientes créditos'
    END AS estado_saldo_actual
FROM social_challenges sc
LEFT JOIN auth.users u ON u.id = sc.challenger_id
LEFT JOIN user_credits uc ON uc.user_id = sc.challenger_id
WHERE sc.created_at >= NOW() - INTERVAL '7 days' -- Últimos 7 días
    AND sc.status = 'pending' -- Solo desafíos pendientes
    AND NOT EXISTS (
        SELECT 1 
        FROM credit_transactions ct 
        WHERE ct.user_id = sc.challenger_id 
            AND ct.credits < 0 
            AND ABS(ct.credits) = sc.bet_amount
            AND ct.created_at BETWEEN sc.created_at - INTERVAL '1 minute' AND sc.created_at + INTERVAL '1 minute'
    )
ORDER BY sc.created_at DESC;

-- ============================================
-- 6. VERIFICAR HISTORIAL DE BALANCE DE UN USUARIO ESPECÍFICO
-- ============================================

-- Ver historial completo de transacciones de créditos de un usuario
SELECT 
    ct.id,
    ct.created_at AS fecha,
    ct.credits AS cambio_creditos,
    CASE 
        WHEN ct.credits > 0 THEN '➕ Acreditación'
        WHEN ct.credits < 0 THEN '➖ Deducción'
        ELSE '⚪ Sin cambio'
    END AS tipo,
    ABS(ct.credits) AS monto_absoluto,
    ct.reason AS razon,
    ct.match_id,
    ct.note AS nota,
    -- Calcular balance acumulado (simulado)
    SUM(ct.credits) OVER (PARTITION BY ct.user_id ORDER BY ct.created_at) AS balance_acumulado
FROM credit_transactions ct
WHERE ct.user_id = '978e9e29-11b0-405d-bf68-b20622016aad' -- CAMBIAR POR EL USER_ID A VERIFICAR
ORDER BY ct.created_at DESC
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
    sc.created_at,
    uc.credits AS creditos_actuales_challenger,
    -- Verificar si el usuario tenía suficientes créditos al momento de crear el desafío
    CASE 
        WHEN uc.credits >= sc.bet_amount THEN '✅ Tiene suficientes créditos ahora'
        ELSE '❌ NO tiene suficientes créditos ahora'
    END AS estado_saldo_actual,
    -- Contar transacciones de deducción alrededor del momento de creación
    COUNT(ct.id) AS transacciones_deduccion_encontradas
FROM social_challenges sc
LEFT JOIN auth.users u ON u.id = sc.challenger_id
LEFT JOIN user_credits uc ON uc.user_id = sc.challenger_id
LEFT JOIN credit_transactions ct ON ct.user_id = sc.challenger_id 
    AND ct.credits < 0 
    AND ct.created_at BETWEEN sc.created_at - INTERVAL '2 minutes' AND sc.created_at + INTERVAL '2 minutes'
WHERE sc.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY sc.id, sc.challenge_id, sc.challenger_id, u.email, sc.bet_amount, sc.status, sc.created_at, uc.credits
ORDER BY sc.created_at DESC;

-- ============================================
-- 10. VERIFICAR WALLETS VINCULADAS Y SUS SALDOS
-- ============================================

-- Ver todas las wallets vinculadas con sus usuarios y créditos
SELECT 
    wl.id AS wallet_link_id,
    wl.user_id,
    u.email,
    wl.wallet_address,
    wl.network,
    uc.credits AS creditos_actuales,
    wl.created_at AS wallet_vinculada_en,
    uc.updated_at AS creditos_actualizados_en
FROM wallet_links wl
LEFT JOIN auth.users u ON u.id = wl.user_id
LEFT JOIN user_credits uc ON uc.user_id = wl.user_id
WHERE wl.wallet_address = '0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd' -- CAMBIAR POR LA WALLET A VERIFICAR
ORDER BY wl.created_at DESC;

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
    'Deducciones de créditos (últimos 7 días)' AS metrica,
    COUNT(*)::TEXT AS valor
FROM credit_transactions ct
WHERE ct.credits < 0 
    AND ct.created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
    'Desafíos sin deducción asociada (últimos 7 días)' AS metrica,
    COUNT(*)::TEXT AS valor
FROM social_challenges sc
WHERE sc.created_at >= NOW() - INTERVAL '7 days'
    AND NOT EXISTS (
        SELECT 1 
        FROM credit_transactions ct 
        WHERE ct.user_id = sc.challenger_id 
            AND ct.credits < 0 
            AND ABS(ct.credits) = sc.bet_amount
            AND ct.created_at BETWEEN sc.created_at - INTERVAL '1 minute' AND sc.created_at + INTERVAL '1 minute'
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
        wl.wallet_address,
        wl.network,
        wl.created_at AS wallet_vinculada_en
    FROM wallet_links wl
    WHERE wl.user_id = (SELECT user_id FROM user_info)
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
recent_transactions AS (
    SELECT 
        ct.id,
        ct.credits,
        ct.reason,
        ct.created_at AS fecha,
        ct.note
    FROM credit_transactions ct
    WHERE ct.user_id = (SELECT user_id FROM user_info)
        AND ct.created_at >= NOW() - INTERVAL '7 days'
    ORDER BY ct.created_at DESC
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
    '=== TRANSACCIONES RECIENTES ===' AS seccion,
    NULL AS detalle,
    NULL AS valor
UNION ALL
SELECT 
    'Fecha' AS seccion,
    rt.fecha::TEXT AS detalle,
    CONCAT('Créditos: ', rt.credits, ' | Razón: ', rt.reason) AS valor
FROM recent_transactions rt;

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
