-- ============================================================================
-- QUERY 9: Verificar estructura de la tabla 'security_alerts'
-- Ejecuta esta query para confirmar que la tabla existe y ver sus columnas
-- ============================================================================
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'security_alerts'
ORDER BY ordinal_position;
