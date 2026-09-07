-- ============================================================
-- FASE 1: ARTISTAS + REGALÍAS DE IMPULSO -- 2026-09-07
-- ============================================================
-- Registro de artista + reclamo de canciones + contador de regalías
-- acumuladas por cada batalla real ganada. TODO de solo lectura para el
-- cliente salvo el registro/reclamo inicial (siempre en estado 'pending')
-- -- verificación y acreditación de regalías SOLO las toca el backend con
-- service_role, mismo criterio que bonus_grants hoy. NO hay retiro real
-- todavía (royalty_credits es un balón acumulado, no conectado a
-- credits/saldo retirable) -- eso es la Fase 2, a destrabar cuando el
-- mecanismo legal esté resuelto.
-- ============================================================

CREATE TABLE IF NOT EXISTS artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    contact_email TEXT,
    deezer_artist_id BIGINT,
    spotify_url TEXT,
    instagram_url TEXT,
    verification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    verification_note TEXT,
    royalty_percent NUMERIC NOT NULL DEFAULT 5 CHECK (royalty_percent >= 0 AND royalty_percent <= 50),
    royalty_credits NUMERIC NOT NULL DEFAULT 0, -- acumulado, NO retirable en Fase 1
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS artist_songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    song_id BIGINT NOT NULL UNIQUE, -- id de Deezer, mismo id que matches.player1_song_id/player2_song_id
    song_name TEXT NOT NULL,
    song_artist TEXT NOT NULL,
    song_image TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    wins_count INT NOT NULL DEFAULT 0,
    total_royalties_earned NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artist_royalty_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    artist_song_id UUID NOT NULL REFERENCES artist_songs(id) ON DELETE CASCADE,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL,
    total_pot NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artist_songs_artist_id ON artist_songs(artist_id);
CREATE INDEX IF NOT EXISTS idx_artist_songs_status ON artist_songs(status);
CREATE INDEX IF NOT EXISTS idx_artist_royalty_ledger_artist_id ON artist_royalty_ledger(artist_id);

COMMENT ON TABLE artists IS 'Fase 1: perfil de artista + regalías de impulso acumuladas (NO retirables todavía).';
COMMENT ON COLUMN artists.royalty_credits IS 'Regalías acumuladas por batallas ganadas. NO conectado a credits/saldo retirable -- Fase 2 define cuándo y cómo se destraba.';
COMMENT ON TABLE artist_songs IS 'Canciones reclamadas por un artista, identificadas por su id de Deezer (mismo usado en matches).';
COMMENT ON TABLE artist_royalty_ledger IS 'Auditoría: cada batalla real que generó regalías, cuánto y para qué canción.';

-- ============================================================
-- RLS -- lectura de lo propio bien acotada a auth.uid(), sin el error de
-- esta mañana (nunca "true" ni condiciones que no comparan contra la fila).
-- Registro/reclamo inicial sí se permite desde el cliente (siempre entra
-- en 'pending'); todo lo demás (aprobar, rechazar, acreditar regalías)
-- solo lo toca el backend con service_role -- no hay política de UPDATE
-- para anon/authenticated en ninguna de las tres tablas.
-- ============================================================
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_royalty_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artists can view own profile" ON artists
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can register as artist" ON artists
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Lectura pública de canciones VERIFICADAS -- para mostrar "canción de
-- artista verificado" durante una batalla, a cualquiera mirando (no hace
-- falta sesión). Las 'pending'/'rejected' no son de interés público.
CREATE POLICY "Anyone can view verified artist songs" ON artist_songs
    FOR SELECT USING (status = 'verified');
CREATE POLICY "Artist can view own claimed songs" ON artist_songs
    FOR SELECT USING (artist_id IN (SELECT id FROM artists WHERE user_id = auth.uid()));
CREATE POLICY "Artist can claim a song" ON artist_songs
    FOR INSERT WITH CHECK (artist_id IN (SELECT id FROM artists WHERE user_id = auth.uid()));

CREATE POLICY "Artist can view own royalty ledger" ON artist_royalty_ledger
    FOR SELECT USING (artist_id IN (SELECT id FROM artists WHERE user_id = auth.uid()));


-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('artists', 'artist_songs', 'artist_royalty_ledger');
