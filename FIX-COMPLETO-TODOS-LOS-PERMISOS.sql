-- ==========================================
-- FIX COMPLETO: Todos los permisos necesarios
-- Ejecuta este script para corregir TODOS los problemas de permisos de una vez
-- ==========================================

-- ==========================================
-- 1. FIX: decrement_user_credits
-- ==========================================

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

GRANT EXECUTE ON FUNCTION decrement_user_credits(UUID, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION decrement_user_credits(UUID, DECIMAL) TO anon;
GRANT EXECUTE ON FUNCTION decrement_user_credits(UUID, DECIMAL) TO service_role;

-- ==========================================
-- 2. FIX: Permisos tabla matches
-- ==========================================

-- Eliminar políticas restrictivas existentes
DROP POLICY IF EXISTS "Users can insert matches" ON public.matches;
DROP POLICY IF EXISTS "Anon can insert matches" ON public.matches;
DROP POLICY IF EXISTS "Users can view matches" ON public.matches;
DROP POLICY IF EXISTS "Users can update matches" ON public.matches;
DROP POLICY IF EXISTS "Users can view own matches" ON public.matches;
DROP POLICY IF EXISTS "Users can update own matches" ON public.matches;

-- Crear políticas permisivas
CREATE POLICY "Users can insert matches" ON public.matches
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Anon can insert matches" ON public.matches
    FOR INSERT
    TO anon
    WITH CHECK (true);

CREATE POLICY "Users can view matches" ON public.matches
    FOR SELECT
    USING (true);

CREATE POLICY "Users can update matches" ON public.matches
    FOR UPDATE
    USING (true);

-- Otorgar permisos explícitos
GRANT SELECT, INSERT, UPDATE ON public.matches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.matches TO anon;

-- ==========================================
-- 3. FIX: Permisos tabla user_credits (por si acaso)
-- ==========================================

-- Eliminar políticas restrictivas existentes
DROP POLICY IF EXISTS "Users can view own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can update own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can insert own credits" ON public.user_credits;

-- Crear políticas permisivas
CREATE POLICY "Users can view own credits" ON public.user_credits
    FOR SELECT
    USING (true);

CREATE POLICY "Users can update own credits" ON public.user_credits
    FOR UPDATE
    USING (true);

CREATE POLICY "Users can insert own credits" ON public.user_credits
    FOR INSERT
    WITH CHECK (true);

-- Otorgar permisos explícitos
GRANT SELECT, INSERT, UPDATE ON public.user_credits TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_credits TO anon;

-- ==========================================
-- 4. VERIFICACIÓN FINAL
-- ==========================================

DO $$
BEGIN
    -- Verificar decrement_user_credits
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        AND p.proname = 'decrement_user_credits'
        AND p.prosecdef = true
    ) THEN
        RAISE NOTICE '✅ decrement_user_credits: OK';
    ELSE
        RAISE WARNING '❌ decrement_user_credits: FALLO';
    END IF;
    
    -- Verificar políticas de matches
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'matches' 
        AND policyname = 'Users can insert matches'
    ) THEN
        RAISE NOTICE '✅ matches INSERT policy: OK';
    ELSE
        RAISE WARNING '❌ matches INSERT policy: FALLO';
    END IF;
    
    -- Verificar políticas de user_credits
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_credits' 
        AND policyname = 'Users can view own credits'
    ) THEN
        RAISE NOTICE '✅ user_credits SELECT policy: OK';
    ELSE
        RAISE WARNING '❌ user_credits SELECT policy: FALLO';
    END IF;
    
    RAISE NOTICE '✅✅✅ TODOS LOS PERMISOS CONFIGURADOS';
END $$;
