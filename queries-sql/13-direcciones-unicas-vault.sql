-- ============================================================================
-- QUERY 13: Verificar todas las direcciones únicas en vault_transactions
-- Muestra todas las direcciones que recibieron retiros del vault y sus totales
-- ============================================================================
SELECT 
    wallet_address,
    COUNT(*) as transaction_count,
    SUM(amount_usdc) as total_usdc,
    MIN(created_at) as first_transaction,
    MAX(created_at) as last_transaction
FROM vault_transactions
WHERE transaction_type = 'withdrawal'
GROUP BY wallet_address
ORDER BY total_usdc DESC
LIMIT 50;
