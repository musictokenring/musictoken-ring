-- Sistema de torneos: Express (10 min) + Grand Prix semanal por género
-- Si la tabla tournaments YA EXISTE, ejecuta 015_tournament_system_upgrade.sql en su lugar.

CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tournament_type TEXT NOT NULL CHECK (tournament_type IN ('express', 'weekly')),
  genre_id TEXT NOT NULL,
  entry_fee NUMERIC(12, 2) NOT NULL DEFAULT 3,
  prize_pool NUMERIC(12, 2) NOT NULL DEFAULT 0,
  max_participants INT NOT NULL DEFAULT 4,
  min_participants INT NOT NULL DEFAULT 4,
  current_participants INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'registration'
    CHECK (status IN ('registration', 'locked', 'in_progress', 'completed', 'cancelled')),
  slot_key TEXT UNIQUE,
  week_key TEXT,
  registration_opens_at TIMESTAMPTZ,
  registration_closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices (solo si la tabla tiene las columnas; si falla, usa 015)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'tournament_type'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_tournaments_type_status ON tournaments (tournament_type, status);
    CREATE INDEX IF NOT EXISTS idx_tournaments_genre ON tournaments (genre_id);
    CREATE INDEX IF NOT EXISTS idx_tournaments_week_key ON tournaments (week_key);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tournament_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  song_id TEXT,
  song_name TEXT,
  song_artist TEXT,
  song_image TEXT,
  song_preview TEXT,
  placement INT,
  eliminated BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_user ON tournament_participants (user_id);
