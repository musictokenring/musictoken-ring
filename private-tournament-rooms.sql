-- ============================================================
-- SALA PRIVADA -- MODO TORNEO (mini-torneo eliminatorio privado)
-- ============================================================
-- Pedido explícito del usuario: la Sala Privada clásica (1 vs 1, ya
-- construida y auditada -- ver Skill/memoria "battle economics audit
-- 2026-09") sigue exactamente igual, sin tocar. Esto es un modo NUEVO,
-- separado: el creador elige un cupo (3 a 16 invitados), todos entran
-- con el mismo link/código, y cuando el cupo se llena (o todos los
-- presentes votan "arrancar ya") se arma un bracket de eliminación
-- directa. El ganador de la final se lleva el pozo completo.
--
-- Diseño deliberado: NINGUNA política RLS permite a un cliente escribir
-- estas tablas directamente (ni siquiera "soy dueño de mi propia fila")
-- -- todo el dinero (descuento al unirse, pago al campeón) se mueve
-- exclusivamente desde el backend con la service role key. Esto es a
-- propósito para no repetir el patrón de RLS "qual:true" encontrado y
-- corregido esta misma sesión en varias tablas -- ver memoria
-- "RLS overpermissive pattern". Los clientes solo pueden LEER (para
-- mostrar la sala de espera y el bracket).

create table if not exists private_tournament_rooms (
    id uuid primary key default gen_random_uuid(),
    room_code text unique not null,
    creator_id uuid not null references auth.users(id),
    capacity int not null check (capacity between 3 and 16),
    bet_amount numeric not null check (bet_amount > 0),
    stake_type text not null default 'real' check (stake_type in ('real')),
    status text not null default 'waiting' check (status in ('waiting', 'in_progress', 'finished', 'cancelled')),
    current_round int not null default 0,
    total_pot numeric not null default 0,
    winner_id uuid references auth.users(id),
    created_at timestamptz not null default now(),
    started_at timestamptz,
    finished_at timestamptz
);

create index if not exists idx_private_tournament_rooms_code on private_tournament_rooms(room_code);
create index if not exists idx_private_tournament_rooms_creator on private_tournament_rooms(creator_id);

create table if not exists private_tournament_participants (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references private_tournament_rooms(id) on delete cascade,
    user_id uuid not null references auth.users(id),
    song_id text,
    song_name text,
    song_artist text,
    song_image text,
    avatar text,
    ready_vote boolean not null default false,
    eliminated boolean not null default false,
    joined_at timestamptz not null default now(),
    unique (room_id, user_id)
);

create index if not exists idx_private_tournament_participants_room on private_tournament_participants(room_id);

-- Una fila por cada emparejamiento del bracket, en todas las rondas.
-- match_id apunta a la fila real en "matches" (se reusa el mismo motor
-- de batalla/animación que ya existe para el 1 vs 1) -- null cuando
-- es_bye=true (nadie juega esa ronda, avanza solo).
-- "resolved" es el guardado de idempotencia: dos dispositivos pueden
-- intentar procesar el mismo resultado al mismo tiempo (mismo patrón de
-- "carrera atómica" ya usado en toda la app) -- el backend solo permite
-- que uno de los dos efectivamente lo marque resolved.
create table if not exists private_tournament_matches (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references private_tournament_rooms(id) on delete cascade,
    round int not null,
    match_id uuid references matches(id),
    player1_id uuid not null,
    player2_id uuid,
    is_bye boolean not null default false,
    resolved boolean not null default false,
    winner_id uuid,
    created_at timestamptz not null default now()
);

create index if not exists idx_private_tournament_matches_room_round on private_tournament_matches(room_id, round);
create index if not exists idx_private_tournament_matches_match_id on private_tournament_matches(match_id);

alter table private_tournament_rooms enable row level security;
alter table private_tournament_participants enable row level security;
alter table private_tournament_matches enable row level security;

-- Lectura pública por room_code (necesaria para la vista previa de "Sala
-- Encontrada" antes de loguearse) -- ninguna de estas filas contiene
-- datos sensibles (nada de credenciales ni montos de otras personas
-- fuera de la sala). Cero políticas de INSERT/UPDATE/DELETE para
-- anon/authenticated: todo pasa por el backend.
drop policy if exists "private_tournament_rooms_select_all" on private_tournament_rooms;
create policy "private_tournament_rooms_select_all" on private_tournament_rooms
    for select using (true);

drop policy if exists "private_tournament_participants_select_all" on private_tournament_participants;
create policy "private_tournament_participants_select_all" on private_tournament_participants
    for select using (true);

drop policy if exists "private_tournament_matches_select_all" on private_tournament_matches;
create policy "private_tournament_matches_select_all" on private_tournament_matches
    for select using (true);
