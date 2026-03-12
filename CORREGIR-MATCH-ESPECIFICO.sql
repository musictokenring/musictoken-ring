-- ==========================================
-- CORRECCIÓN DIRECTA DEL MATCH PROBLEMÁTICO
-- Basado en los resultados de las consultas anteriores
-- ==========================================

-- PASO 1: Ver detalles completos del match problemático
SELECT 
    m.id AS match_id,
    m.finished_at,
    m.status,
    m.total_pot,
    m.winner,
    m.player1_id,
    u1.wallet_address AS player1_wallet,
    m.player2_id,
    u2.wallet_address AS player2_wallet,
    mw.user_id AS usuario_que_recibio_premio,
    u3.wallet_address AS wallet_que_recibio_premio,
    mw.credits_won AS premio_recibido,
    uc1.credits AS saldo_player1,
    uc2.credits AS saldo_player2,
    u1.total_wins AS victorias_player1,
    u2.total_wins AS victorias_player2
FROM matches m
LEFT JOIN users u1 ON m.player1_id = u1.id
LEFT JOIN users u2 ON m.player2_id = u2.id
LEFT JOIN match_wins mw ON m.id = mw.match_id
LEFT JOIN users u3 ON mw.user_id = u3.id
LEFT JOIN user_credits uc1 ON m.player1_id = uc1.user_id
LEFT JOIN user_credits uc2 ON m.player2_id = uc2.user_id
WHERE m.match_type = 'social'
    AND m.total_pot = 10  -- El match con pot de 10
ORDER BY m.created_at DESC
LIMIT 5;

-- ==========================================
-- PASO 2: CORRECCIÓN MANUAL
-- Después de ejecutar el PASO 1, identifica:
-- 1. El match_id del match problemático
-- 2. El player1_id y player2_id
-- 3. Quién debería haber ganado (basado en tu conocimiento del resultado)
-- 4. Quién recibió el premio incorrectamente
-- ==========================================

/*
-- REEMPLAZA ESTOS VALORES CON LOS REALES DEL PASO 1:
DO $$
DECLARE
    match_problema UUID := '22a4b46d-f463-4c8b-a881-e6b31f2dbc0b'; -- REEMPLAZA con el match_id real
    user_ganador UUID := '978e9e29-11b8-405d-bf68-b26622016aad'; -- REEMPLAZA con el UUID del ganador real
    user_perdedor UUID := '0948db31-9a51-463b-bfcc-cc66c383eb91'; -- REEMPLAZA con el UUID del perdedor
    premio_correcto DECIMAL := 9.8; -- total_pot (10) - 2% fee = 9.8
BEGIN
    RAISE NOTICE '🔍 Iniciando corrección del match: %', match_problema;
    
    -- A) Actualizar el match para marcarlo como finalizado con el ganador correcto
    UPDATE matches
    SET 
        status = 'finished',
        winner = CASE 
            WHEN player1_id = user_ganador THEN 1
            WHEN player2_id = user_ganador THEN 2
        END,
        finished_at = COALESCE(finished_at, NOW())
    WHERE id = match_problema;
    RAISE NOTICE '✅ Match actualizado con ganador correcto';
    
    -- B) Quitar créditos del perdedor (si los recibió incorrectamente)
    PERFORM increment_user_credits(user_perdedor, -premio_correcto);
    RAISE NOTICE '✅ Créditos removidos del perdedor: %', premio_correcto;
    
    -- C) Dar créditos al ganador real
    PERFORM increment_user_credits(user_ganador, premio_correcto);
    RAISE NOTICE '✅ Créditos otorgados al ganador real: %', premio_correcto;
    
    -- D) Actualizar match_wins (eliminar incorrecto si existe, crear correcto)
    DELETE FROM match_wins WHERE match_id = match_problema;
    INSERT INTO match_wins (user_id, match_id, credits_won, created_at)
    VALUES (user_ganador, match_problema, premio_correcto, NOW());
    RAISE NOTICE '✅ Registro en match_wins actualizado';
    
    -- E) Actualizar estadísticas del ganador
    UPDATE users
    SET 
        total_matches = total_matches + 1,
        total_wins = total_wins + 1,
        total_credits_won = total_credits_won + premio_correcto,
        updated_at = NOW()
    WHERE id = user_ganador;
    RAISE NOTICE '✅ Estadísticas del ganador actualizadas';
    
    -- F) Actualizar estadísticas del perdedor
    UPDATE users
    SET 
        total_matches = total_matches + 1,
        total_losses = total_losses + 1,
        total_credits_won = GREATEST(0, total_credits_won - premio_correcto),
        updated_at = NOW()
    WHERE id = user_perdedor;
    RAISE NOTICE '✅ Estadísticas del perdedor actualizadas';
    
    RAISE NOTICE '🎉 CORRECCIÓN COMPLETADA';
END $$;
*/

-- ==========================================
-- PASO 3: VERIFICAR CORRECCIÓN
-- Ejecuta esto después del PASO 2 para verificar que todo esté correcto
-- ==========================================
/*
SELECT 
    m.id AS match_id,
    m.status,
    m.winner,
    m.total_pot,
    mw.user_id AS usuario_con_premio,
    u.wallet_address,
    mw.credits_won,
    uc.credits AS saldo_actual,
    u.total_wins,
    u.total_losses
FROM matches m
LEFT JOIN match_wins mw ON m.id = mw.match_id
LEFT JOIN users u ON mw.user_id = u.id
LEFT JOIN user_credits uc ON u.id = uc.user_id
WHERE m.id = 'MATCH_ID_DEL_PASO_1';
*/
