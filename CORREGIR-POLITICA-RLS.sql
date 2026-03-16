-- ============================================================
-- CORRECCIÓN URGENTE: Política RLS con error tipográfico
-- Este script corrige la política RLS que tiene auth.uid() - id
-- Debe ser auth.uid() = id (igualdad, no resta)
-- ============================================================

-- Eliminar política incorrecta si existe
DROP POLICY IF EXISTS "Users can view own data" ON users;

-- Crear política correcta con soporte para email
-- CRÍTICO: Usar EXECUTE format para evitar validación prematura de sintaxis
DO $$
DECLARE
    email_column_exists BOOLEAN;
BEGIN
    -- Verificar si la columna email existe
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'email'
    ) INTO email_column_exists;
    
    -- Crear política según si email existe
    IF email_column_exists THEN
        -- Política con soporte para email (CORREGIDA: usar = no -)
        EXECUTE format('
            CREATE POLICY "Users can view own data" ON users
                FOR SELECT
                USING (
                    auth.uid() = id OR
                    (email IS NOT NULL AND email = (SELECT email FROM auth.users WHERE id = auth.uid()))
                )
        ');
        RAISE NOTICE '✅ Política RLS CORREGIDA con soporte para email';
    ELSE
        -- Política básica sin email (CORREGIDA: usar = no -)
        CREATE POLICY "Users can view own data" ON users
            FOR SELECT
            USING (auth.uid() = id);
        RAISE NOTICE '✅ Política RLS CORREGIDA sin soporte para email';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Fallback: política básica si hay cualquier error (CORREGIDA: usar = no -)
        DROP POLICY IF EXISTS "Users can view own data" ON users;
        CREATE POLICY "Users can view own data" ON users
            FOR SELECT
            USING (auth.uid() = id);
        RAISE NOTICE '⚠️ Error creando política, usando política básica: %', SQLERRM;
END $$;

-- Verificar que la política se creó correctamente
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'users' 
AND policyname = 'Users can view own data';

SELECT '✅ Política RLS corregida exitosamente!' AS resultado;
