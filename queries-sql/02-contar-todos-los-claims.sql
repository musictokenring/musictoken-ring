-- ============================================================================
-- QUERY 2: Contar TODOS los claims (sin límite de tiempo)
-- Esta query te muestra si hay claims en la base de datos y estadísticas generales
-- ============================================================================
SELECT 
    COUNT(*) as total_claims_all_time,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_claims,
    COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_claims,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_claims,
    MIN(created_at) as first_claim_ever,
    MAX(created_at) as last_claim_ever,
    SUM(usdc_amount) as total_usdc_all_time
FROM claims;
