-- Create swap_logs table to track MTR buy/sell operations
CREATE TABLE IF NOT EXISTS swap_logs (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
    deposit_tx_hash TEXT,
    amount_usdc NUMERIC(18, 6) NOT NULL,
    amount_mtr NUMERIC(18, 18) NOT NULL,
    swap_tx_hash TEXT,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_swap_logs_type ON swap_logs(type);
CREATE INDEX IF NOT EXISTS idx_swap_logs_deposit_tx_hash ON swap_logs(deposit_tx_hash);
CREATE INDEX IF NOT EXISTS idx_swap_logs_swap_tx_hash ON swap_logs(swap_tx_hash);
CREATE INDEX IF NOT EXISTS idx_swap_logs_created_at ON swap_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_swap_logs_status ON swap_logs(status);

-- Comment
COMMENT ON TABLE swap_logs IS 'Logs of automatic MTR buy/sell operations via Uniswap/BaseSwap';
COMMENT ON COLUMN swap_logs.type IS 'Type of swap: buy (USDC->MTR) or sell (MTR->USDC)';
COMMENT ON COLUMN swap_logs.deposit_tx_hash IS 'Transaction hash of the deposit that triggered the swap (for buy operations)';
COMMENT ON COLUMN swap_logs.amount_usdc IS 'Amount of USDC involved in the swap';
COMMENT ON COLUMN swap_logs.amount_mtr IS 'Amount of MTR involved in the swap';
COMMENT ON COLUMN swap_logs.swap_tx_hash IS 'Transaction hash of the swap on Uniswap/BaseSwap';
