-- ==========================================
-- CORRECCIÓN DEL MATCH ESPECÍFICO: 22a4b46d-f408-3c8b-a881-e6b31f2dbc8b
-- Este match está en estado 'playing' pero debería estar 'finished'
-- ==========================================

-- PASO 1: Ver información completa del match
SELECT 
    m.id AS match_id,
    m.finished_at,
    m.status,
    m.total_pot,
    m.winner,
    m.player1_id,
    u1.wallet_address AS player1_wallet,
    u1.email AS player1_email,
    uc1.credits AS saldo_player1,
    m.player2_id,
    u2.wallet_address AS player2_wallet,
    u2.email AS player2_email,
    uc2.credits AS saldo_player2,
    mw.user_id AS usuario_que_recibio_premio,
    mw.credits_won AS premio_recibido,
    u1.total_wins AS victorias_player1,
    u2.total_wins AS victorias_player2
FROM matches m
LEFT JOIN users u1 ON m.player1_id = u1.id
LEFT JOIN users u2 ON m.player2_id = u2.id
LEFT JOIN match_wins mw ON m.id = mw.match_id
LEFT JOIN user_credits uc1 ON m.player1_id = uc1.user_id
LEFT JOIN user_credits uc2 ON m.player2_id = uc2.user_id
WHERE m.id = '22a4b46d-f408-3c8b-a881-e6b31f2dbc8b';

-- ==========================================
-- PASO 2: CORRECCIÓN MANUAL
-- IMPORTANTE: Tú debes saber quién ganó realmente
-- Reemplaza 'GANADOR_ID' con el UUID del ganador real:
-- - Si ganó player1: usa el player1_id del PASO 1
-- - Si ganó player2: usa el player2_id del PASO 1
-- ==========================================

/*
DO $$
DECLARE
    match_problema UUID := '22a4b46d-f408-3c8b-a881-e6b31f2dbc8b';
    user_ganador UUID := 'GANADOR_ID_AQUI'; -- REEMPLAZA: player1_id o player2_id del ganador
    user_perdedor UUID; -- Se calculará automáticamente
    premio_correcto DECIMAL := 9.8; -- 10 - 2% fee
    player1_id_match UUID;
    player2_id_match UUID;
    winner_num INTEGER;
BEGIN
    -- Obtener player IDs del match
    SELECT player1_id, player2_id INTO player1_id_match, player2_id_match
    FROM matches
    WHERE id = match_problema;
    
    -- Determinar quién es el perdedor y el número del ganador
    IF user_ganador = player1_id_match THEN
        user_perdedor := player2_id_match;
        winner_num := 1;
    ELSIF user_ganador = player2_id_match THEN
        user_perdedor := player1_id_match;
        winner_num := 2;
    ELSE
        RAISE EXCEPTION 'El ganador proporcionado no coincide con ningún player del match';
    END IF;
    
    RAISE NOTICE '🔍 Match: %', match_problema;
    RAISE NOTICE '🏆 Ganador: % (Player %)', user_ganador, winner_num;
    RAISE NOTICE '😔 Perdedor: %', user_perdedor;
    RAISE NOTICE '💰 Premio: %', premio_correcto;
    
    -- 1. Finalizar el match y asignar ganador
    UPDATE matches
    SET 
        status = 'finished',
        winner = winner_num,
        finished_at = COALESCE(finished_at, NOW())
    WHERE id = match_problema;
    RAISE NOTICE '✅ Match finalizado con ganador correcto';
    
    -- 2. Verificar si el perdedor recibió premio incorrectamente y quitárselo
    IF EXISTS (
        SELECT 1 FROM match_wins 
        WHERE match_id = match_problema 
        AND user_id = user_perdedor
    ) THEN
        PERFORM increment_user_credits(user_perdedor, -premio_correcto);
        RAISE NOTICE '✅ Créditos removidos del perdedor: %', premio_correcto;
        
        -- Actualizar estadísticas del perdedor (quitar victoria incorrecta)
        UPDATE users
        SET 
            total_wins = GREATEST(0, total_wins - 1),
            total_losses = total_losses + 1,
            total_credits_won = GREATEST(0, total_credits_won - premio_correcto),
            updated_at = NOW()
        WHERE id = user_perdedor;
        RAISE NOTICE '✅ Estadísticas del perdedor corregidas';
    END IF;
    
    -- 3. Otorgar premio al ganador real
    PERFORM increment_user_credits(user_ganador, premio_correcto);
    RAISE NOTICE '✅ Créditos otorgados al ganador: %', premio_correcto;
    
    -- 4. Actualizar match_wins (eliminar cualquier registro incorrecto, crear el correcto)
    DELETE FROM match_wins WHERE match_id = match_problema;
    INSERT INTO match_wins (user_id, match_id, credits_won, created_at)
    VALUES (user_ganador, match_problema, premio_correcto, NOW());
    RAISE NOTICE '✅ Registro en match_wins actualizado';
    
    -- 5. Actualizar estadísticas del ganador
    UPDATE users
    SET 
        total_matches = COALESCE(total_matches, 0) + 1,
        total_wins = COALESCE(total_wins, 0) + 1,
        total_credits_won = COALESCE(total_credits_won, 0) + premio_correcto,
        updated_at = NOW()
    WHERE id = user_ganador;
    RAISE NOTICE '✅ Estadísticas del ganador actualizadas';
    
    -- 6. Asegurar que el perdedor tenga estadísticas correctas
    UPDATE users
    SET 
        total_matches = COALESCE(total_matches, 0) + 1,
        total_losses = COALESCE(total_losses, 0) + 1,
        updated_at = NOW()
    WHERE id = user_perdedor
    AND NOT EXISTS (
        SELECT 1 FROM match_wins 
        WHERE match_id = match_problema 
        AND user_id = user_perdedor
    );
    
    RAISE NOTICE '🎉 CORRECCIÓN COMPLETADA';
END $$;
*/

-- ==========================================
-- PASO 3: VERIFICAR CORRECCIÓN
-- Ejecuta esto después del PASO 2 para verificar
-- ==========================================
/*
SELECT 
    m.id AS match_id,
    m.status,
    m.winner,
    m.total_pot,
    m.finished_at,
    mw.user_id AS usuario_con_premio,
    u.wallet_address,
    mw.credits_won,
    uc.credits AS saldo_actual,
    u.total_wins,
    u.total_losses,
    u.total_credits_won
FROM matches m
LEFT JOIN match_wins mw ON m.id = mw.match_id
LEFT JOIN users u ON mw.user_id = u.id
LEFT JOIN user_credits uc ON u.id = uc.user_id
WHERE m.id = '22a4b46d-f408-3c8b-a881-e6b31f2dbc8b';
*/
