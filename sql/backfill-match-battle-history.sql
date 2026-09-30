-- ============================================================
-- HISTORIAL DEL PERFIL: completar batallas que nunca se registraron (2026-09-29)
-- ============================================================
-- player_battle_history lo escribía el navegador con las filas de LOS DOS
-- jugadores, pero la RLS solo permite insertar la fila propia -> el upsert
-- fallaba entero y las batallas 1 vs 1 (social / rápido / sala privada) no
-- quedaban en el historial: el perfil mostraba 0 victorias a quien sí ganó.
-- Desde el commit de este fix lo registra el backend al pagar el premio.
--
-- Esto rellena las batallas pasadas desde la tabla matches, que sí tiene el
-- ganador correcto. Solo INSERTA filas que faltan (on conflict do nothing);
-- no toca saldos ni filas existentes. Se puede correr más de una vez.

-- 1) Vista previa: cuántas filas se agregarían por modo.
select m.match_type, count(*) as filas_a_agregar
from matches m
cross join lateral (values (1, m.player1_id), (2, m.player2_id)) as p(lado, user_id)
where m.status = 'finished'
  and m.winner in (1, 2)
  and m.match_type in ('social', 'quick', 'private')
  and p.user_id is not null
  and p.user_id::text not like '00000000-0000-4000-8000-%'
  and exists (select 1 from users u where u.id = p.user_id)  -- FK a users(id)
  and not exists (
    select 1 from player_battle_history h
    where h.user_id = p.user_id and h.battle_kind = 'match' and h.source_id::text = m.id::text
  )
group by m.match_type;

-- 2) Insertar.
insert into player_battle_history (
  user_id, battle_kind, battle_mode, source_id, result, opponent_label,
  song_name, song_artist, credits_wagered, credits_won, event_label, played_at
)
select p.user_id,
       'match',
       m.match_type,
       m.id,
       case when m.winner = p.lado then 'win' else 'loss' end,
       'Rival',
       case when p.lado = 1 then m.player1_song_name else m.player2_song_name end,
       case when p.lado = 1 then m.player1_song_artist else m.player2_song_artist end,
       coalesce(case when p.lado = 1 then m.player1_bet else m.player2_bet end, 0),
       case when m.winner = p.lado then round(coalesce(m.total_pot, 0) * 0.98, 2) else 0 end,
       upper(m.match_type),
       coalesce(m.finished_at, m.created_at)
from matches m
cross join lateral (values (1, m.player1_id), (2, m.player2_id)) as p(lado, user_id)
where m.status = 'finished'
  and m.winner in (1, 2)
  and m.match_type in ('social', 'quick', 'private')
  and p.user_id is not null
  and p.user_id::text not like '00000000-0000-4000-8000-%'
  and exists (select 1 from users u where u.id = p.user_id)  -- FK a users(id)
on conflict (user_id, battle_kind, source_id) do nothing
returning user_id, source_id, result, credits_won;

-- 3) Jugadores de batallas 1 vs 1 SIN fila en users: su historial no se puede
--    guardar (player_battle_history exige users.id). Si aparece alguien acá,
--    avisar: hay que crearle la fila en users.
select distinct p.user_id, au.email
from matches m
cross join lateral (values (m.player1_id), (m.player2_id)) as p(user_id)
left join auth.users au on au.id = p.user_id
where m.match_type in ('social', 'quick', 'private')
  and p.user_id is not null
  and p.user_id::text not like '00000000-0000-4000-8000-%'
  and not exists (select 1 from users u where u.id = p.user_id);
