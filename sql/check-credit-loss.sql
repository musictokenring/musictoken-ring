-- Diagnóstico: condición de carrera en Modo Rápido (ver commit 5253921)
-- que podía descontar créditos reales de un match que el jugador nunca
-- vio ni jugó (le mostraba una batalla gratis contra la CPU mientras un
-- match real, con su apuesta, se resolvía solo del lado del rival).
--
-- Email ya cargado: homefix.creador@gmail.com

-- PASO 1: confirmar que el email realmente tiene una cuenta.
-- Si esto da 0 filas, la cuenta usa otro método de login (wallet
-- conectada sin este email, por ejemplo) -- avisame y lo resolvemos
-- por wallet en vez de por email (ver Paso 3 más abajo).
select id, email, created_at
from auth.users
where email = 'homefix.creador@gmail.com';

-- PASO 2: TODAS tus batallas recientes (cualquier modo, no solo
-- "quick") -- por si el problema fue en otro lado o el match quedó
-- guardado con un match_type distinto al esperado.
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
  m.finished_at
from matches m, me
where (m.player1_id = me.id or m.player2_id = me.id)
order by m.created_at desc
limit 30;

-- PASO 3: si el PASO 1 dio 0 filas, probá buscar por wallet en vez de
-- email -- reemplazá la dirección de abajo si jugás con wallet conectada.
-- select * from wallet_links where wallet_address ilike 'TU_WALLET_ACA%';
