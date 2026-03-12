-- ==========================================
-- CORRECCIÓN FINAL DEL MATCH: 22a4b46d-f403-4c8b-a881-e6b31f2dbc0b
-- Match en estado 'playing' que debe finalizarse y otorgar premio correctamente
-- ==========================================

-- IMPORTANTE: Antes de ejecutar, confirma quién ganó realmente:
-- - Si ganó player1: usa '978e9e29-11b0-405d-bf68-b20622016aad'
-- - Si ganó player2: usa '0940db31-9a51-403b-bfcc-cc66c383eb91'

-- REEMPLAZA 'GANADOR_ID_AQUI' con el UUID del ganador real
DO $$
DECLARE
    match_problema UUID := '22a4b46d-f403-4c8b-a881-e6b31f2dbc0b';
    user_ganador UUID := 'GANADOR_ID_AQUI'; -- ⚠️ REEMPLAZA: player1_id o player2_id del ganador
    user_perdedor UUID;
    premio_correcto DECIMAL := 9.8; -- 10 - 2% fee = 9.8
    player1_id_match UUID := '978e9e29-11b0-405d-bf68-b20622016aad';
    player2_id_match UUID := '0940db31-9a51-403b-bfcc-cc66c383eb91';
    winner_num INTEGER;
BEGIN
    -- Determinar quién es el perdedor y el número del ganador
    IF user_ganador = player1_id_match THEN
        user_perdedor := player2_id_match;
        winner_num := 1;
        RAISE NOTICE '🏆 Ganador: Player 1 (%%)', user_ganador;
        RAISE NOTICE '😔 Perdedor: Player 2 (%%)', user_perdedor;
    ELSIF user_ganador = player2_id_match THEN
        user_perdedor := player1_id_match;
        winner_num := 2;
        RAISE NOTICE '🏆 Ganador: Player 2 (%%)', user_ganador;
        RAISE NOTICE '😔 Perdedor: Player 1 (%%)', user_perdedor;
    ELSE
        RAISE EXCEPTION 'El ganador proporcionado no coincide con ningún player del match';
    END IF;
    
    RAISE NOTICE '🔍 Match: %', match_problema;
    RAISE NOTICE '💰 Premio: % créditos', premio_correcto;
    
    -- 1. Finalizar el match y asignar ganador
    UPDATE matches
    SET 
        status = 'finished',
        winner = winner_num,
        finished_at = NOW()
    WHERE id = match_problema;
    RAISE NOTICE '✅ Match finalizado con ganador correcto (Player %)', winner_num;
    
    -- 2. Verificar si el perdedor recibió premio incorrectamente y quitárselo
    IF EXISTS (
        SELECT 1 FROM match_wins 
        WHERE match_id = match_problema 
        AND user_id = user_perdedor
    ) THEN
        PERFORM increment_user_credits(user_perdedor, -premio_correcto);
        RAISE NOTICE '✅ Créditos removidos del perdedor: %', premio_correcto;
        
        -- Actualizar estadísticas del perdedor (quitar victoria incorrecta si existe)
        UPDATE users
        SET 
            total_wins = GREATEST(0, COALESCE(total_wins, 0) - 1),
            total_losses = COALESCE(total_losses, 0) + 1,
            total_credits_won = GREATEST(0, COALESCE(total_credits_won, 0) - premio_correcto),
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
    
    -- 6. Asegurar que el perdedor tenga estadísticas correctas (solo si no recibió premio)
    IF NOT EXISTS (
        SELECT 1 FROM match_wins 
        WHERE match_id = match_problema 
        AND user_id = user_perdedor
    ) THEN
        UPDATE users
        SET 
            total_matches = COALESCE(total_matches, 0) + 1,
            total_losses = COALESCE(total_losses, 0) + 1,
            updated_at = NOW()
        WHERE id = user_perdedor;
        RAISE NOTICE '✅ Estadísticas del perdedor actualizadas';
    END IF;
    
    RAISE NOTICE '🎉 CORRECCIÓN COMPLETADA';
END $$;

-- ==========================================
-- VERIFICACIÓN: Ejecuta esto después para verificar la corrección
-- ==========================================
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
WHERE m.id = '22a4b46d-f403-4c8b-a881-e6b31f2dbc0b';
