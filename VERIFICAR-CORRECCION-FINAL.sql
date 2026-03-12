-- ==========================================
-- VERIFICACIÓN FINAL DE LA CORRECCIÓN
-- Confirmar que todo está correcto después de la corrección
-- ==========================================

-- 1. Verificar el match corregido
SELECT 
    m.id AS match_id,
    m.status,
    m.winner,
    m.total_pot,
    m.finished_at,
    CASE 
        WHEN m.winner = 1 THEN m.player1_id
        WHEN m.winner = 2 THEN m.player2_id
    END AS usuario_ganador_esperado,
    mw.user_id AS usuario_con_premio,
    u.wallet_address AS wallet_ganador,
    mw.credits_won AS premio_otorgado,
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
WHERE m.id = '22a4b46d-f403-4c8b-a881-e6b31f2dbc0b';

-- 2. Ver estadísticas de ambos jugadores después de la corrección
SELECT 
    'Player 1 (HOMEFIX APP)' AS jugador,
    u1.id AS user_id,
    u1.wallet_address,
    uc1.credits AS saldo_actual,
    u1.total_matches,
    u1.total_wins,
    u1.total_losses,
    u1.total_credits_won,
    CASE 
        WHEN u1.total_wins = 2 AND u1.total_losses = 1 THEN '✅ CORRECTO (2 victorias de antes, 1 derrota nueva)'
        WHEN u1.total_wins = 0 AND u1.total_losses = 1 THEN '✅ CORRECTO (sin victorias previas, 1 derrota)'
        ELSE '⚠️ REVISAR'
    END AS estado_stats
FROM matches m
LEFT JOIN users u1 ON m.player1_id = u1.id
LEFT JOIN user_credits uc1 ON u1.id = uc1.user_id
WHERE m.id = '22a4b46d-f403-4c8b-a881-e6b31f2dbc0b'

UNION ALL

SELECT 
    'Player 2 (GANADOR)' AS jugador,
    u2.id AS user_id,
    u2.wallet_address,
    uc2.credits AS saldo_actual,
    u2.total_matches,
    u2.total_wins,
    u2.total_losses,
    u2.total_credits_won,
    CASE 
        WHEN u2.total_wins >= 1 THEN '✅ CORRECTO (tiene victoria)'
        ELSE '⚠️ REVISAR'
    END AS estado_stats
FROM matches m
LEFT JOIN users u2 ON m.player2_id = u2.id
LEFT JOIN user_credits uc2 ON u2.id = uc2.user_id
WHERE m.id = '22a4b46d-f403-4c8b-a881-e6b31f2dbc0b';

-- 3. Ver todas las victorias de HOMEFIX APP después de la corrección
WITH homefix_user AS (
    SELECT id FROM auth.users WHERE email = 'homefix.creador@gmail.com' LIMIT 1
)
SELECT 
    m.id AS match_id,
    m.match_type,
    m.total_pot,
    m.winner,
    CASE 
        WHEN m.winner = 1 AND m.player1_id = (SELECT id FROM homefix_user) THEN '✅ GANÓ'
        WHEN m.winner = 2 AND m.player2_id = (SELECT id FROM homefix_user) THEN '✅ GANÓ'
        WHEN m.winner IS NOT NULL THEN '❌ PERDIÓ'
        ELSE '⚠️ SIN FINALIZAR'
    END AS resultado,
    mw.credits_won AS premio_recibido
FROM matches m
LEFT JOIN homefix_user hu ON TRUE
LEFT JOIN match_wins mw ON m.id = mw.match_id AND mw.user_id = hu.id
WHERE (m.player1_id = hu.id OR m.player2_id = hu.id)
    AND m.status = 'finished'
    AND m.match_type != 'practice'
ORDER BY m.finished_at DESC;
