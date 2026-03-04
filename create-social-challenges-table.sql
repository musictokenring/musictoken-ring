-- Tabla para desafíos sociales
CREATE TABLE IF NOT EXISTS social_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id VARCHAR(12) UNIQUE NOT NULL,
    challenger_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    challenger_song_id BIGINT NOT NULL,
    challenger_song_name TEXT NOT NULL,
    challenger_song_artist TEXT NOT NULL,
    challenger_song_image TEXT,
    challenger_song_preview TEXT,
    bet_amount DECIMAL(10, 2) NOT NULL CHECK (bet_amount >= 5),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    accepter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_social_challenges_challenge_id ON social_challenges(challenge_id);
CREATE INDEX IF NOT EXISTS idx_social_challenges_challenger_id ON social_challenges(challenger_id);
CREATE INDEX IF NOT EXISTS idx_social_challenges_accepter_id ON social_challenges(accepter_id);
CREATE INDEX IF NOT EXISTS idx_social_challenges_status ON social_challenges(status);
CREATE INDEX IF NOT EXISTS idx_social_challenges_expires_at ON social_challenges(expires_at);

-- RLS (Row Level Security)
ALTER TABLE social_challenges ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios pueden ver sus propios desafíos y desafíos pendientes
CREATE POLICY "Users can view their own challenges" ON social_challenges
    FOR SELECT USING (auth.uid() = challenger_id OR status = 'pending');

-- Política: Los usuarios pueden crear desafíos
CREATE POLICY "Users can create challenges" ON social_challenges
    FOR INSERT WITH CHECK (auth.uid() = challenger_id);

-- Política: Los usuarios pueden actualizar sus propios desafíos pendientes
CREATE POLICY "Users can update their own pending challenges" ON social_challenges
    FOR UPDATE USING (auth.uid() = challenger_id AND status = 'pending');

-- Función para limpiar desafíos expirados automáticamente
CREATE OR REPLACE FUNCTION cleanup_expired_challenges()
RETURNS void AS $$
BEGIN
    UPDATE social_challenges
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Comentarios
COMMENT ON TABLE social_challenges IS 'Desafíos sociales entre usuarios';
COMMENT ON COLUMN social_challenges.challenge_id IS 'ID único público del desafío (12 caracteres)';
COMMENT ON COLUMN social_challenges.bet_amount IS 'Apuesta mínima: 5 créditos (~$5 USDC)';
COMMENT ON COLUMN social_challenges.expires_at IS 'Fecha de expiración del desafío (7 días por defecto)';
