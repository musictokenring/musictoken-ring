-- Producción: tablas antiguas pueden carecer de joined_at (015 no la añade con ALTER).
ALTER TABLE tournament_participants
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
