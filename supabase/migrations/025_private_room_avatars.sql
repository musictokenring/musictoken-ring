-- Migration: Avatares de jugador para Sala Privada
-- Cada jugador elige un emoji como avatar al crear/unirse a una sala
-- privada. Se muestra en la pantalla de batalla junto a su canción
-- (ver game-engine.js::createBattleUI). Solo aplica a match_type='private'.

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS player1_avatar TEXT,
ADD COLUMN IF NOT EXISTS player2_avatar TEXT;

COMMENT ON COLUMN matches.player1_avatar IS 'Emoji elegido por el jugador que crea la sala privada (opcional, solo Sala Privada).';
COMMENT ON COLUMN matches.player2_avatar IS 'Emoji elegido por el jugador que se une a la sala privada (opcional, solo Sala Privada).';
