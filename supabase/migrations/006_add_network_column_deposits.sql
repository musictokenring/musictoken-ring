-- Add network column to deposits table to track which network the deposit came from
-- This allows us to process deposits from multiple networks (Base, Ethereum, Polygon, etc.)

DO $$ 
BEGIN
    -- Add network column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'deposits' 
        AND column_name = 'network'
    ) THEN
        ALTER TABLE deposits 
        ADD COLUMN network TEXT DEFAULT 'base';
        
        -- Add comment
        COMMENT ON COLUMN deposits.network IS 'Network where the deposit was made (base, ethereum, polygon, optimism, arbitrum)';
        
        -- Create index for faster queries by network
        CREATE INDEX IF NOT EXISTS idx_deposits_network ON deposits(network);
        
        RAISE NOTICE 'Column network added to deposits table';
    ELSE
        RAISE NOTICE 'Column network already exists in deposits table';
    END IF;
END $$;
