-- ============================================================================
-- QUERY 4: Resumen de Claims con Wallet Incorrecta (SIN límite de tiempo)
-- Agrupa por wallet de destino y muestra totales robados
-- ⚠️ ESTA ES UNA DE LAS QUERIES MÁS IMPORTANTES
-- ============================================================================
SELECT 
    c.recipient_wallet as suspicious_wallet,
    COUNT(*) as claim_count,
    SUM(c.usdc_amount) as total_usdc,
    MIN(c.created_at) as first_claim,
    MAX(c.created_at) as last_claim,
    STRING_AGG(DISTINCT u.wallet_address, ', ') as user_wallets_affected
FROM claims c
JOIN users u ON c.user_id = u.id
WHERE LOWER(c.recipient_wallet) != LOWER(u.wallet_address)
AND (c.status = 'completed' OR c.status = 'success')
GROUP BY c.recipient_wallet
ORDER BY total_usdc DESC;
