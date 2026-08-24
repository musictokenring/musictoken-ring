-- Migration: Género opcional + curador de IA para Desafío Social
-- El creador del desafío puede elegir un género (opcional, "Cualquier
-- género" por defecto = sin curación). Si elige uno, tanto su canción
-- como la de quien acepte pasan por el curador de género (ver
-- game-engine.js::createSocialChallenge / acceptSocialChallenge).

ALTER TABLE social_challenges
ADD COLUMN IF NOT EXISTS genre_id TEXT,
ADD COLUMN IF NOT EXISTS genre_label TEXT,
ADD COLUMN IF NOT EXISTS challenger_genre_confidence INTEGER,
ADD COLUMN IF NOT EXISTS challenger_genre_verdict TEXT,
ADD COLUMN IF NOT EXISTS accepter_genre_confidence INTEGER,
ADD COLUMN IF NOT EXISTS accepter_genre_verdict TEXT;

COMMENT ON COLUMN social_challenges.genre_id IS 'Género elegido por el creador del desafío (id de tournament-genres.js), NULL = "Cualquier género", sin curación.';
COMMENT ON COLUMN social_challenges.genre_label IS 'Nombre legible del género elegido (ej. "Salsa"), copiado al crear el desafío.';
COMMENT ON COLUMN social_challenges.challenger_genre_confidence IS 'Confianza (0-100) del curador de IA sobre la canción del creador del desafío, si se eligió género.';
COMMENT ON COLUMN social_challenges.challenger_genre_verdict IS 'match | warn -- block se rechaza antes de crear el desafío, nunca queda guardado.';
COMMENT ON COLUMN social_challenges.accepter_genre_confidence IS 'Confianza (0-100) del curador de IA sobre la canción de quien acepta, si el desafío tiene género.';
COMMENT ON COLUMN social_challenges.accepter_genre_verdict IS 'match | warn -- block se rechaza antes de aceptar, nunca queda guardado.';
