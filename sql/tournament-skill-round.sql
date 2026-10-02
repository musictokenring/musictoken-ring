-- Torneos por destreza ("todos a la vez"), 2026-10-01.
--
-- Antes: al cerrar la inscripción el servidor sorteaba cada duelo con
-- Math.random() y pagaba el premio al instante. Ahora todos los inscritos
-- juegan el mini-juego de la estrella con la misma semilla, el servidor
-- recalcula cada puntaje desde los toques crudos, y gana el mejor jugador
-- real (ver backend/tournament-battle.js -> openSkillRound / resolveSkillRound).
--
-- CORRER ESTO EN SUPABASE ANTES DE PUBLICAR EL BACKEND NUEVO. Sin estas
-- columnas nadie puede anotar puntaje: el torneo se resolvería con 0
-- jugadores y devolvería todas las inscripciones (seguro, pero inútil).

ALTER TABLE tournament_participants
    ADD COLUMN IF NOT EXISTS fanplay_started_at   timestamptz,
    ADD COLUMN IF NOT EXISTS fanplay_submitted_at timestamptz,
    ADD COLUMN IF NOT EXISTS fanplay_score        numeric;

-- Verificación: debe listar las 3 columnas.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tournament_participants'
  AND column_name IN ('fanplay_started_at', 'fanplay_submitted_at', 'fanplay_score');
