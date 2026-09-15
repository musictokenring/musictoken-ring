-- Diagnóstico v4: la pérdida más reciente (14 sep) fue en un TORNEO
-- EXPRESS (battle_mode='express'), no en Modo Rápido -- es otro sistema,
-- con brackets y participantes CPU. Esto mira el torneo puntual.

-- El source_id de la fila más reciente en player_battle_history
-- (14 sep 06:18, "You Give Love A Bad Name") es el id del torneo:
select *
from tournaments
where id = '9cd13e87-9d9d-46e7-adc0-3f7bd99272be';

-- Participantes de ESE torneo -- para ver quiénes eran (humanos o CPU,
-- columna is_cpu) y en qué posición quedó cada uno.
select
  id, user_id, song_name, song_artist, placement, eliminated,
  is_cpu, display_name, bracket_slot, joined_at
from tournament_participants
where tournament_id = '9cd13e87-9d9d-46e7-adc0-3f7bd99272be'
order by bracket_slot;
