-- Diagnóstico v3: buscar directo en player_battle_history (la tabla que
-- alimenta el perfil del jugador) en vez de reconstruir desde matches.
-- Email: homefix.creador@gmail.com

with me as (
  select id from auth.users where email = 'homefix.creador@gmail.com'
)
select
  h.id,
  h.battle_mode,
  h.result,
  h.credits_wagered,
  h.credits_won,
  h.song_name,
  h.song_artist,
  h.source_id,   -- este es el id real en la tabla "matches" para cruzar
  h.played_at
from player_battle_history h, me
where h.user_id = me.id
  and h.result = 'loss'
  and h.credits_wagered > 0
order by h.played_at desc
limit 30;
