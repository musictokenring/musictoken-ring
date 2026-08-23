-- Migration: Curador de género por IA para torneos
-- Agrega el resultado del agente curador (agents/curator_agent.py) a cada
-- inscripción de torneo, para poder aplicar la descalificación automática
-- de un campeón cuya canción no encajaba realmente en el género del
-- torneo (ver backend/tournament-battle.js::finalizeTournament).

ALTER TABLE tournament_participants
ADD COLUMN IF NOT EXISTS genre_match_confidence INTEGER,  -- 0-100, del agente curador
ADD COLUMN IF NOT EXISTS genre_match_verdict TEXT,          -- 'match' | 'warn' | 'block'
ADD COLUMN IF NOT EXISTS genre_match_reason TEXT;           -- explicación corta en español, para mostrar al usuario/operador

COMMENT ON COLUMN tournament_participants.genre_match_confidence IS 'Certeza (0-100) del agente curador de que la canción elegida pertenece al género del torneo. Calculado server-side en tournament-service.js::joinTournament, nunca confiado del cliente.';
COMMENT ON COLUMN tournament_participants.genre_match_verdict IS 'match (>=80): sin fricción. warn (50-79): se dejó jugar con aviso, pero si gana el torneo queda descalificado automáticamente. block (<50): la inscripción se rechaza, nunca debería quedar guardada.';
COMMENT ON COLUMN tournament_participants.genre_match_reason IS 'Motivo corto (en español) que dio el agente curador para su veredicto.';
