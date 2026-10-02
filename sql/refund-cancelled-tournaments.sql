-- Devolución de inscripciones de torneos CANCELADOS (2026-10-02).
--
-- Hasta el commit de hoy, cancelar un torneo (backend/tournament-battle.js
-- -> cancelTournament) solo cambiaba el estado: quien había pagado la
-- inscripción NO la recuperaba. Desde ahora se devuelve sola al cancelar;
-- esto es para los casos de antes.
--
-- PASO 1 (solo lectura): torneos cancelados con jugadores humanos.
SELECT t.id            AS tournament_id,
       t.name,
       t.updated_at    AS cancelado_en,
       t.entry_fee,
       p.user_id,
       p.display_name
FROM tournaments t
JOIN tournament_participants p ON p.tournament_id = t.id
WHERE t.status = 'cancelled'
  AND COALESCE(p.is_cpu, false) = false
  AND p.user_id::text NOT LIKE '00000000-0000-4000-8000-%'
ORDER BY t.updated_at DESC;

-- PASO 2: devolver UN torneo por vez, revisando el PASO 1 antes.
-- Reemplazá el id y corré solo este bloque. Cada fila devuelta = una
-- devolución hecha; no lo corras dos veces para el mismo torneo.
--
-- SELECT p.user_id,
--        increment_user_credits(p.user_id, t.entry_fee) AS devuelto
-- FROM tournaments t
-- JOIN tournament_participants p ON p.tournament_id = t.id
-- WHERE t.id = 'PEGAR-ID-DEL-TORNEO-ACA'
--   AND t.status = 'cancelled'
--   AND COALESCE(p.is_cpu, false) = false
--   AND p.user_id::text NOT LIKE '00000000-0000-4000-8000-%';
