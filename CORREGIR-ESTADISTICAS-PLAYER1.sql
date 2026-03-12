-- ==========================================
-- CORREGIR ESTADÍSTICAS DE PLAYER 1 (HOMEFIX APP)
-- Basado en los matches REALES finalizados
-- ==========================================

DO $$
DECLARE
    user_id_player1 UUID := '978e9e29-11b0-405d-bf68-b20622016aad'; -- HOMEFIX APP
    partidas_reales INTEGER;
    victorias_reales INTEGER;
    derrotas_reales INTEGER;
    creditos_reales DECIMAL;
BEGIN
    -- Calcular estadísticas REALES basadas en matches finalizados
    SELECT 
        COUNT(*) INTO partidas_reales
    FROM matches
    WHERE player1_id = user_id_player1
        AND status = 'finished';
    
    SELECT 
        COUNT(*) INTO victorias_reales
    FROM matches
    WHERE player1_id = user_id_player1
        AND status = 'finished'
        AND winner = 1;
    
    SELECT 
        COUNT(*) INTO derrotas_reales
    FROM matches
    WHERE player1_id = user_id_player1
        AND status = 'finished'
        AND winner = 2;
    
    SELECT 
        COALESCE(SUM(mw.credits_won), 0) INTO creditos_reales
    FROM match_wins mw
    WHERE mw.user_id = user_id_player1;
    
    RAISE NOTICE '📊 Estadísticas REALES de Player 1:';
    RAISE NOTICE '   Partidas: %', partidas_reales;
    RAISE NOTICE '   Victorias: %', victorias_reales;
    RAISE NOTICE '   Derrotas: %', derrotas_reales;
    RAISE NOTICE '   Créditos ganados: %', creditos_reales;
    
    -- Actualizar estadísticas en la tabla users con los valores REALES
    UPDATE users
    SET 
        total_matches = partidas_reales,
        total_wins = victorias_reales,
        total_losses = derrotas_reales,
        total_credits_won = creditos_reales,
        updated_at = NOW()
    WHERE id = user_id_player1;
    
    RAISE NOTICE '✅ Estadísticas de Player 1 corregidas';
    RAISE NOTICE '🎉 CORRECCIÓN COMPLETADA';
END $$;

-- ==========================================
-- Verificar corrección
-- ==========================================
SELECT 
    u.id,
    u.wallet_address,
    u.total_matches,
    u.total_wins,
    u.total_losses,
    u.total_credits_won,
    uc.credits AS saldo_actual,
    -- Comparar con estadísticas reales
    (SELECT COUNT(*) FROM matches WHERE player1_id = u.id AND status = 'finished') AS partidas_reales,
    (SELECT COUNT(*) FROM matches WHERE player1_id = u.id AND status = 'finished' AND winner = 1) AS victorias_reales,
    (SELECT COUNT(*) FROM matches WHERE player1_id = u.id AND status = 'finished' AND winner = 2) AS derrotas_reales,
    (SELECT COALESCE(SUM(mw.credits_won), 0) FROM match_wins mw WHERE mw.user_id = u.id) AS creditos_reales
FROM users u
LEFT JOIN user_credits uc ON u.id = uc.user_id
WHERE u.id = '978e9e29-11b0-405d-bf68-b20622016aad';
