-- ==========================================
-- BUSCAR USUARIO HOMEFIX APP POR EMAIL
-- ==========================================

-- Buscar usuario por email en auth.users
SELECT 
    au.id AS auth_user_id,
    au.email,
    au.created_at AS auth_created_at,
    u.id AS public_user_id,
    u.wallet_address,
    u.created_at AS public_created_at,
    uc.credits AS saldo_actual,
    u.total_matches,
    u.total_wins,
    u.total_losses,
    u.total_credits_won
FROM auth.users au
LEFT JOIN users u ON au.id = u.id
LEFT JOIN user_credits uc ON u.id = uc.user_id
WHERE au.email = 'homefix.creador@gmail.com'
LIMIT 1;

-- ==========================================
-- Ver todos los matches donde participó este usuario
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
    END AS posicion_jugador,
    CASE 
        WHEN m.winner = 1 AND m.player1_id = (SELECT id FROM homefix_user) THEN '✅ GANÓ'
        WHEN m.winner = 2 AND m.player2_id = (SELECT id FROM homefix_user) THEN '✅ GANÓ'
        WHEN m.winner IS NOT NULL THEN '❌ PERDIÓ'
        ELSE '⚠️ SIN FINALIZAR'
    END AS resultado,
    mw.credits_won AS premio_recibido,
    mw.created_at AS fecha_premio
FROM matches m
LEFT JOIN homefix_user hu ON TRUE
LEFT JOIN match_wins mw ON m.id = mw.match_id AND mw.user_id = hu.id
WHERE m.player1_id = hu.id OR m.player2_id = hu.id
ORDER BY m.created_at DESC;
