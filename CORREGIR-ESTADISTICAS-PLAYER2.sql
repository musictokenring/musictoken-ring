-- ==========================================
-- CORREGIR ESTADÍSTICAS DE PLAYER 2
-- Basado en los matches REALES finalizados
-- ==========================================

DO $$
DECLARE
    user_id_player2 UUID := '0940db31-9a51-403b-bfcc-cc66c383eb91'; -- Player 2
    partidas_reales INTEGER;
    victorias_reales INTEGER;
    derrotas_reales INTEGER;
    creditos_reales DECIMAL;
BEGIN
    -- Calcular estadísticas REALES basadas en matches finalizados
    SELECT 
        COUNT(*) INTO partidas_reales
    FROM matches
    WHERE player2_id = user_id_player2
        AND status = 'finished';
    
    SELECT 
        COUNT(*) INTO victorias_reales
    FROM matches
    WHERE player2_id = user_id_player2
        AND status = 'finished'
        AND winner = 2;
    
    SELECT 
        COUNT(*) INTO derrotas_reales
    FROM matches
    WHERE player2_id = user_id_player2
        AND status = 'finished'
        AND winner = 1;
    
    SELECT 
        COALESCE(SUM(mw.credits_won), 0) INTO creditos_reales
    FROM match_wins mw
    WHERE mw.user_id = user_id_player2;
    
    RAISE NOTICE '📊 Estadísticas REALES de Player 2:';
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
    WHERE id = user_id_player2;
    
    RAISE NOTICE '✅ Estadísticas de Player 2 corregidas';
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
    (SELECT COUNT(*) FROM matches WHERE player2_id = u.id AND status = 'finished') AS partidas_reales,
    (SELECT COUNT(*) FROM matches WHERE player2_id = u.id AND status = 'finished' AND winner = 2) AS victorias_reales,
    (SELECT COUNT(*) FROM matches WHERE player2_id = u.id AND status = 'finished' AND winner = 1) AS derrotas_reales,
    (SELECT COALESCE(SUM(mw.credits_won), 0) FROM match_wins mw WHERE mw.user_id = u.id) AS creditos_reales
FROM users u
LEFT JOIN user_credits uc ON u.id = uc.user_id
WHERE u.id = '0940db31-9a51-403b-bfcc-cc66c383eb91';
