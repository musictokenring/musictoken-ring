-- ============================================================
-- SALA DE ESPERA DE BATALLAS VERIFICADAS (Desafío Social, Sala
-- Privada, Modo Rápido)
-- ============================================================
-- Correr ANTES de publicar el backend nuevo. Sin estas columnas el
-- backend sigue funcionando como antes (cada lado arranca solo), pero
-- entonces el Desafío Social sigue sin juntar a los dos jugadores.
--
-- player1_ready_at / player2_ready_at: cuándo cada jugador entró a la
--   sala de espera de esa batalla.
-- battle_starts_at: hora común de arranque (la fija el servidor cuando
--   los dos están conectados, con 5s de cuenta regresiva). Los dos
--   dispositivos juegan las mismas rondas al mismo tiempo.
-- fanplay_timeout_resolution suma dos valores nuevos: 'lobby_timeout'
--   (el rival no entró en 5 min) y 'lobby_left' (alguien salió antes de
--   arrancar). En los dos casos se devuelve cada apuesta.

alter table matches add column if not exists player1_ready_at timestamptz;
alter table matches add column if not exists player2_ready_at timestamptz;
alter table matches add column if not exists battle_starts_at timestamptz;

-- Barrido de salas vencidas y aviso "tu rival te espera".
create index if not exists idx_matches_lobby_open
    on matches (player1_ready_at, player2_ready_at)
    where fanplay_seed is null and status not in ('finished', 'cancelled');

-- Solo las escribe el backend (service role). Nada de RLS nuevo.
