-- ==========================================
-- CORRECCIÓN ESPECÍFICA: Usuario con saldo de 1060 MTR (debería tener ~1050)
-- Este script busca y corrige el saldo del usuario que recibió el premio incorrectamente
-- ==========================================

-- PASO 1: Identificar usuario con saldo sospechoso (~1060 MTR)
SELECT 
    u.id AS user_id,
    u.wallet_address,
    uc.credits AS saldo_actual,
    u.total_matches,
    u.total_wins,
    u.total_losses,
    u.total_credits_won,
    -- Buscar premios recientes de este usuario
    (
        SELECT json_agg(json_build_object(
            'match_id', m.id,
            'finished_at', m.finished_at,
            'credits_won', mw.credits_won,
            'total_pot', m.total_pot,
            'winner', m.winner,
            'player1_id', m.player1_id,
            'player2_id', m.player2_id
        ))
        FROM match_wins mw
        JOIN matches m ON mw.match_id = m.id
        WHERE mw.user_id = u.id
            AND m.finished_at >= NOW() - INTERVAL '7 days'
        ORDER BY m.finished_at DESC
    ) AS premios_recientes
FROM users u
LEFT JOIN user_credits uc ON u.id = uc.user_id
WHERE uc.credits BETWEEN 1050 AND 1070  -- Rango alrededor de 1060
ORDER BY uc.credits DESC;

-- ==========================================
-- PASO 2: CORRECCIÓN DIRECTA
-- Después de identificar el usuario en el PASO 1, ejecuta esto
-- REEMPLAZA 'USER_ID_AQUI' con el user_id encontrado
-- ==========================================

/*
DO $$
DECLARE
    user_perdedor UUID := 'USER_ID_AQUI'; -- REEMPLAZA con el user_id del perdedor
    premio_incorrecto DECIMAL := 9.8; -- Premio que se dio incorrectamente (10 - 2% fee)
    saldo_actual DECIMAL;
    saldo_correcto DECIMAL;
BEGIN
    -- Obtener saldo actual
    SELECT credits INTO saldo_actual
    FROM user_credits
    WHERE user_id = user_perdedor;
    
    -- Calcular saldo correcto (quitar el premio incorrecto)
    saldo_correcto := saldo_actual - premio_incorrecto;
    
    RAISE NOTICE '🔍 Usuario: %', user_perdedor;
    RAISE NOTICE '💰 Saldo actual: %', saldo_actual;
    RAISE NOTICE '💰 Saldo correcto: %', saldo_correcto;
    RAISE NOTICE '❌ Premio a remover: %', premio_incorrecto;
    
    -- Quitar el premio incorrecto
    PERFORM increment_user_credits(user_perdedor, -premio_incorrecto);
    
    -- Actualizar estadísticas (quitar la victoria incorrecta si existe)
    UPDATE users
    SET 
        total_wins = GREATEST(0, total_wins - 1),
        total_losses = total_losses + 1,
        total_credits_won = GREATEST(0, total_credits_won - premio_incorrecto),
        updated_at = NOW()
    WHERE id = user_perdedor;
    
    RAISE NOTICE '✅ Saldo corregido: % créditos removidos', premio_incorrecto;
    RAISE NOTICE '✅ Estadísticas actualizadas';
END $$;
*/

-- ==========================================
-- PASO 3: Otorgar premio al ganador real
-- REEMPLAZA 'USER_ID_GANADOR' con el user_id del ganador real
-- ==========================================

/*
DO $$
DECLARE
    user_ganador UUID := 'USER_ID_GANADOR'; -- REEMPLAZA con el user_id del ganador
    match_problema UUID := 'MATCH_ID_DEL_PASO_1'; -- Del script CORREGIR-MATCH-ESPECIFICO.sql
    premio_correcto DECIMAL := 9.8;
BEGIN
    -- Dar créditos al ganador
    PERFORM increment_user_credits(user_ganador, premio_correcto);
    
    -- Registrar en match_wins
    DELETE FROM match_wins WHERE match_id = match_problema;
    INSERT INTO match_wins (user_id, match_id, credits_won, created_at)
    VALUES (user_ganador, match_problema, premio_correcto, NOW());
    
    -- Actualizar estadísticas del ganador
    UPDATE users
    SET 
        total_matches = total_matches + 1,
        total_wins = total_wins + 1,
        total_credits_won = total_credits_won + premio_correcto,
        updated_at = NOW()
    WHERE id = user_ganador;
    
    RAISE NOTICE '✅ Premio otorgado al ganador real: %', premio_correcto;
END $$;
*/
