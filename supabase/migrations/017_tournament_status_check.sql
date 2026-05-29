-- Corrige CHECK de status en tournaments (producción tenía valores viejos sin 'locked').
-- Sin esto, al llegar a 00:00 falla: tournaments_status_check

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check;

ALTER TABLE tournaments ADD CONSTRAINT tournaments_status_check
  CHECK (status IN (
    'registration',
    'locked',
    'in_progress',
    'completed',
    'cancelled'
  ));
