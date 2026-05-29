-- Producción: algunas tablas tournament_participants no tienen columna id.
-- El backend ya funciona sin id; esta migración la añade opcionalmente.

ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

UPDATE tournament_participants SET id = gen_random_uuid() WHERE id IS NULL;
