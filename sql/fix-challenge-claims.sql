-- ============================================================
-- DESAFÍOS SOCIALES QUE QUEDARON 'pending' AUNQUE SE JUGARON
-- ============================================================
-- Hasta 2026-09-27 quien aceptaba un desafío intentaba marcarlo como
-- 'accepted' desde el navegador, y la RLS de social_challenges (solo el
-- creador puede tocar su fila) lo bloqueaba en silencio. Resultado: el
-- desafío seguía 'pending' aunque ya se hubiera jugado, y
--   a) se podía aceptar otra vez (otra partida contando la apuesta del
--      creador, que se pagó una sola vez), y
--   b) a los 7 días "vencía" y /api/challenges/:id/status le devolvía al
--      creador una apuesta que ya se había jugado.
-- El código nuevo lo marca desde el backend. Esto corrige lo que ya pasó.
-- Correr las partes en orden, de a una (seleccionar y Run).


-- 1) DIAGNÓSTICO (solo lectura): desafíos 'pending' o 'expired' que SÍ
--    tuvieron partida. Se empareja por creador + canción + apuesta, en la
--    ventana de vida del desafío.
select c.challenge_id, c.status, c.stake_type, c.bet_amount, c.created_at,
       count(m.id)                                   as partidas,
       count(m.id) filter (where m.status = 'finished') as terminadas,
       min(m.player2_id::text)                       as accepter_probable
from social_challenges c
join matches m
  on m.match_type = 'social'
 and m.player1_id = c.challenger_id
 and m.player1_song_id = c.challenger_song_id
 and m.player1_bet = c.bet_amount
 and m.created_at >= c.created_at
 and m.created_at <= coalesce(c.expires_at, c.created_at + interval '7 days')
where c.status in ('pending', 'expired')
group by c.challenge_id, c.status, c.stake_type, c.bet_amount, c.created_at
order by c.created_at desc;
-- 'expired' con partidas terminadas = el creador cobró un reembolso de
-- más al vencer (bet_amount por desafío). 'pending' con partidas = todavía
-- no pasó, lo evita el paso 2. partidas > 1 = se aceptó más de una vez.


-- 2) CORRECCIÓN: marcar como 'accepted' los 'pending' que ya se jugaron,
--    así nunca "vencen" ni se vuelven a aceptar.
update social_challenges c
set status = 'accepted',
    accepter_id = m.player2_id,
    accepted_at = m.created_at
from (
    select distinct on (c2.id) c2.id as challenge_row_id, m2.player2_id, m2.created_at
    from social_challenges c2
    join matches m2
      on m2.match_type = 'social'
     and m2.player1_id = c2.challenger_id
     and m2.player1_song_id = c2.challenger_song_id
     and m2.player1_bet = c2.bet_amount
     and m2.created_at >= c2.created_at
     and m2.created_at <= coalesce(c2.expires_at, c2.created_at + interval '7 days')
    where c2.status = 'pending'
    order by c2.id, m2.created_at
) m
where c.id = m.challenge_row_id
  and c.status = 'pending'
returning c.challenge_id, c.status, c.accepter_id;


-- 3) Caso puntual del 2026-09-27 (desafío 6DSTD9ZH67MZ): se aceptó dos
--    veces. La partida fantasma a74b7fee se canceló con reembolso a los dos:
--    correcto para quien aceptó (se le había cobrado doble), pero el creador
--    recibió 1 crédito que ya se había jugado en la partida 749bf11c.
--    Revertir ese crédito (cuentas de prueba propias -- opcional):
-- select public.decrement_user_credits(user_id_param => '978e9e29-11b0-405d-bf68-b20622016aad', credits_to_subtract => 1);
