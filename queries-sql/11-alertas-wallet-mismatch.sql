-- ============================================================================
-- QUERY 11: Alertas de Wallet Mismatch (SIN límite de tiempo)
-- Muestra todas las alertas de wallet mismatch detectadas
-- ============================================================================
SELECT 
    sa.id,
    sa.alert_type,
    sa.severity,
    sa.details,
    sa.user_id,
    u.wallet_address as user_wallet,
    sa.ip_address,
    sa.user_agent,
    sa.resolved,
    sa.created_at
FROM security_alerts sa
LEFT JOIN users u ON sa.user_id = u.id
WHERE sa.alert_type = 'WALLET_MISMATCH'
ORDER BY sa.created_at DESC
LIMIT 100;
