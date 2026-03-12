-- ==========================================
-- FIX: Corregir restricción CHECK de match_type para incluir 'social'
-- ==========================================

-- Primero, verificar la restricción actual
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.matches'::regclass
AND conname LIKE '%match_type%';

-- Eliminar la restricción CHECK existente si existe
ALTER TABLE public.matches 
DROP CONSTRAINT IF EXISTS matches_match_type_check;

-- Crear nueva restricción CHECK que incluya 'social'
ALTER TABLE public.matches
ADD CONSTRAINT matches_match_type_check 
CHECK (match_type IN ('quick', 'private', 'practice', 'tournament', 'social'));

-- Verificar que se creó correctamente
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.matches'::regclass
AND conname = 'matches_match_type_check';

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE '✅ Restricción CHECK de match_type actualizada para incluir "social"';
END $$;
