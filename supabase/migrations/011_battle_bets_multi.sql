-- Migration: Apuestas multi-fan por batalla, con reparto 80/10/10
-- Modelo de negocio (confirmado con el usuario 2026-08-17):
--   80% del pozo total -> repartido proporcionalmente entre quienes
--     apostaron por el lado ganador
--   10% del pozo total -> artista/lado ganador (partner)
--   10% del pozo total -> plataforma
-- Tabla nueva, aditiva. No modifica matches/tournaments existentes.

CREATE TABLE IF NOT EXISTS battle_bets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    battle_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    side TEXT NOT NULL CHECK (side IN ('player1', 'player2')),
    amount DECIMAL(20, 4) NOT NULL CHECK (amount > 0),
    settled BOOLEAN NOT NULL DEFAULT FALSE,
    payout_credits DECIMAL(20, 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_battle_bets_battle_id ON battle_bets(battle_id);
CREATE INDEX IF NOT EXISTS idx_battle_bets_user_id ON battle_bets(user_id);
CREATE INDEX IF NOT EXISTS idx_battle_bets_battle_settled ON battle_bets(battle_id, settled);

-- Una batalla no debe poder liquidarse dos veces: guardamos el resultado
-- agregado una sola vez por battle_id.
CREATE TABLE IF NOT EXISTS battle_settlements (
    battle_id UUID PRIMARY KEY,
    winning_side TEXT NOT NULL CHECK (winning_side IN ('player1', 'player2')),
    total_pool DECIMAL(20, 4) NOT NULL,
    platform_cut DECIMAL(20, 4) NOT NULL,
    artist_cut DECIMAL(20, 4) NOT NULL,
    winner_pool DECIMAL(20, 4) NOT NULL,
    artist_user_id UUID REFERENCES users(id),
    settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
