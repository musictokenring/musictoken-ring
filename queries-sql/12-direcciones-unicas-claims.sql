-- ============================================================================
-- QUERY 12: Verificar todas las direcciones únicas en claims
-- Muestra todas las direcciones que recibieron claims y sus totales
-- ============================================================================
SELECT 
    recipient_wallet,
    COUNT(*) as claim_count,
    SUM(usdc_amount) as total_usdc,
    MIN(created_at) as first_claim,
    MAX(created_at) as last_claim
FROM claims
GROUP BY recipient_wallet
ORDER BY total_usdc DESC
LIMIT 50;
