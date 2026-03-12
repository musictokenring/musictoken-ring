-- ==========================================
-- BUSCAR MATCH PROBLEMÁTICO RECIENTE
-- Ejecuta este script primero para identificar el match con el premio incorrecto
-- ==========================================

-- Buscar matches sociales finalizados recientemente donde el premio fue dado incorrectamente
SELECT 
    m.id AS match_id,
    m.finished_at AS fecha_finalizacion,
    m.match_type,
    m.total_pot,
    (m.total_pot * 0.98) AS premio_esperado,
    m.winner AS ganador_del_match,
    -- Información del player 1
    m.player1_id,
    u1.wallet_address AS player1_wallet,
    -- Información del player 2
    m.player2_id,
    u2.wallet_address AS player2_wallet,
    -- Quién recibió el premio
    mw.user_id AS usuario_que_recibio_premio,
    u3.wallet_address AS wallet_que_recibio_premio,
    mw.credits_won AS premio_recibido,
    -- Quién debería haber recibido el premio
    CASE 
        WHEN m.winner = 1 THEN m.player1_id
        WHEN m.winner = 2 THEN m.player2_id
        ELSE NULL
    END AS usuario_que_deberia_recibir,
    CASE 
        WHEN m.winner = 1 THEN u1.wallet_address
        WHEN m.winner = 2 THEN u2.wallet_address
        ELSE NULL
    END AS wallet_que_deberia_recibir,
    -- Verificar si hay error
    CASE 
        WHEN mw.user_id IS NULL THEN '⚠️ SIN PREMIO REGISTRADO'
        WHEN mw.user_id != CASE 
            WHEN m.winner = 1 THEN m.player1_id
            WHEN m.winner = 2 THEN m.player2_id
            ELSE NULL
        END THEN '❌ ERROR: Premio al perdedor'
        ELSE '✅ CORRECTO'
    END AS estado_premio,
    -- Saldos actuales
    uc1.credits AS saldo_player1,
    uc2.credits AS saldo_player2
FROM matches m
LEFT JOIN users u1 ON m.player1_id = u1.id
LEFT JOIN users u2 ON m.player2_id = u2.id
LEFT JOIN match_wins mw ON m.id = mw.match_id
LEFT JOIN users u3 ON mw.user_id = u3.id
LEFT JOIN user_credits uc1 ON m.player1_id = uc1.user_id
LEFT JOIN user_credits uc2 ON m.player2_id = uc2.user_id
WHERE m.status = 'finished'
    AND m.finished_at >= NOW() - INTERVAL '48 hours' -- Últimas 48 horas
    AND m.match_type = 'social'
    AND m.total_pot > 0
ORDER BY m.finished_at DESC
LIMIT 5;

-- ==========================================
-- INSTRUCCIONES:
-- 1. Ejecuta este script primero
-- 2. Identifica el match con estado "❌ ERROR: Premio al perdedor"
-- 3. Copia los valores de:
--    - match_id
--    - usuario_que_deberia_recibir (ganador real)
--    - usuario_que_recibio_premio (perdedor que recibió incorrectamente)
--    - premio_esperado
-- 4. Usa esos valores en el script CORREGIR-PREMIO-INCORRECTO-AUTOMATICO.sql
-- ==========================================
