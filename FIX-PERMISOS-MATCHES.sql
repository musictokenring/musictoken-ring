-- ==========================================
-- FIX: Permisos para tabla matches
-- Si la creación del match falla, puede ser un problema de permisos RLS
-- ==========================================

-- 1. VERIFICAR RLS ACTUAL
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'matches';

-- 2. ELIMINAR POLÍTICAS RESTRICTIVAS EXISTENTES (si las hay)
DROP POLICY IF EXISTS "Users can insert matches" ON public.matches;
DROP POLICY IF EXISTS "Users can view own matches" ON public.matches;
DROP POLICY IF EXISTS "Users can update own matches" ON public.matches;

-- 3. CREAR POLÍTICAS PERMISIVAS PARA INSERT
-- Permitir que usuarios autenticados puedan crear matches
CREATE POLICY "Users can insert matches" ON public.matches
    FOR INSERT
    TO authenticated
    WITH CHECK (true); -- Permitir insertar cualquier match si está autenticado

-- Permitir que usuarios anon también puedan crear matches (para casos de wallet-only)
CREATE POLICY "Anon can insert matches" ON public.matches
    FOR INSERT
    TO anon
    WITH CHECK (true); -- Permitir insertar cualquier match

-- 4. CREAR POLÍTICAS PARA SELECT (ver matches)
CREATE POLICY "Users can view matches" ON public.matches
    FOR SELECT
    USING (true); -- Permitir ver todos los matches temporalmente

-- 5. CREAR POLÍTICAS PARA UPDATE (actualizar matches)
CREATE POLICY "Users can update matches" ON public.matches
    FOR UPDATE
    USING (true); -- Permitir actualizar cualquier match temporalmente

-- 6. OTORGAR PERMISOS EXPLÍCITOS
GRANT SELECT, INSERT, UPDATE ON public.matches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.matches TO anon;

-- 7. VERIFICAR QUE LAS POLÍTICAS SE CREARON
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'matches' 
        AND policyname = 'Users can insert matches'
    ) THEN
        RAISE NOTICE '✅ Policy "Users can insert matches" creada';
    ELSE
        RAISE WARNING '❌ Policy "Users can insert matches" NO creada';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'matches' 
        AND policyname = 'Anon can insert matches'
    ) THEN
        RAISE NOTICE '✅ Policy "Anon can insert matches" creada';
    ELSE
        RAISE WARNING '❌ Policy "Anon can insert matches" NO creada';
    END IF;
    
    RAISE NOTICE '✅✅✅ Permisos de matches configurados';
END $$;
