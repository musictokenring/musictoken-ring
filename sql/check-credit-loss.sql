-- Diagnóstico: condición de carrera en Modo Rápido (ver commit 5253921)
-- que podía descontar créditos reales de un match que el jugador nunca
-- vio ni jugó. Email: homefix.creador@gmail.com

-- Esta vez filtrado SOLO a los modos con dinero real (quick, social,
-- private) -- la consulta anterior traía Modo Práctica, que usa un
-- saldo de prueba aparte y no tiene nada que ver con créditos reales.
with me as (
  select id from auth.users where email = 'homefix.creador@gmail.com'
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
  m.finished_at,
  (m.player1_id = me.id) as fui_player1
from matches m, me
where (m.player1_id = me.id or m.player2_id = me.id)
  and m.match_type in ('quick', 'social', 'private')
order by m.created_at desc
limit 50;
