-- ==========================================
-- VERIFICAR TODOS LOS MATCHES FINALIZADOS DE AMBOS JUGADORES
-- Versión corregida sin errores de sintaxis
-- ==========================================

-- Player 1 (HOMEFIX APP) - Matches donde es Player 1
SELECT 
    'Player 1 (HOMEFIX APP)' AS jugador,
    m.id AS match_id,
    m.created_at,
    m.finished_at,
    m.match_type,
    m.status,
    m.total_pot,
    m.winner,
    CASE 
        WHEN m.winner = 1 THEN '✅ GANÓ'
        WHEN m.winner = 2 THEN '❌ PERDIÓ'
        ELSE '⚠️ SIN GANADOR'
    END AS resultado,
    mw.credits_won AS premio_recibido,
    mw.created_at AS fecha_premio
FROM matches m
LEFT JOIN match_wins mw ON m.id = mw.match_id AND mw.user_id = '978e9e29-11b0-405d-bf68-b20622016aad'
WHERE m.player1_id = '978e9e29-11b0-405d-bf68-b20622016aad'
    AND m.status = 'finished'
ORDER BY m.finished_at DESC;

-- Player 2 - Matches donde es Player 2
SELECT 
    'Player 2' AS jugador,
    m.id AS match_id,
    m.created_at,
    m.finished_at,
    m.match_type,
    m.status,
    m.total_pot,
    m.winner,
    CASE 
        WHEN m.winner = 1 THEN '❌ PERDIÓ'
        WHEN m.winner = 2 THEN '✅ GANÓ'
        ELSE '⚠️ SIN GANADOR'
    END AS resultado,
    mw.credits_won AS premio_recibido,
    mw.created_at AS fecha_premio
FROM matches m
LEFT JOIN match_wins mw ON m.id = mw.match_id AND mw.user_id = '0940db31-9a51-403b-bfcc-cc66c383eb91'
WHERE m.player2_id = '0940db31-9a51-403b-bfcc-cc66c383eb91'
    AND m.status = 'finished'
ORDER BY m.finished_at DESC;

-- ==========================================
-- Comparar estadísticas actuales vs reales
-- ==========================================
SELECT 
    'Player 1 (HOMEFIX APP)' AS jugador,
    u.total_matches AS partidas_en_stats,
    u.total_wins AS victorias_en_stats,
    u.total_losses AS derrotas_en_stats,
    u.total_credits_won AS creditos_en_stats,
    (SELECT COUNT(*) FROM matches WHERE player1_id = u.id AND status = 'finished') AS partidas_reales,
    (SELECT COUNT(*) FROM matches WHERE player1_id = u.id AND status = 'finished' AND winner = 1) AS victorias_reales,
    (SELECT COUNT(*) FROM matches WHERE player1_id = u.id AND status = 'finished' AND winner = 2) AS derrotas_reales,
    (SELECT COALESCE(SUM(mw.credits_won), 0) FROM match_wins mw WHERE mw.user_id = u.id) AS creditos_reales
FROM users u
WHERE u.id = '978e9e29-11b0-405d-bf68-b20622016aad';

SELECT 
    'Player 2' AS jugador,
    u.total_matches AS partidas_en_stats,
    u.total_wins AS victorias_en_stats,
    u.total_losses AS derrotas_en_stats,
    u.total_credits_won AS creditos_en_stats,
    (SELECT COUNT(*) FROM matches WHERE player2_id = u.id AND status = 'finished') AS partidas_reales,
    (SELECT COUNT(*) FROM matches WHERE player2_id = u.id AND status = 'finished' AND winner = 2) AS victorias_reales,
    (SELECT COUNT(*) FROM matches WHERE player2_id = u.id AND status = 'finished' AND winner = 1) AS derrotas_reales,
    (SELECT COALESCE(SUM(mw.credits_won), 0) FROM match_wins mw WHERE mw.user_id = u.id) AS creditos_reales
FROM users u
WHERE u.id = '0940db31-9a51-403b-bfcc-cc66c383eb91';
