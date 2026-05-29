-- Torneos Express: CPU fill, bracket y batallas
ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS is_cpu BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS bracket_slot INT;

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS bracket_state JSONB;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS payout_mode TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS human_participants INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tournaments_status_updated
  ON tournaments (status, updated_at DESC);
