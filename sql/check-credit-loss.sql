-- Diagnóstico: condición de carrera en Modo Rápido (ver commit 5253921)
-- que podía descontar créditos reales de un match que el jugador nunca
-- vio ni jugó (le mostraba una batalla gratis contra la CPU mientras un
-- match real, con su apuesta, se resolvía solo del lado del rival).
--
-- Uso: reemplazá el email de abajo y corré esto en el SQL Editor de
-- Supabase. Busca tus batallas de Modo Rápido recientes para revisar si
-- alguna quedó "real" (con apuesta) sin que la hayas jugado vos.

with me as (
  select id from auth.users where email = 'TU_EMAIL_ACA@ejemplo.com'
)
select
  m.id,
  m.match_type,
  m.status,
  m.winner,
  m.player1_id,
  m.player2_id,
  m.player1_bet,
  m.player2_bet,
  m.total_pot,
  m.player1_song_name,
  m.player2_song_name,
  m.created_at,
  m.finished_at
from matches m, me
where m.match_type = 'quick'
  and (m.player1_id = me.id or m.player2_id = me.id)
order by m.created_at desc
limit 20;
