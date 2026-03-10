-- Migration: Create vault_transactions table for audit logging
-- This table logs all vault transactions (withdrawals, deposits, fees)
-- to enable security auditing and prevent fraud

CREATE TABLE IF NOT EXISTS vault_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_type VARCHAR(50) NOT NULL, -- 'withdrawal', 'deposit', 'fee'
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    wallet_address VARCHAR(42) NOT NULL, -- Recipient/sender wallet address
    amount_usdc DECIMAL(18, 6) NOT NULL, -- Amount in USDC (6 decimals)
    tx_hash VARCHAR(66), -- Blockchain transaction hash
    reason TEXT, -- Reason for transaction (e.g., 'claim_payout', 'deposit_fee')
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT,
    ip_address VARCHAR(45), -- IP address of requester
    user_agent TEXT, -- User agent of requester
    
    -- Indexes for fast queries
    CONSTRAINT valid_transaction_type CHECK (transaction_type IN ('withdrawal', 'deposit', 'fee')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'completed', 'failed')),
    CONSTRAINT valid_wallet_format CHECK (wallet_address ~ '^0x[a-fA-F0-9]{40}$')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vault_transactions_user_id ON vault_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_wallet_address ON vault_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_status ON vault_transactions(status);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_created_at ON vault_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_tx_hash ON vault_transactions(tx_hash);

-- Index for security queries (find suspicious transactions)
CREATE INDEX IF NOT EXISTS idx_vault_transactions_security ON vault_transactions(transaction_type, status, created_at DESC);

COMMENT ON TABLE vault_transactions IS 'Audit log of all vault transactions for security and compliance';
COMMENT ON COLUMN vault_transactions.transaction_type IS 'Type of transaction: withdrawal, deposit, or fee';
COMMENT ON COLUMN vault_transactions.wallet_address IS 'Wallet address involved in transaction (lowercase)';
COMMENT ON COLUMN vault_transactions.ip_address IS 'IP address of the request (for security tracking)';
COMMENT ON COLUMN vault_transactions.user_agent IS 'User agent of the request (for security tracking)';
