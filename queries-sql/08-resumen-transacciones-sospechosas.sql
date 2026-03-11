-- ============================================================================
-- QUERY 8: Resumen de Transacciones Sospechosas (SIN límite de tiempo)
-- Agrupa transacciones sospechosas por dirección y muestra totales
-- ⚠️ ESTA ES UNA DE LAS QUERIES MÁS IMPORTANTES
-- ============================================================================
SELECT 
    vt.wallet_address as suspicious_address,
    COUNT(*) as transaction_count,
    SUM(vt.amount_usdc) as total_usdc,
    MIN(vt.created_at) as first_transaction,
    MAX(vt.created_at) as last_transaction,
    STRING_AGG(DISTINCT vt.reason, ', ') as reasons,
    STRING_AGG(DISTINCT vt.ip_address, ', ') as ip_addresses
FROM vault_transactions vt
LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(vt.wallet_address)
WHERE vt.transaction_type = 'withdrawal'
AND u.id IS NULL  -- Dirección no pertenece a ningún usuario
AND vt.status = 'completed'
GROUP BY vt.wallet_address
ORDER BY total_usdc DESC;
