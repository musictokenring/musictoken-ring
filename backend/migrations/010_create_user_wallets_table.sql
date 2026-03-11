-- ============================================================================
-- Migration 010: Create user_wallets table
-- Purpose: Allow users to link multiple wallets to their account
-- This enables wallet-based authentication in internal wallet browsers
-- ============================================================================

-- Create user_wallets table
CREATE TABLE IF NOT EXISTS user_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(42) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    linked_at TIMESTAMP DEFAULT NOW(),
    linked_via VARCHAR(50), -- 'google', 'email', 'manual', 'auto'
    ip_address VARCHAR(45),
    user_agent TEXT,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_wallet_format CHECK (wallet_address ~ '^0x[a-fA-F0-9]{40}$'),
    CONSTRAINT valid_linked_via CHECK (linked_via IN ('google', 'email', 'manual', 'auto')),
    CONSTRAINT unique_wallet_address UNIQUE (wallet_address)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_wallet_address ON user_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_wallets_is_primary ON user_wallets(is_primary) WHERE is_primary = TRUE;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER trigger_update_user_wallets_updated_at
    BEFORE UPDATE ON user_wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_user_wallets_updated_at();

-- Create function to update last_used_at when wallet is used
CREATE OR REPLACE FUNCTION update_wallet_last_used()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE user_wallets
    SET last_used_at = NOW()
    WHERE wallet_address = LOWER(NEW.wallet_address);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on user_credits to update last_used_at
-- This will track when a wallet is used for operations
CREATE TRIGGER trigger_update_wallet_last_used_on_credits
    AFTER INSERT OR UPDATE ON user_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_wallet_last_used();

-- Add comment to table
COMMENT ON TABLE user_wallets IS 'Stores wallet addresses linked to user accounts. Enables wallet-based authentication in internal wallet browsers.';
COMMENT ON COLUMN user_wallets.is_primary IS 'Indicates if this is the primary wallet for the user';
COMMENT ON COLUMN user_wallets.linked_via IS 'Method used to link the wallet: google, email, manual, or auto';
COMMENT ON COLUMN user_wallets.last_used_at IS 'Last time this wallet was used for an operation';
