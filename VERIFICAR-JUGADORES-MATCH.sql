-- ==========================================
-- VERIFICAR QUIÉN ES CADA JUGADOR EN EL MATCH
-- ==========================================

-- Ver información completa de ambos jugadores
SELECT 
    'Player 1' AS jugador,
    m.player1_id AS user_id,
    u1.wallet_address,
    u1.email AS email_player1,
    uc1.credits AS saldo_actual,
    u1.total_matches,
    u1.total_wins,
    u1.total_losses,
    u1.total_credits_won,
    -- Buscar si este usuario tiene email "homefix.creador@gmail.com"
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = m.player1_id 
            AND email = 'homefix.creador@gmail.com'
        ) THEN '✅ ES HOMEFIX APP'
        ELSE '❌ NO ES HOMEFIX APP'
    END AS es_homefix
FROM matches m
LEFT JOIN users u1 ON m.player1_id = u1.id
LEFT JOIN user_credits uc1 ON u1.id = uc1.user_id
WHERE m.id = '22a4b46d-f403-4c8b-a881-e6b31f2dbc0b'

UNION ALL

SELECT 
    'Player 2' AS jugador,
    m.player2_id AS user_id,
    u2.wallet_address,
    u2.email AS email_player2,
    uc2.credits AS saldo_actual,
    u2.total_matches,
    u2.total_wins,
    u2.total_losses,
    u2.total_credits_won,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = m.player2_id 
            AND email = 'homefix.creador@gmail.com'
        ) THEN '✅ ES HOMEFIX APP'
        ELSE '❌ NO ES HOMEFIX APP'
    END AS es_homefix
FROM matches m
LEFT JOIN users u2 ON m.player2_id = u2.id
LEFT JOIN user_credits uc2 ON u2.id = uc2.user_id
WHERE m.id = '22a4b46d-f403-4c8b-a881-e6b31f2dbc0b';

-- ==========================================
-- Ver todos los matches de HOMEFIX APP para entender las 3 victorias
-- ==========================================
SELECT 
    m.id AS match_id,
    m.created_at,
    m.finished_at,
    m.status,
    m.match_type,
    m.total_pot,
    m.winner,
    CASE 
        WHEN m.winner = 1 AND m.player1_id = (
            SELECT id FROM auth.users WHERE email = 'homefix.creador@gmail.com' LIMIT 1
        ) THEN '✅ GANÓ'
        WHEN m.winner = 2 AND m.player2_id = (
            SELECT id FROM auth.users WHERE email = 'homefix.creador@gmail.com' LIMIT 1
        ) THEN '✅ GANÓ'
        WHEN m.winner IS NOT NULL THEN '❌ PERDIÓ'
        ELSE '⚠️ SIN FINALIZAR'
    END AS resultado,
    mw.credits_won AS premio_recibido
FROM matches m
LEFT JOIN match_wins mw ON m.id = mw.match_id AND mw.user_id = (
    SELECT id FROM auth.users WHERE email = 'homefix.creador@gmail.com' LIMIT 1
)
WHERE (
    m.player1_id = (SELECT id FROM auth.users WHERE email = 'homefix.creador@gmail.com' LIMIT 1)
    OR m.player2_id = (SELECT id FROM auth.users WHERE email = 'homefix.creador@gmail.com' LIMIT 1)
)
ORDER BY m.created_at DESC
LIMIT 10;
