-- ==========================================
-- VERIFICAR CORRECCIÓN DEL MATCH
-- Ejecuta esto para confirmar que todo se corrigió correctamente
-- ==========================================

SELECT 
    m.id AS match_id,
    m.status,
    m.winner,
    m.total_pot,
    m.finished_at,
    CASE 
        WHEN m.winner = 1 THEN m.player1_id
        WHEN m.winner = 2 THEN m.player2_id
        ELSE NULL
    END AS usuario_ganador_esperado,
    mw.user_id AS usuario_con_premio,
    u.wallet_address AS wallet_ganador,
    mw.credits_won AS premio_otorgado,
    uc.credits AS saldo_actual_ganador,
    u.total_matches AS partidas_ganador,
    u.total_wins AS victorias_ganador,
    u.total_losses AS derrotas_ganador,
    u.total_credits_won AS creditos_ganados_ganador,
    CASE 
        WHEN mw.user_id = CASE 
            WHEN m.winner = 1 THEN m.player1_id
            WHEN m.winner = 2 THEN m.player2_id
        END THEN '✅ CORRECTO'
        ELSE '❌ ERROR'
    END AS estado_premio
FROM matches m
LEFT JOIN match_wins mw ON m.id = mw.match_id
LEFT JOIN users u ON mw.user_id = u.id
LEFT JOIN user_credits uc ON u.id = uc.user_id
WHERE m.id = '22a4b46d-f403-4c8b-a881-e6b31f2dbc0b';

-- ==========================================
-- Ver estadísticas de ambos jugadores
-- ==========================================
SELECT 
    'Player 1' AS jugador,
    u1.id AS user_id,
    u1.wallet_address,
    uc1.credits AS saldo,
    u1.total_matches,
    u1.total_wins,
    u1.total_losses,
    u1.total_credits_won
FROM matches m
LEFT JOIN users u1 ON m.player1_id = u1.id
LEFT JOIN user_credits uc1 ON u1.id = uc1.user_id
WHERE m.id = '22a4b46d-f403-4c8b-a881-e6b31f2dbc0b'

UNION ALL

SELECT 
    'Player 2' AS jugador,
    u2.id AS user_id,
    u2.wallet_address,
    uc2.credits AS saldo,
    u2.total_matches,
    u2.total_wins,
    u2.total_losses,
    u2.total_credits_won
FROM matches m
LEFT JOIN users u2 ON m.player2_id = u2.id
LEFT JOIN user_credits uc2 ON u2.id = uc2.user_id
WHERE m.id = '22a4b46d-f403-4c8b-a881-e6b31f2dbc0b';
