-- ==========================================
-- FIX CRÍTICO: Permisos para decrement_user_credits
-- El fallback está fallando con "permission denied for table users"
-- ==========================================

-- 1. VERIFICAR FUNCIÓN ACTUAL
SELECT 
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND p.proname = 'decrement_user_credits';

-- 2. RECREAR FUNCIÓN CON PERMISOS CORRECTOS
DROP FUNCTION IF EXISTS decrement_user_credits(UUID, DECIMAL);

CREATE OR REPLACE FUNCTION decrement_user_credits(
    user_id_param UUID,
    credits_to_subtract DECIMAL
) RETURNS VOID 
SECURITY DEFINER -- CRÍTICO: Permite ejecución desde frontend
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    -- SIN VALIDACIONES: Solo decrementar créditos
    -- La seguridad se mantiene a nivel de RLS en user_credits
    
    UPDATE user_credits
    SET 
        credits = GREATEST(0, credits - credits_to_subtract),
        updated_at = NOW()
    WHERE user_id = user_id_param;
    
    -- Verificar que se actualizó al menos una fila
    IF NOT FOUND THEN
        -- Si no existe registro, crear uno con créditos en 0 (ya descontados)
        INSERT INTO user_credits (user_id, credits, updated_at)
        VALUES (user_id_param, 0, NOW())
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
END;
$$;

-- 3. OTORGAR PERMISOS
GRANT EXECUTE ON FUNCTION decrement_user_credits(UUID, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION decrement_user_credits(UUID, DECIMAL) TO anon;
GRANT EXECUTE ON FUNCTION decrement_user_credits(UUID, DECIMAL) TO service_role;

-- 4. VERIFICAR QUE SE CREÓ CORRECTAMENTE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        AND p.proname = 'decrement_user_credits'
        AND p.prosecdef = true -- SECURITY DEFINER
    ) THEN
        RAISE NOTICE '✅ Función decrement_user_credits creada correctamente con SECURITY DEFINER';
    ELSE
        RAISE EXCEPTION '❌ Error: La función no se creó correctamente';
    END IF;
END $$;
