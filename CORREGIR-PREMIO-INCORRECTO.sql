-- ==========================================
-- SCRIPT OPCIONAL: Corregir premio dado incorrectamente
-- ==========================================
-- IMPORTANTE: Este script requiere que conozcas:
-- 1. El match_id donde ocurrió el error
-- 2. El user_id del ganador real (quien debería haber recibido el premio)
-- 3. El user_id del perdedor (quien recibió el premio incorrectamente)
-- 4. La cantidad de créditos que se dieron incorrectamente

-- PASO 1: Buscar el match problemático (reemplaza 'MATCH_ID_AQUI' con el ID real)
-- SELECT id, player1_id, player2_id, winner, total_pot, status, finished_at
-- FROM matches
-- WHERE id = 'MATCH_ID_AQUI';

-- PASO 2: Verificar quién recibió el premio incorrectamente
-- SELECT mw.*, u.wallet_address
-- FROM match_wins mw
-- JOIN users u ON mw.user_id = u.id
-- WHERE mw.match_id = 'MATCH_ID_AQUI';

-- PASO 3: Calcular el premio correcto (total_pot - 2% fee)
-- Ejemplo: Si total_pot = 10 MTR, fee = 0.2 MTR, premio = 9.8 MTR
-- SELECT total_pot, 
--        total_pot * 0.02 AS fee,
--        total_pot * 0.98 AS premio_ganador
-- FROM matches
-- WHERE id = 'MATCH_ID_AQUI';

-- PASO 4: CORRECCIÓN MANUAL (descomenta y ajusta los valores)
-- IMPORTANTE: Reemplaza estos valores con los reales:
-- - 'USER_ID_GANADOR_REAL' = ID del usuario que realmente ganó
-- - 'USER_ID_PERDEDOR' = ID del usuario que recibió el premio incorrectamente
-- - 9.8 = Cantidad de créditos que se deben transferir (ajusta según tu cálculo)

/*
-- A) Quitar créditos del perdedor (quien recibió incorrectamente)
DO $$
DECLARE
    premio_incorrecto DECIMAL := 9.8; -- Ajusta este valor
    user_id_perdedor UUID := 'USER_ID_PERDEDOR'; -- Reemplaza con UUID real
BEGIN
    -- Decrementar créditos del perdedor
    PERFORM increment_user_credits(user_id_perdedor, -premio_incorrecto);
    
    RAISE NOTICE '✅ Créditos removidos del perdedor: %', premio_incorrecto;
END $$;

-- B) Dar créditos al ganador real
DO $$
DECLARE
    premio_correcto DECIMAL := 9.8; -- Ajusta este valor
    user_id_ganador UUID := 'USER_ID_GANADOR_REAL'; -- Reemplaza con UUID real
    match_id_corregir UUID := 'MATCH_ID_AQUI'; -- Reemplaza con match_id real
BEGIN
    -- Incrementar créditos del ganador
    PERFORM increment_user_credits(user_id_ganador, premio_correcto);
    
    -- Actualizar registro en match_wins (eliminar el incorrecto y crear el correcto)
    DELETE FROM match_wins WHERE match_id = match_id_corregir;
    
    INSERT INTO match_wins (user_id, match_id, credits_won, created_at)
    VALUES (user_id_ganador, match_id_corregir, premio_correcto, NOW());
    
    -- Actualizar estadísticas del ganador
    UPDATE users
    SET total_wins = total_wins + 1,
        total_losses = GREATEST(0, total_losses - 1),
        total_credits_won = total_credits_won + premio_correcto,
        updated_at = NOW()
    WHERE id = user_id_ganador;
    
    -- Actualizar estadísticas del perdedor
    UPDATE users
    SET total_wins = GREATEST(0, total_wins - 1),
        total_losses = total_losses + 1,
        total_credits_won = GREATEST(0, total_credits_won - premio_correcto),
        updated_at = NOW()
    WHERE id = user_id_perdedor;
    
    RAISE NOTICE '✅ Premio corregido: % créditos transferidos al ganador real', premio_correcto;
END $$;
*/

-- ==========================================
-- INSTRUCCIONES DE USO:
-- ==========================================
-- 1. Ejecuta los PASOS 1, 2 y 3 para obtener los valores necesarios
-- 2. Descomenta el bloque del PASO 4
-- 3. Reemplaza los valores placeholder con los reales
-- 4. Ejecuta el script completo
-- ==========================================
