-- Migration: Relax RPC function permissions for automatic conversion
-- Makes increment_user_credits more permissive for automatic MTR conversion
-- Allows conversion even if user is not fully authenticated (wallet-only users)

-- ==========================================
-- RECREATE increment_user_credits WITH RELAXED VALIDATION
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
    param_user_wallet TEXT;
BEGIN
    -- Obtener el usuario autenticado actual (si existe)
    current_user_id := auth.uid();
    
    -- Obtener wallet del user_id_param
    SELECT wallet_address INTO param_user_wallet
    FROM public.users
    WHERE id = user_id_param;
    
    -- Si no existe el usuario, crear un registro básico
    IF param_user_wallet IS NULL THEN
        RAISE EXCEPTION 'Usuario no encontrado con ID: %', user_id_param;
    END IF;
    
    -- Si hay un usuario autenticado, validar que solo puede incrementar sus propios créditos
    -- PERO: Permitir si no hay usuario autenticado (para wallet-only users)
    IF current_user_id IS NOT NULL THEN
        -- Obtener wallet del usuario autenticado
        SELECT COALESCE(
            raw_user_meta_data->>'wallet_address',
            email
        )::text INTO user_wallet
        FROM auth.users 
        WHERE id = current_user_id;
        
        -- Verificar que el user_id_param corresponde al usuario autenticado
        -- PERO: Si las wallets coinciden, permitir (más flexible)
        IF user_wallet IS NOT NULL AND user_wallet != param_user_wallet THEN
            -- Verificar si el usuario autenticado tiene un registro en public.users con esa wallet
            IF NOT EXISTS (
                SELECT 1 FROM public.users u
                WHERE u.id = user_id_param
                AND u.wallet_address = user_wallet
            ) THEN
                RAISE EXCEPTION 'No tienes permiso para incrementar créditos de este usuario';
            END IF;
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
-- GRANT EXECUTE PERMISSIONS
-- ==========================================

-- Permitir que usuarios autenticados y anónimos ejecuten esta función
GRANT EXECUTE ON FUNCTION increment_user_credits(UUID, DECIMAL) TO authenticated, anon;

-- ==========================================
-- VERIFY FUNCTION
-- ==========================================

DO $$
BEGIN
    -- Verificar que la función existe y tiene SECURITY DEFINER
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        AND p.proname = 'increment_user_credits'
        AND p.prosecdef = true -- SECURITY DEFINER
    ) THEN
        RAISE NOTICE '✅ increment_user_credits tiene SECURITY DEFINER y validación relajada';
    ELSE
        RAISE WARNING '❌ increment_user_credits NO tiene SECURITY DEFINER';
    END IF;
END $$;

-- ==========================================
-- SUCCESS MESSAGE
-- ==========================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migración de permisos RPC relajados completada:';
    RAISE NOTICE '   - increment_user_credits ahora tiene validación más permisiva';
    RAISE NOTICE '   - Permite conversión automática para usuarios wallet-only';
    RAISE NOTICE '   - Mantiene seguridad para usuarios autenticados';
END $$;
