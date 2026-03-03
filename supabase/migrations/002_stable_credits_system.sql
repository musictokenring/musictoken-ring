-- Migration: Stable Credits System
-- Updates database schema for stable credits (1 crédito = 1 USDC fijo)
-- Adds vault tracking and fee management

-- Add new columns to deposits table
ALTER TABLE deposits 
ADD COLUMN IF NOT EXISTS usdc_value_at_deposit DECIMAL(20, 6),
ADD COLUMN IF NOT EXISTS deposit_fee DECIMAL(20, 6);

-- Add new columns to claims table
ALTER TABLE claims
ADD COLUMN IF NOT EXISTS withdrawal_fee DECIMAL(20, 6);

-- Create vault_fees table for tracking fees
CREATE TABLE IF NOT EXISTS vault_fees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fee_type TEXT NOT NULL, -- 'deposit', 'bet', 'withdrawal'
    amount DECIMAL(20, 6) NOT NULL,
    source_tx_hash TEXT,
    match_id UUID,
    status TEXT DEFAULT 'pending', -- 'pending', 'sent_to_vault', 'failed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_to_vault_at TIMESTAMPTZ,
    vault_tx_hash TEXT
);

-- Create vault_balance table for tracking vault balance
CREATE TABLE IF NOT EXISTS vault_balance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    balance_usdc DECIMAL(20, 6) DEFAULT 0 NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    last_tx_hash TEXT,
    updated_by TEXT DEFAULT 'system'
);

-- Initialize vault balance if not exists
INSERT INTO vault_balance (balance_usdc, last_updated)
VALUES (0, NOW())
ON CONFLICT DO NOTHING;

-- Create index for vault_fees
CREATE INDEX IF NOT EXISTS idx_vault_fees_type ON vault_fees(fee_type);
CREATE INDEX IF NOT EXISTS idx_vault_fees_status ON vault_fees(status);
CREATE INDEX IF NOT EXISTS idx_vault_fees_match_id ON vault_fees(match_id);

-- Function to update vault balance
CREATE OR REPLACE FUNCTION update_vault_balance(
    amount_to_add DECIMAL,
    tx_hash_param TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE vault_balance
    SET 
        balance_usdc = balance_usdc + amount_to_add,
        last_updated = NOW(),
        last_tx_hash = tx_hash_param
    WHERE id = (SELECT id FROM vault_balance ORDER BY last_updated DESC LIMIT 1);
    
    -- If no row exists, create one
    IF NOT FOUND THEN
        INSERT INTO vault_balance (balance_usdc, last_tx_hash, last_updated)
        VALUES (amount_to_add, tx_hash_param, NOW());
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get current vault balance
CREATE OR REPLACE FUNCTION get_vault_balance()
RETURNS DECIMAL AS $$
DECLARE
    current_balance DECIMAL;
BEGIN
    SELECT balance_usdc INTO current_balance
    FROM vault_balance
    ORDER BY last_updated DESC
    LIMIT 1;
    
    RETURN COALESCE(current_balance, 0);
END;
$$ LANGUAGE plpgsql;

-- Update platform_settings to remove rate dependency (keep for backwards compatibility)
-- Note: rate ya no se usa para créditos, pero mantenemos el campo por compatibilidad
