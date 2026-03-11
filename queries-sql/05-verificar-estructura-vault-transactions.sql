-- ============================================================================
-- QUERY 5: Verificar estructura de la tabla 'vault_transactions'
-- Ejecuta esta query para confirmar que la tabla existe y ver sus columnas
-- ============================================================================
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'vault_transactions'
ORDER BY ordinal_position;
