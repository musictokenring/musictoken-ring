-- Diagnóstico v5: torneo Express del 14 sep (9cd13e87-...).
--
-- Resultado de v4: el torneo tuvo 1 solo humano (HOMEFIX APP) + 3 CPU.
-- Con menos de 2 humanos el backend DEVUELVE la inscripción
-- (tournament-battle.js, notEnoughHumans, activo desde el 23 ago). Pero el
-- historial igual registraba "Derrota · N MTR apostados", como si se hubiera
-- perdido. Esta consulta confirma si el reembolso se hizo.

-- 1) ¿El torneo marcó el reembolso?
--    refunded_not_enough_humans = true  -> la inscripción se devolvió
--    (solo fallaría si el RPC dio error, cosa que queda en los logs de Render).
select
  id,
  name,
  status,
  entry_fee,
  bracket_state->>'humanCount'              as human_count,
  bracket_state->>'cpuCount'                as cpu_count,
  bracket_state->>'refundedNotEnoughHumans' as refunded_not_enough_humans,
  bracket_state->>'genreDisqualified'       as genre_disqualified,
  bracket_state->>'prizeAwarded'            as prize_awarded,
  bracket_state->>'resultMessage'           as result_message,
  updated_at
from tournaments
where id = '9cd13e87-9d9d-46e7-adc0-3f7bd99272be';

-- 2) OPCIONAL, solo si (1) dio refunded_not_enough_humans = true:
--    corrige las filas del historial de TODOS los torneos reembolsados, para
--    que dejen de mostrar MTR "apostados" que en realidad se devolvieron.
--    Solo toca player_battle_history (lo que se muestra); no mueve saldo.
-- update player_battle_history h
-- set credits_wagered = 0,
--     event_label = coalesce(h.event_label, 'Torneo') || ' · Inscripción devuelta'
-- from tournaments t
-- where h.battle_kind = 'tournament'
--   and h.source_id = t.id
--   and h.credits_wagered > 0
--   and (t.bracket_state->>'refundedNotEnoughHumans' = 'true'
--        or t.bracket_state->>'genreDisqualified' = 'true')
-- returning h.id, h.user_id, h.event_label, h.played_at;
