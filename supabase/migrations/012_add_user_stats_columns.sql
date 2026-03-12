-- Migration: Add user statistics columns
-- Adds columns to track user game statistics in the users table

-- Add statistics columns to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS total_matches INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS total_wins INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS total_losses INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS total_credits_won DECIMAL(20, 4) DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS total_streams INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS total_wagered DECIMAL(20, 4) DEFAULT 0 NOT NULL;

-- Add comment to columns for documentation
COMMENT ON COLUMN public.users.total_matches IS 'Total number of matches played';
COMMENT ON COLUMN public.users.total_wins IS 'Total number of matches won';
COMMENT ON COLUMN public.users.total_losses IS 'Total number of matches lost';
COMMENT ON COLUMN public.users.total_credits_won IS 'Total credits won from matches';
COMMENT ON COLUMN public.users.total_streams IS 'Total streams accumulated across all matches';
COMMENT ON COLUMN public.users.total_wagered IS 'Total credits wagered in matches';

-- Create index for faster queries on statistics
CREATE INDEX IF NOT EXISTS idx_users_total_matches ON public.users(total_matches);
CREATE INDEX IF NOT EXISTS idx_users_total_wins ON public.users(total_wins);

-- Verify columns were added
DO $$
BEGIN
    RAISE NOTICE '✅ Columnas de estadísticas agregadas a la tabla users';
END $$;
