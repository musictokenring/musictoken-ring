-- ==========================================
-- CORRECCIÓN: Si GANÓ PLAYER 1 (con verificación de usuarios)
-- Match: 22a4b46d-f403-4c8b-a881-e6b31f2dbc0b
-- ==========================================

DO $$
DECLARE
    match_problema UUID := '22a4b46d-f403-4c8b-a881-e6b31f2dbc0b';
    user_ganador UUID := '978e9e29-11b0-405d-bf68-b20622016aad'; -- Player 1
    user_perdedor UUID := '0940db31-9a51-403b-bfcc-cc66c383eb91'; -- Player 2
    premio_correcto DECIMAL := 9.8;
    winner_num INTEGER := 1;
    user_exists BOOLEAN;
BEGIN
    RAISE NOTICE '🔍 Match: %', match_problema;
    RAISE NOTICE '🏆 Ganador: Player 1 (%%)', user_ganador;
    RAISE NOTICE '😔 Perdedor: Player 2 (%%)', user_perdedor;
    RAISE NOTICE '💰 Premio: % créditos', premio_correcto;
    
    -- Verificar si el usuario perdedor existe en la tabla users
    SELECT EXISTS(SELECT 1 FROM users WHERE id = user_perdedor) INTO user_exists;
    
    IF NOT user_exists THEN
        RAISE NOTICE '⚠️ El usuario perdedor no existe en la tabla users, creándolo...';
        -- Crear el usuario perdedor si no existe (usar un wallet temporal si no tiene)
        INSERT INTO users (id, wallet_address, created_at, updated_at)
        VALUES (user_perdedor, '0x' || REPLACE(user_perdedor::text, '-', ''), NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
        RAISE NOTICE '✅ Usuario perdedor creado';
        
        -- Crear registro inicial en user_credits
        INSERT INTO user_credits (user_id, credits, updated_at)
        VALUES (user_perdedor, 0, NOW())
        ON CONFLICT (user_id) DO NOTHING;
        RAISE NOTICE '✅ Registro de créditos creado para perdedor';
    END IF;
    
    -- Verificar si el usuario ganador existe
    SELECT EXISTS(SELECT 1 FROM users WHERE id = user_ganador) INTO user_exists;
    
    IF NOT user_exists THEN
        RAISE NOTICE '⚠️ El usuario ganador no existe en la tabla users, creándolo...';
        INSERT INTO users (id, wallet_address, created_at, updated_at)
        VALUES (user_ganador, '0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
        RAISE NOTICE '✅ Usuario ganador creado';
        
        -- Crear registro inicial en user_credits si no existe
        INSERT INTO user_credits (user_id, credits, updated_at)
        VALUES (user_ganador, 0, NOW())
        ON CONFLICT (user_id) DO NOTHING;
        RAISE NOTICE '✅ Registro de créditos creado para ganador';
    END IF;
    
    -- 1. Finalizar el match y asignar ganador
    UPDATE matches
    SET 
        status = 'finished',
        winner = winner_num,
        finished_at = NOW()
    WHERE id = match_problema;
    RAISE NOTICE '✅ Match finalizado con ganador Player 1';
    
    -- 2. Verificar si el perdedor recibió premio incorrectamente y quitárselo
    IF EXISTS (
        SELECT 1 FROM match_wins 
        WHERE match_id = match_problema 
        AND user_id = user_perdedor
    ) THEN
        PERFORM increment_user_credits(user_perdedor, -premio_correcto);
        RAISE NOTICE '✅ Créditos removidos del perdedor: %', premio_correcto;
        
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
    
    -- 4. Actualizar match_wins
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
    
    -- 6. Actualizar estadísticas del perdedor
    UPDATE users
    SET 
        total_matches = COALESCE(total_matches, 0) + 1,
        total_losses = COALESCE(total_losses, 0) + 1,
        updated_at = NOW()
    WHERE id = user_perdedor;
    RAISE NOTICE '✅ Estadísticas del perdedor actualizadas';
    
    RAISE NOTICE '🎉 CORRECCIÓN COMPLETADA';
END $$;
