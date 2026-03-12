-- ==========================================
-- BUSCAR POR SALDO: Encontrar usuario con saldo sospechoso
-- Si el perdedor tiene ~1060 MTR y debería tener ~1050 MTR (sin el premio)
-- ==========================================

-- Buscar usuarios con saldos que incluyan premios recientes
SELECT 
    u.id AS user_id,
    u.wallet_address,
    uc.credits AS saldo_actual,
    u.total_matches,
    u.total_wins,
    u.total_losses,
    u.total_credits_won,
    -- Buscar premios recientes de este usuario
    (
        SELECT SUM(mw.credits_won)
        FROM match_wins mw
        JOIN matches m ON mw.match_id = m.id
        WHERE mw.user_id = u.id
            AND m.finished_at >= NOW() - INTERVAL '7 days'
    ) AS premios_ultimos_7_dias,
    -- Último match donde recibió premio
    (
        SELECT m.id
        FROM match_wins mw
        JOIN matches m ON mw.match_id = m.id
        WHERE mw.user_id = u.id
        ORDER BY m.finished_at DESC
        LIMIT 1
    ) AS ultimo_match_con_premio
FROM users u
LEFT JOIN user_credits uc ON u.id = uc.user_id
WHERE uc.credits > 1000  -- Usuarios con saldo alto (ajusta según necesites)
    AND u.total_wins = 0  -- Pero sin victorias registradas (sospechoso)
ORDER BY uc.credits DESC
LIMIT 10;

-- ==========================================
-- Ver detalles del último match de un usuario específico
-- Reemplaza 'USER_ID_AQUI' con el user_id encontrado arriba
-- ==========================================
/*
SELECT 
    m.id AS match_id,
    m.finished_at,
    m.total_pot,
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
WHERE mw.user_id = 'USER_ID_AQUI'
ORDER BY m.finished_at DESC
LIMIT 5;
*/
