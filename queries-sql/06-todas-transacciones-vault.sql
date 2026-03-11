-- ============================================================================
-- QUERY 6: TODAS las transacciones del vault (SIN límite de tiempo)
-- Estadísticas generales de todas las transacciones del vault
-- ============================================================================
SELECT 
    COUNT(*) as total_vault_transactions,
    COUNT(CASE WHEN transaction_type = 'withdrawal' THEN 1 END) as withdrawals,
    COUNT(CASE WHEN transaction_type = 'deposit' THEN 1 END) as deposits,
    COUNT(CASE WHEN transaction_type = 'fee' THEN 1 END) as fees,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
    MIN(created_at) as first_transaction,
    MAX(created_at) as last_transaction,
    SUM(CASE WHEN transaction_type = 'withdrawal' AND status = 'completed' THEN amount_usdc ELSE 0 END) as total_withdrawn
FROM vault_transactions;
