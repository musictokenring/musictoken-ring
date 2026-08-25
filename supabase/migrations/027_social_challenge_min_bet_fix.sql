-- Migration: corregir el mínimo viejo de apuesta en Desafío Social
-- El check constraint social_challenges_bet_amount_check quedó de cuando
-- el mínimo de desafíos sociales era distinto al resto de los modos.
-- Hoy TODOS los modos (Quick, Sala Privada, Torneo, Social) usan mínimo
-- 1 crédito -- el frontend ya lo hacía así, pero la base seguía rechazando
-- apuestas de 1 crédito con "violates check constraint
-- social_challenges_bet_amount_check" (bug real reportado en vivo).

ALTER TABLE social_challenges
DROP CONSTRAINT IF EXISTS social_challenges_bet_amount_check;

ALTER TABLE social_challenges
ADD CONSTRAINT social_challenges_bet_amount_check CHECK (bet_amount >= 1);
