-- ==========================================
-- CORRECCIÓN FINAL: HOMEFIX APP PERDIÓ, Player 2 GANÓ
-- Match: 22a4b46d-f403-4c8b-a881-e6b31f2dbc0b
-- ==========================================
-- IMPORTANTE: HOMEFIX APP (Player 1) PERDIÓ
-- El ganador real es Player 2
-- ==========================================

DO $$
DECLARE
    match_problema UUID := '22a4b46d-f403-4c8b-a881-e6b31f2dbc0b';
    user_ganador UUID := '0940db31-9a51-403b-bfcc-cc66c383eb91'; -- Player 2 (GANADOR REAL)
    user_perdedor UUID := '978e9e29-11b0-405d-bf68-b20622016aad'; -- Player 1 (HOMEFIX APP - PERDIÓ)
    premio_correcto DECIMAL := 9.8;
    winner_num INTEGER := 2;
    user_exists BOOLEAN;
    premio_incorrecto_recibido DECIMAL;
BEGIN
    RAISE NOTICE '🔍 CORRECCIÓN: HOMEFIX APP (Player 1) PERDIÓ';
    RAISE NOTICE '🏆 Ganador REAL: Player 2 (%%)', user_ganador;
    RAISE NOTICE '😔 Perdedor: Player 1 - HOMEFIX APP (%%)', user_perdedor;
    RAISE NOTICE '💰 Premio: % créditos', premio_correcto;
    
    -- Verificar si el usuario ganador existe
    SELECT EXISTS(SELECT 1 FROM users WHERE id = user_ganador) INTO user_exists;
    IF NOT user_exists THEN
        INSERT INTO users (id, wallet_address, created_at, updated_at)
        VALUES (
            user_ganador, 
            '0x' || SUBSTRING(REPLACE(user_ganador::text, '-', ''), 1, 40), 
            NOW(), 
            NOW()
        )
        ON CONFLICT (id) DO NOTHING;
        INSERT INTO user_credits (user_id, credits, updated_at)
        VALUES (user_ganador, 0, NOW())
        ON CONFLICT (user_id) DO NOTHING;
        RAISE NOTICE '✅ Usuario ganador creado';
    END IF;
    
    -- 1. Actualizar match con el ganador correcto (Player 2)
    UPDATE matches
    SET 
        status = 'finished',
        winner = winner_num,
        finished_at = NOW()
    WHERE id = match_problema;
    RAISE NOTICE '✅ Match actualizado: Ganador = Player 2';
    
    -- 2. Verificar si Player 1 (HOMEFIX APP) recibió premio incorrectamente y quitárselo
    SELECT credits_won INTO premio_incorrecto_recibido
    FROM match_wins
    WHERE match_id = match_problema 
    AND user_id = user_perdedor;
    
    IF premio_incorrecto_recibido IS NOT NULL THEN
        RAISE NOTICE '⚠️ Player 1 recibió premio incorrectamente: % créditos', premio_incorrecto_recibido;
        
        -- Quitar el premio incorrecto
        PERFORM increment_user_credits(user_perdedor, -premio_incorrecto_recibido);
        RAISE NOTICE '✅ Créditos removidos de Player 1: %', premio_incorrecto_recibido;
        
        -- Corregir estadísticas de Player 1 (quitar victoria incorrecta, agregar derrota)
        UPDATE users
        SET 
            total_wins = GREATEST(0, COALESCE(total_wins, 0) - 1),
            total_losses = COALESCE(total_losses, 0) + 1,
            total_credits_won = GREATEST(0, COALESCE(total_credits_won, 0) - premio_incorrecto_recibido),
            updated_at = NOW()
        WHERE id = user_perdedor;
        RAISE NOTICE '✅ Estadísticas de Player 1 corregidas (victoria removida, derrota agregada)';
    END IF;
    
    -- 3. Otorgar premio al ganador real (Player 2)
    PERFORM increment_user_credits(user_ganador, premio_correcto);
    RAISE NOTICE '✅ Créditos otorgados a Player 2: %', premio_correcto;
    
    -- 4. Actualizar match_wins (eliminar incorrecto, crear correcto)
    DELETE FROM match_wins WHERE match_id = match_problema;
    INSERT INTO match_wins (user_id, match_id, credits_won, created_at)
    VALUES (user_ganador, match_problema, premio_correcto, NOW());
    RAISE NOTICE '✅ Registro en match_wins actualizado para Player 2';
    
    -- 5. Actualizar estadísticas del ganador (Player 2)
    UPDATE users
    SET 
        total_matches = COALESCE(total_matches, 0) + 1,
        total_wins = COALESCE(total_wins, 0) + 1,
        total_credits_won = COALESCE(total_credits_won, 0) + premio_correcto,
        updated_at = NOW()
    WHERE id = user_ganador;
    RAISE NOTICE '✅ Estadísticas de Player 2 actualizadas';
    
    -- 6. Asegurar que Player 1 tenga estadísticas correctas (solo si no tenía victoria antes)
    -- Si Player 1 ya tenía una victoria incorrecta registrada, ya la quitamos arriba
    -- Ahora solo necesitamos asegurar que tenga la derrota registrada
    UPDATE users
    SET 
        total_losses = COALESCE(total_losses, 0) + 1,
        updated_at = NOW()
    WHERE id = user_perdedor
    AND NOT EXISTS (
        SELECT 1 FROM match_wins 
        WHERE match_id = match_problema 
        AND user_id = user_perdedor
    );
    
    RAISE NOTICE '🎉 CORRECCIÓN COMPLETADA';
    RAISE NOTICE '📊 Player 1 (HOMEFIX APP) ahora tiene la derrota registrada';
    RAISE NOTICE '📊 Player 2 ahora tiene la victoria y el premio';
END $$;
