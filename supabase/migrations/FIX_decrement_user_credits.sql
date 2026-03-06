-- Fix: Crear función decrement_user_credits si no existe
-- Esta función debería estar en la migración 001 pero puede faltar

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

-- Comentario
COMMENT ON FUNCTION decrement_user_credits(UUID, DECIMAL) IS 
'Decrementa créditos de un usuario de forma atómica. No permite valores negativos (mínimo 0).';

-- Verificar que la función existe
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'decrement_user_credits'
    ) THEN
        RAISE NOTICE '✅ Función decrement_user_credits creada exitosamente';
    ELSE
        RAISE WARNING '❌ Error: La función decrement_user_credits no se pudo crear';
    END IF;
END $$;
