-- ============================================================================
-- QUERY 10: TODAS las alertas de seguridad (SIN límite de tiempo)
-- Estadísticas generales de alertas de seguridad
-- ============================================================================
SELECT 
    COUNT(*) as total_alerts,
    COUNT(CASE WHEN alert_type = 'WALLET_MISMATCH' THEN 1 END) as wallet_mismatch_alerts,
    COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_alerts,
    COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_alerts,
    COUNT(CASE WHEN resolved = false THEN 1 END) as unresolved_alerts,
    MIN(created_at) as first_alert,
    MAX(created_at) as last_alert
FROM security_alerts;
