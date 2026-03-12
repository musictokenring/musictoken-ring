-- ==========================================
-- SCRIPT AUTOMÁTICO: Corregir premio dado incorrectamente
-- Este script busca matches recientes donde el premio fue dado incorrectamente
-- ==========================================

-- PASO 1: Identificar matches recientes con premios otorgados
-- Buscar matches finalizados en las últimas 24 horas con premios registrados
WITH recent_matches AS (
    SELECT 
        m.id AS match_id,
        m.player1_id,
        m.player2_id,
        m.winner,
        m.total_pot,
        m.finished_at,
        m.match_type,
        -- Calcular premio esperado (total_pot - 2% fee)
        (m.total_pot * 0.98) AS premio_esperado,
        -- Ver quién recibió el premio
        mw.user_id AS usuario_que_recibio_premio,
        mw.credits_won AS premio_recibido,
        -- Determinar quién debería haber recibido el premio
        CASE 
            WHEN m.winner = 1 THEN m.player1_id
            WHEN m.winner = 2 THEN m.player2_id
            ELSE NULL
        END AS usuario_que_deberia_recibir
    FROM matches m
    LEFT JOIN match_wins mw ON m.id = mw.match_id
    WHERE m.status = 'finished'
        AND m.finished_at >= NOW() - INTERVAL '24 hours'
        AND m.match_type = 'social' -- Solo desafíos sociales
        AND m.total_pot > 0
    ORDER BY m.finished_at DESC
    LIMIT 10
)
SELECT 
    match_id,
    player1_id,
    player2_id,
    winner,
    total_pot,
    premio_esperado,
    usuario_que_recibio_premio,
    premio_recibido,
    usuario_que_deberia_recibir,
    CASE 
        WHEN usuario_que_recibio_premio != usuario_que_deberia_recibir THEN '❌ ERROR'
        ELSE '✅ CORRECTO'
    END AS estado
FROM recent_matches
WHERE usuario_que_recibio_premio IS NOT NULL
ORDER BY finished_at DESC;

-- ==========================================
-- PASO 2: CORRECCIÓN AUTOMÁTICA
-- Descomenta y ejecuta este bloque después de revisar los resultados del PASO 1
-- ==========================================

/*
DO $$
DECLARE
    match_problema UUID;
    user_ganador UUID;
    user_perdedor UUID;
    premio_correcto DECIMAL;
    premio_incorrecto DECIMAL;
    total_pot_match DECIMAL;
BEGIN
    -- REEMPLAZA ESTOS VALORES con los resultados del PASO 1:
    -- match_problema := 'UUID_DEL_MATCH_PROBLEMA';
    -- user_ganador := 'UUID_DEL_GANADOR_REAL';
    -- user_perdedor := 'UUID_DEL_PERDEDOR';
    -- total_pot_match := 10.0; -- Ajusta según el total_pot del match
    
    -- Calcular premio correcto (total_pot - 2% fee)
    premio_correcto := total_pot_match * 0.98;
    premio_incorrecto := premio_correcto; -- Asumimos que se dio el premio completo
    
    RAISE NOTICE '🔍 Buscando match problemático...';
    RAISE NOTICE 'Match ID: %', match_problema;
    RAISE NOTICE 'Ganador real: %', user_ganador;
    RAISE NOTICE 'Perdedor (recibió premio): %', user_perdedor;
    RAISE NOTICE 'Premio a corregir: %', premio_correcto;
    
    -- A) Quitar créditos del perdedor
    PERFORM increment_user_credits(user_perdedor, -premio_incorrecto);
    RAISE NOTICE '✅ Créditos removidos del perdedor: %', premio_incorrecto;
    
    -- B) Dar créditos al ganador real
    PERFORM increment_user_credits(user_ganador, premio_correcto);
    RAISE NOTICE '✅ Créditos otorgados al ganador real: %', premio_correcto;
    
    -- C) Actualizar match_wins (eliminar incorrecto, crear correcto)
    DELETE FROM match_wins WHERE match_id = match_problema;
    
    INSERT INTO match_wins (user_id, match_id, credits_won, created_at)
    VALUES (user_ganador, match_problema, premio_correcto, NOW());
    RAISE NOTICE '✅ Registro en match_wins actualizado';
    
    -- D) Actualizar estadísticas del ganador
    UPDATE users
    SET 
        total_wins = total_wins + 1,
        total_losses = GREATEST(0, total_losses - 1),
        total_credits_won = total_credits_won + premio_correcto,
        updated_at = NOW()
    WHERE id = user_ganador;
    RAISE NOTICE '✅ Estadísticas del ganador actualizadas';
    
    -- E) Actualizar estadísticas del perdedor
    UPDATE users
    SET 
        total_wins = GREATEST(0, total_wins - 1),
        total_losses = total_losses + 1,
        total_credits_won = GREATEST(0, total_credits_won - premio_correcto),
        updated_at = NOW()
    WHERE id = user_perdedor;
    RAISE NOTICE '✅ Estadísticas del perdedor actualizadas';
    
    RAISE NOTICE '🎉 CORRECCIÓN COMPLETADA';
END $$;
*/

-- ==========================================
-- PASO 3: VERIFICAR SALDOS DESPUÉS DE LA CORRECCIÓN
-- ==========================================
/*
SELECT 
    u.id,
    u.wallet_address,
    uc.credits AS saldo_actual,
    u.total_matches,
    u.total_wins,
    u.total_losses,
    u.total_credits_won
FROM users u
LEFT JOIN user_credits uc ON u.id = uc.user_id
WHERE u.id IN (
    -- Reemplaza con los UUIDs del ganador y perdedor
    'UUID_GANADOR',
    'UUID_PERDEDOR'
)
ORDER BY u.wallet_address;
*/
