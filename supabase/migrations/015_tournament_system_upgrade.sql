-- Actualiza tournaments / tournament_participants al esquema Express + Grand Prix (14 géneros).
-- Ejecutar si 014 falló con: column "tournament_type" does not exist

-- ── tournaments: columnas nuevas ─────────────────────────────────────────────
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS tournament_type TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS genre_id TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS min_participants INT NOT NULL DEFAULT 4;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS slot_key TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS week_key TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_opens_at TIMESTAMPTZ;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_closes_at TIMESTAMPTZ;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Valores por defecto en filas antiguas
UPDATE tournaments
SET tournament_type = COALESCE(tournament_type, 'weekly'),
    genre_id = COALESCE(genre_id, 'reggaeton'),
    min_participants = COALESCE(min_participants, 4),
    max_participants = COALESCE(max_participants, 16),
    entry_fee = COALESCE(entry_fee, 15),
    prize_pool = COALESCE(prize_pool, 0),
    current_participants = COALESCE(current_participants, 0),
    status = COALESCE(status, 'registration')
WHERE tournament_type IS NULL OR genre_id IS NULL;

ALTER TABLE tournaments ALTER COLUMN tournament_type SET DEFAULT 'weekly';
ALTER TABLE tournaments ALTER COLUMN genre_id SET DEFAULT 'reggaeton';

-- NOT NULL (solo si ya no lo es)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments'
      AND column_name = 'tournament_type' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE tournaments ALTER COLUMN tournament_type SET NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments'
      AND column_name = 'genre_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE tournaments ALTER COLUMN genre_id SET NOT NULL;
  END IF;
END $$;

-- slot_key único (ignorar si ya existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tournaments_slot_key_key'
  ) THEN
    ALTER TABLE tournaments ADD CONSTRAINT tournaments_slot_key_key UNIQUE (slot_key);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── tournament_participants ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, user_id)
);

ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS song_id TEXT;
ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS song_name TEXT;
ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS song_artist TEXT;
ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS song_image TEXT;
ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS song_preview TEXT;
ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS placement INT;
ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS eliminated BOOLEAN NOT NULL DEFAULT FALSE;

-- ── índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tournaments_type_status ON tournaments (tournament_type, status);
CREATE INDEX IF NOT EXISTS idx_tournaments_genre ON tournaments (genre_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_week_key ON tournaments (week_key);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_user ON tournament_participants (user_id);
