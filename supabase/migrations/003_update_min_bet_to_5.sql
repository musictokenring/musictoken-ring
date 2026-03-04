-- Migration: Update minimum bet to 5 créditos
-- Changes minimum bet requirement from 100 to 5 créditos across all tables

-- ==========================================
-- 1. Update social_challenges table constraint
-- ==========================================

-- Check if social_challenges table exists and update constraint
DO $$
BEGIN
    -- If table exists, drop old constraint and add new one
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'social_challenges') THEN
        -- Drop existing constraint if it exists (may have different names)
        ALTER TABLE social_challenges DROP CONSTRAINT IF EXISTS social_challenges_bet_amount_check;
        ALTER TABLE social_challenges DROP CONSTRAINT IF EXISTS social_challenges_bet_amount_check1;
        
        -- Add new constraint with minimum 5
        ALTER TABLE social_challenges 
        ADD CONSTRAINT social_challenges_bet_amount_check 
        CHECK (bet_amount >= 5);
        
        -- Update comment
        COMMENT ON COLUMN social_challenges.bet_amount IS 'Apuesta mínima: 5 créditos (~$5 USDC)';
        
        RAISE NOTICE 'Constraint actualizado en social_challenges: mínimo ahora es 5 créditos';
    ELSE
        RAISE NOTICE 'Tabla social_challenges no existe aún. Ejecuta create-social-challenges-table.sql primero.';
    END IF;
END $$;

-- ==========================================
-- 2. Verify no existing data violates new constraint
-- ==========================================

-- Check if there are any social_challenges with bet_amount < 5
DO $$
DECLARE
    invalid_count INTEGER;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'social_challenges') THEN
        SELECT COUNT(*) INTO invalid_count
        FROM social_challenges
        WHERE bet_amount < 5;
        
        IF invalid_count > 0 THEN
            RAISE WARNING 'Hay % registros en social_challenges con bet_amount < 5. Estos deben actualizarse manualmente o eliminarse.', invalid_count;
        ELSE
            RAISE NOTICE 'Todos los registros en social_challenges cumplen con el nuevo mínimo de 5 créditos.';
        END IF;
    END IF;
END $$;

-- ==========================================
-- 3. Update platform_settings if min_bet exists
-- ==========================================

-- Update platform_settings.min_bet if the column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'platform_settings' 
        AND column_name = 'min_bet'
    ) THEN
        UPDATE platform_settings
        SET min_bet = 5
        WHERE min_bet > 5 OR min_bet IS NULL;
        
        RAISE NOTICE 'platform_settings.min_bet actualizado a 5 créditos';
    ELSE
        RAISE NOTICE 'Columna platform_settings.min_bet no existe. No se requiere actualización.';
    END IF;
END $$;

-- ==========================================
-- Success message
-- ==========================================
DO $$
BEGIN
    RAISE NOTICE '✅ Migración completada: Mínimo de apuesta actualizado a 5 créditos en todas las tablas relevantes.';
END $$;
