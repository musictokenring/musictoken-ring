-- Migration: Automated Credits System
-- Creates tables for credits, deposits, claims, and settings

-- Users table (if not exists)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User credits balance
CREATE TABLE IF NOT EXISTS user_credits (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    credits DECIMAL(20, 4) DEFAULT 0 NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deposits tracking
CREATE TABLE IF NOT EXISTS deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tx_hash TEXT UNIQUE NOT NULL,
    token TEXT NOT NULL, -- 'MTR' or 'USDC'
    amount DECIMAL(20, 8) NOT NULL,
    credits_awarded DECIMAL(20, 4) NOT NULL,
    rate_used DECIMAL(10, 2) NOT NULL,
    status TEXT DEFAULT 'processed', -- 'processed', 'failed'
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Claims tracking
CREATE TABLE IF NOT EXISTS claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    credits_amount DECIMAL(20, 4) NOT NULL,
    mtr_equivalent DECIMAL(20, 8) NOT NULL,
    usdc_amount DECIMAL(20, 6) NOT NULL,
    mtr_price_used DECIMAL(20, 8) NOT NULL,
    rate_used DECIMAL(10, 2) NOT NULL,
    recipient_wallet TEXT NOT NULL,
    tx_hash TEXT,
    status TEXT DEFAULT 'processing', -- 'processing', 'completed', 'failed'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Platform settings
CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    mtr_usdc_price DECIMAL(20, 8),
    mtr_to_credit_rate DECIMAL(10, 2),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rate changes log
CREATE TABLE IF NOT EXISTS rate_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    old_rate DECIMAL(10, 2) NOT NULL,
    new_rate DECIMAL(10, 2) NOT NULL,
    old_price DECIMAL(20, 8),
    new_price DECIMAL(20, 8),
    change_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Match wins tracking (for credits awarded)
CREATE TABLE IF NOT EXISTS match_wins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    match_id UUID,
    credits_won DECIMAL(20, 4) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_tx_hash ON deposits(tx_hash);
CREATE INDEX IF NOT EXISTS idx_claims_user_id ON claims(user_id);
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_match_wins_user_id ON match_wins(user_id);

-- Function to increment user credits (atomic)
CREATE OR REPLACE FUNCTION increment_user_credits(
    user_id_param UUID,
    credits_to_add DECIMAL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO user_credits (user_id, credits, updated_at)
    VALUES (user_id_param, credits_to_add, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        credits = user_credits.credits + credits_to_add,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to decrement user credits (atomic)
CREATE OR REPLACE FUNCTION decrement_user_credits(
    user_id_param UUID,
    credits_to_subtract DECIMAL
) RETURNS VOID AS $$
BEGIN
    UPDATE user_credits
    SET 
        credits = GREATEST(0, credits - credits_to_subtract),
        updated_at = NOW()
    WHERE user_id = user_id_param;
END;
$$ LANGUAGE plpgsql;

-- Initialize platform settings
INSERT INTO platform_settings (key, mtr_usdc_price, mtr_to_credit_rate)
VALUES ('mtr_usdc_price', 0.001, 778)
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_settings (key, mtr_to_credit_rate)
VALUES ('mtr_to_credit_rate', 778)
ON CONFLICT (key) DO NOTHING;
