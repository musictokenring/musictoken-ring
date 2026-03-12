-- Migration: Fix RPC function permissions for frontend access
-- Makes increment_user_credits and decrement_user_credits callable from frontend
-- with proper security validation

-- ==========================================
-- 1. RECREATE increment_user_credits WITH SECURITY DEFINER
-- ==========================================

CREATE OR REPLACE FUNCTION increment_user_credits(
    user_id_param UUID,
    credits_to_add DECIMAL
) RETURNS VOID 
SECURITY DEFINER -- CRÍTICO: Permite ejecución desde frontend
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    current_user_id UUID;
    user_wallet TEXT;
BEGIN
    -- Obtener el usuario autenticado actual
    current_user_id := auth.uid();
    
    -- Si hay un usuario autenticado, validar que solo puede incrementar sus propios créditos
    IF current_user_id IS NOT NULL THEN
        -- Obtener wallet del usuario autenticado
        SELECT COALESCE(
            raw_user_meta_data->>'wallet_address',
            email
        )::text INTO user_wallet
        FROM auth.users 
        WHERE id = current_user_id;
        
        -- Verificar que el user_id_param corresponde al usuario autenticado
        IF NOT EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = user_id_param
            AND u.wallet_address = user_wallet
        ) THEN
            RAISE EXCEPTION 'No tienes permiso para incrementar créditos de este usuario';
        END IF;
    END IF;
    
    -- Incrementar créditos (operación atómica)
    INSERT INTO user_credits (user_id, credits, updated_at)
    VALUES (user_id_param, credits_to_add, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        credits = user_credits.credits + credits_to_add,
        updated_at = NOW();
END;
$$;

-- ==========================================
-- 2. RECREATE decrement_user_credits WITH SECURITY DEFINER
-- ==========================================

CREATE OR REPLACE FUNCTION decrement_user_credits(
    user_id_param UUID,
    credits_to_subtract DECIMAL
) RETURNS VOID 
SECURITY DEFINER -- CRÍTICO: Permite ejecución desde frontend
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    current_user_id UUID;
    user_wallet TEXT;
BEGIN
    -- Obtener el usuario autenticado actual
    current_user_id := auth.uid();
    
    -- Si hay un usuario autenticado, validar que solo puede decrementar sus propios créditos
    IF current_user_id IS NOT NULL THEN
        -- Obtener wallet del usuario autenticado
        SELECT COALESCE(
            raw_user_meta_data->>'wallet_address',
            email
        )::text INTO user_wallet
        FROM auth.users 
        WHERE id = current_user_id;
        
        -- Verificar que el user_id_param corresponde al usuario autenticado
        IF NOT EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = user_id_param
            AND u.wallet_address = user_wallet
        ) THEN
            RAISE EXCEPTION 'No tienes permiso para decrementar créditos de este usuario';
        END IF;
    END IF;
    
    -- Decrementar créditos (operación atómica)
    UPDATE user_credits
    SET 
        credits = GREATEST(0, credits - credits_to_subtract),
        updated_at = NOW()
    WHERE user_id = user_id_param;
END;
$$;

-- ==========================================
-- 3. GRANT EXECUTE PERMISSIONS
-- ==========================================

-- Permitir que usuarios autenticados ejecuten estas funciones
GRANT EXECUTE ON FUNCTION increment_user_credits(UUID, DECIMAL) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION decrement_user_credits(UUID, DECIMAL) TO authenticated, anon;

-- ==========================================
-- 4. VERIFY FUNCTIONS
-- ==========================================

DO $$
BEGIN
    -- Verificar que las funciones existen y tienen SECURITY DEFINER
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        AND p.proname = 'increment_user_credits'
        AND p.prosecdef = true -- SECURITY DEFINER
    ) THEN
        RAISE NOTICE '✅ increment_user_credits tiene SECURITY DEFINER';
    ELSE
        RAISE WARNING '❌ increment_user_credits NO tiene SECURITY DEFINER';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        AND p.proname = 'decrement_user_credits'
        AND p.prosecdef = true -- SECURITY DEFINER
    ) THEN
        RAISE NOTICE '✅ decrement_user_credits tiene SECURITY DEFINER';
    ELSE
        RAISE WARNING '❌ decrement_user_credits NO tiene SECURITY DEFINER';
    END IF;
END $$;

-- ==========================================
-- SUCCESS MESSAGE
-- ==========================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migración de permisos RPC completada:';
    RAISE NOTICE '   - increment_user_credits ahora tiene SECURITY DEFINER';
    RAISE NOTICE '   - decrement_user_credits ahora tiene SECURITY DEFINER';
    RAISE NOTICE '   - Validación de seguridad: usuarios solo pueden modificar sus propios créditos';
    RAISE NOTICE '   - Permisos GRANT otorgados a authenticated y anon';
END $$;
