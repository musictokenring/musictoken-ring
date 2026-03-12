-- ==========================================
-- BUSCAR EL MATCH CORRECTO: Match social con pot 10 en estado 'playing'
-- ==========================================

-- Buscar todos los matches sociales con total_pot = 10
SELECT 
    m.id AS match_id,
    m.created_at,
    m.finished_at,
    m.status,
    m.total_pot,
    m.winner,
    m.player1_id,
    u1.wallet_address AS player1_wallet,
    uc1.credits AS saldo_player1,
    m.player2_id,
    u2.wallet_address AS player2_wallet,
    uc2.credits AS saldo_player2,
    mw.user_id AS usuario_que_recibio_premio,
    u3.wallet_address AS wallet_que_recibio_premio,
    mw.credits_won AS premio_recibido,
    u1.total_wins AS victorias_player1,
    u1.total_losses AS derrotas_player1,
    u2.total_wins AS victorias_player2,
    u2.total_losses AS derrotas_player2
FROM matches m
LEFT JOIN users u1 ON m.player1_id = u1.id
LEFT JOIN users u2 ON m.player2_id = u2.id
LEFT JOIN match_wins mw ON m.id = mw.match_id
LEFT JOIN users u3 ON mw.user_id = u3.id
LEFT JOIN user_credits uc1 ON m.player1_id = uc1.user_id
LEFT JOIN user_credits uc2 ON m.player2_id = uc2.user_id
WHERE m.match_type = 'social'
    AND m.total_pot = 10
ORDER BY m.created_at DESC
LIMIT 10;

-- ==========================================
-- ALTERNATIVA: Buscar matches en estado 'playing' sin finalizar
-- ==========================================
SELECT 
    m.id AS match_id,
    m.created_at,
    m.status,
    m.total_pot,
    m.winner,
    m.player1_id,
    u1.wallet_address AS player1_wallet,
    m.player2_id,
    u2.wallet_address AS player2_wallet,
    CASE 
        WHEN m.status = 'playing' AND m.winner IS NULL THEN '⚠️ MATCH SIN FINALIZAR'
        WHEN m.status = 'finished' AND m.winner IS NULL THEN '⚠️ FINALIZADO SIN GANADOR'
        ELSE '✅ OK'
    END AS estado_match
FROM matches m
LEFT JOIN users u1 ON m.player1_id = u1.id
LEFT JOIN users u2 ON m.player2_id = u2.id
WHERE m.match_type = 'social'
    AND m.total_pot > 0
    AND (m.status = 'playing' OR (m.status = 'finished' AND m.winner IS NULL))
ORDER BY m.created_at DESC
LIMIT 10;
