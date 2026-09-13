-- ============================================================
-- "REPRODUCCIONES DE FAN" -- verificación server-side (dinero real)
-- ============================================================
-- Semilla determinística (misma para los dos jugadores, la fija el
-- backend la primera vez que alguien la pide) + el puntaje que el
-- backend recalculó de forma independiente para cada lado a partir de
-- los toques crudos -- nunca se guarda un puntaje que haya mandado el
-- cliente sin recalcularlo acá. Ver src/fan-plays-scoring.js para la
-- fórmula (tiene que dar lo mismo en el navegador y en el servidor).

alter table matches add column if not exists fanplay_seed bigint;
alter table matches add column if not exists player1_fanplay_score numeric;
alter table matches add column if not exists player2_fanplay_score numeric;

-- CRÍTICO, encontrado en el camino (no específico de "reproducciones de
-- fan"): /api/matches/:matchId/award-winner no tenía ningún seguro
-- contra ser llamado dos veces para el mismo match -- pagaba el pozo
-- completo cada vez. Hasta ahora era inofensivo porque la carrera
-- atómica del lado del cliente aseguraba un solo llamado, pero el nuevo
-- flujo de batallas verificadas hace que AMBOS jugadores llamen a este
-- mismo endpoint legítimamente. "not null default false" hace que
-- Postgres backfillee esta columna en TODAS las filas existentes con
-- false, así que ningún match viejo en curso se rompe con la nueva
-- verificación agregada en server-auto.js.
alter table matches add column if not exists award_processed boolean not null default false;

-- Nada de RLS nuevo hace falta: estas columnas se escriben EXCLUSIVAMENTE
-- desde el backend (service role) a través de los endpoints nuevos
-- (/api/battles/:matchId/fanplay-seed y .../submit-fanplay-score) -- la
-- política de UPDATE ya existente en "matches" para anon/authenticated
-- sigue intacta y no le da a ningún cliente permiso de tocar estas
-- columnas directamente.
