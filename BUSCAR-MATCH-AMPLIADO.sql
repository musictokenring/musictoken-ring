-- ==========================================
-- BÚSQUEDA AMPLIADA: Buscar match problemático sin restricciones de tiempo
-- ==========================================

-- OPCIÓN 1: Buscar TODOS los matches sociales finalizados (sin límite de tiempo)
SELECT 
    m.id AS match_id,
    m.finished_at AS fecha_finalizacion,
    m.match_type,
    m.total_pot,
    (m.total_pot * 0.98) AS premio_esperado,
    m.winner AS ganador_del_match,
    m.player1_id,
    u1.wallet_address AS player1_wallet,
    m.player2_id,
    u2.wallet_address AS player2_wallet,
    mw.user_id AS usuario_que_recibio_premio,
    u3.wallet_address AS wallet_que_recibio_premio,
    mw.credits_won AS premio_recibido,
    CASE 
        WHEN m.winner = 1 THEN m.player1_id
        WHEN m.winner = 2 THEN m.player2_id
        ELSE NULL
    END AS usuario_que_deberia_recibir,
    CASE 
        WHEN mw.user_id IS NULL THEN '⚠️ SIN PREMIO REGISTRADO'
        WHEN mw.user_id != CASE 
            WHEN m.winner = 1 THEN m.player1_id
            WHEN m.winner = 2 THEN m.player2_id
            ELSE NULL
        END THEN '❌ ERROR: Premio al perdedor'
        ELSE '✅ CORRECTO'
    END AS estado_premio,
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
    AND m.match_type = 'social'
    AND m.total_pot > 0
ORDER BY m.finished_at DESC
LIMIT 10;

-- ==========================================
-- OPCIÓN 2: Buscar por wallet específica (si conoces la wallet del perdedor)
-- Reemplaza 'WALLET_AQUI' con la wallet del usuario que recibió el premio incorrectamente
-- ==========================================
/*
SELECT 
    m.id AS match_id,
    m.finished_at AS fecha_finalizacion,
    m.total_pot,
    (m.total_pot * 0.98) AS premio_esperado,
    m.winner,
    m.player1_id,
    u1.wallet_address AS player1_wallet,
    m.player2_id,
    u2.wallet_address AS player2_wallet,
    mw.user_id AS usuario_que_recibio_premio,
    u3.wallet_address AS wallet_que_recibio_premio,
    mw.credits_won AS premio_recibido,
    CASE 
        WHEN m.winner = 1 THEN m.player1_id
        WHEN m.winner = 2 THEN m.player2_id
    END AS usuario_que_deberia_recibir,
    CASE 
        WHEN mw.user_id != CASE 
            WHEN m.winner = 1 THEN m.player1_id
            WHEN m.winner = 2 THEN m.player2_id
        END THEN '❌ ERROR'
        ELSE '✅ CORRECTO'
    END AS estado
FROM matches m
LEFT JOIN users u1 ON m.player1_id = u1.id
LEFT JOIN users u2 ON m.player2_id = u2.id
LEFT JOIN match_wins mw ON m.id = mw.match_id
LEFT JOIN users u3 ON mw.user_id = u3.id
WHERE m.status = 'finished'
    AND m.match_type = 'social'
    AND (u3.wallet_address ILIKE '%WALLET_AQUI%' OR u1.wallet_address ILIKE '%WALLET_AQUI%' OR u2.wallet_address ILIKE '%WALLET_AQUI%')
ORDER BY m.finished_at DESC;
*/

-- ==========================================
-- OPCIÓN 3: Buscar matches donde hay premio pero las estadísticas no coinciden
-- ==========================================
SELECT 
    m.id AS match_id,
    m.finished_at,
    m.total_pot,
    mw.user_id AS usuario_con_premio,
    u.wallet_address AS wallet_con_premio,
    u.total_wins AS victorias_en_stats,
    u.total_losses AS derrotas_en_stats,
    u.total_credits_won AS creditos_ganados_en_stats,
    mw.credits_won AS premio_en_match_wins,
    CASE 
        WHEN u.total_wins = 0 AND mw.credits_won > 0 THEN '⚠️ Usuario tiene premio pero 0 victorias'
        ELSE 'OK'
    END AS observacion
FROM matches m
JOIN match_wins mw ON m.id = mw.match_id
JOIN users u ON mw.user_id = u.id
WHERE m.status = 'finished'
    AND m.match_type = 'social'
    AND m.finished_at >= NOW() - INTERVAL '7 days' -- Últimos 7 días
ORDER BY m.finished_at DESC
LIMIT 10;

-- ==========================================
-- OPCIÓN 4: Ver TODOS los matches sociales recientes (sin filtros)
-- ==========================================
SELECT 
    m.id,
    m.finished_at,
    m.status,
    m.match_type,
    m.total_pot,
    m.winner,
    m.player1_id,
    m.player2_id,
    CASE WHEN mw.id IS NOT NULL THEN 'SÍ' ELSE 'NO' END AS tiene_premio_registrado,
    mw.user_id AS usuario_con_premio,
    mw.credits_won
FROM matches m
LEFT JOIN match_wins mw ON m.id = mw.match_id
WHERE m.match_type = 'social'
ORDER BY m.created_at DESC
LIMIT 20;
