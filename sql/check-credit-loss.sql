-- Diagnóstico: condición de carrera en Modo Rápido (ver commit 5253921)
-- que podía descontar créditos reales de un match que el jugador nunca
-- vio ni jugó (le mostraba una batalla gratis contra la CPU mientras un
-- match real, con su apuesta, se resolvía solo del lado del rival).
--
-- Uso: reemplazá el email de abajo (el que usás para entrar a
-- MusicToken Ring) y corré esto en el SQL Editor de Supabase.

-- PASO 1: confirmar que el email realmente tiene una cuenta.
-- Si esto da 0 filas, el email está mal o la cuenta usa otro método de
-- login (wallet conectada sin email, por ejemplo) -- en ese caso avisame
-- y lo resolvemos de otra forma.
select id, email, created_at
from auth.users
where email = 'TU_EMAIL_ACA@ejemplo.com';

-- PASO 2: TODAS tus batallas recientes (cualquier modo, no solo
-- "quick") -- por si el problema fue en otro lado o el match quedó
-- guardado con un match_type distinto al esperado.
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
where (m.player1_id = me.id or m.player2_id = me.id)
order by m.created_at desc
limit 30;

-- PASO 3: si el PASO 1 dio 0 filas, probá buscar por wallet en vez de
-- email -- reemplazá la dirección de abajo si jugás con wallet conectada.
-- select * from wallet_links where wallet_address ilike 'TU_WALLET_ACA%';
