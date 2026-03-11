-- ============================================================================
-- QUERY 1: Verificar estructura de la tabla 'claims'
-- Ejecuta esta query primero para confirmar que la tabla existe y ver sus columnas
-- ============================================================================
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'claims'
ORDER BY ordinal_position;
