-- ==========================================
-- VER TODAS LAS PARTIDAS DE HOMEFIX APP
-- Para entender las 3 victorias que aparecen
-- ==========================================

WITH homefix_user AS (
    SELECT id FROM auth.users WHERE email = 'homefix.creador@gmail.com' LIMIT 1
)
SELECT 
    m.id AS match_id,
    m.created_at,
    m.finished_at,
    m.status,
    m.match_type,
    m.total_pot,
    m.winner,
    CASE 
        WHEN m.player1_id = (SELECT id FROM homefix_user) THEN 'Player 1'
        WHEN m.player2_id = (SELECT id FROM homefix_user) THEN 'Player 2'
    END AS posicion_homefix,
    CASE 
        WHEN m.winner = 1 AND m.player1_id = (SELECT id FROM homefix_user) THEN '✅ GANÓ'
        WHEN m.winner = 2 AND m.player2_id = (SELECT id FROM homefix_user) THEN '✅ GANÓ'
        WHEN m.winner IS NOT NULL THEN '❌ PERDIÓ'
        ELSE '⚠️ SIN FINALIZAR'
    END AS resultado_homefix,
    mw.credits_won AS premio_recibido,
    mw.created_at AS fecha_premio,
    -- Información del oponente
    CASE 
        WHEN m.player1_id = (SELECT id FROM homefix_user) THEN u2.wallet_address
        WHEN m.player2_id = (SELECT id FROM homefix_user) THEN u1.wallet_address
    END AS wallet_oponente
FROM matches m
LEFT JOIN homefix_user hu ON TRUE
LEFT JOIN users u1 ON m.player1_id = u1.id
LEFT JOIN users u2 ON m.player2_id = u2.id
LEFT JOIN match_wins mw ON m.id = mw.match_id AND mw.user_id = hu.id
WHERE m.player1_id = hu.id OR m.player2_id = hu.id
ORDER BY m.created_at DESC;
