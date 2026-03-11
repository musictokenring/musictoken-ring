-- ============================================================================
-- QUERIES SQL PARA INVESTIGAR LA FUGA DE FONDOS DEL VAULT
-- Ejecuta estas queries en Supabase → SQL Editor
-- ============================================================================

-- ============================================================================
-- QUERY 1: Claims con Wallet Incorrecta
-- Encuentra todos los claims donde la wallet de destino NO coincide con 
-- la wallet registrada del usuario
-- ============================================================================
SELECT 
    c.id,
    c.user_id,
    u.wallet_address as user_wallet,
    c.recipient_wallet as claimed_wallet,
    c.usdc_amount,
    c.status,
    c.tx_hash,
    c.created_at,
    CASE 
        WHEN LOWER(c.recipient_wallet) != LOWER(u.wallet_address) THEN '⚠️ MISMATCH'
        ELSE '✅ MATCH'
    END as wallet_status
FROM claims c
JOIN users u ON c.user_id = u.id
WHERE LOWER(c.recipient_wallet) != LOWER(u.wallet_address)
ORDER BY c.created_at DESC
LIMIT 50;

-- ============================================================================
-- QUERY 2: Resumen de Claims con Wallet Incorrecta
-- Muestra el total robado agrupado por wallet de destino
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

-- ============================================================================
-- QUERY 3: Transacciones del Vault a Direcciones Desconocidas
-- Encuentra retiros del vault a direcciones que NO pertenecen a usuarios
-- ============================================================================
SELECT 
    vt.id,
    vt.transaction_type,
    vt.wallet_address,
    vt.amount_usdc,
    vt.tx_hash,
    vt.reason,
    vt.status,
    vt.created_at,
    vt.ip_address,
    vt.user_agent,
    CASE 
        WHEN u.id IS NULL THEN '⚠️ NO ES USUARIO'
        ELSE '✅ ES USUARIO'
    END as address_status
FROM vault_transactions vt
LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(vt.wallet_address)
WHERE vt.transaction_type = 'withdrawal'
AND u.id IS NULL  -- Dirección no pertenece a ningún usuario
ORDER BY vt.created_at DESC
LIMIT 50;

-- ============================================================================
-- QUERY 4: Resumen de Transacciones Sospechosas del Vault
-- Agrupa transacciones sospechosas por dirección
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

-- ============================================================================
-- QUERY 5: Alertas de Seguridad (Wallet Mismatch)
-- Muestra todas las alertas de seguridad relacionadas con wallet mismatch
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
LIMIT 50;

-- ============================================================================
-- QUERY 6: Claims Grandes Recientes (Últimos 30 días)
-- Encuentra claims grandes que podrían ser parte del ataque
-- ============================================================================
SELECT 
    c.id,
    c.user_id,
    u.wallet_address as user_wallet,
    c.recipient_wallet,
    c.usdc_amount,
    c.status,
    c.tx_hash,
    c.created_at,
    CASE 
        WHEN LOWER(c.recipient_wallet) = LOWER(u.wallet_address) THEN '✅ MATCH'
        ELSE '⚠️ MISMATCH'
    END as wallet_status
FROM claims c
JOIN users u ON c.user_id = u.id
WHERE c.usdc_amount > 100  -- Montos grandes
AND c.created_at > NOW() - INTERVAL '30 days'
ORDER BY c.usdc_amount DESC, c.created_at DESC
LIMIT 50;

-- ============================================================================
-- QUERY 7: Resumen General de Claims (Últimos 30 días)
-- Estadísticas generales de claims para identificar patrones
-- ============================================================================
SELECT 
    COUNT(*) as total_claims,
    COUNT(CASE WHEN LOWER(c.recipient_wallet) != LOWER(u.wallet_address) THEN 1 END) as claims_with_mismatch,
    COUNT(CASE WHEN LOWER(c.recipient_wallet) = LOWER(u.wallet_address) THEN 1 END) as claims_with_match,
    SUM(c.usdc_amount) as total_usdc_claimed,
    SUM(CASE WHEN LOWER(c.recipient_wallet) != LOWER(u.wallet_address) THEN c.usdc_amount ELSE 0 END) as total_usdc_mismatch,
    SUM(CASE WHEN LOWER(c.recipient_wallet) = LOWER(u.wallet_address) THEN c.usdc_amount ELSE 0 END) as total_usdc_match,
    MIN(c.created_at) as first_claim,
    MAX(c.created_at) as last_claim
FROM claims c
JOIN users u ON c.user_id = u.id
WHERE c.created_at > NOW() - INTERVAL '30 days';

-- ============================================================================
-- QUERY 8: Todas las Transacciones del Vault (Últimos 30 días)
-- Lista completa de transacciones del vault para revisión manual
-- ============================================================================
SELECT 
    vt.id,
    vt.transaction_type,
    vt.wallet_address,
    vt.amount_usdc,
    vt.tx_hash,
    vt.reason,
    vt.status,
    vt.created_at,
    vt.ip_address,
    vt.user_agent,
    u.wallet_address as user_wallet,
    CASE 
        WHEN u.id IS NULL THEN '⚠️ NO ES USUARIO'
        WHEN LOWER(vt.wallet_address) = LOWER(u.wallet_address) THEN '✅ COINCIDE'
        ELSE '⚠️ NO COINCIDE'
    END as address_status
FROM vault_transactions vt
LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(vt.wallet_address)
WHERE vt.created_at > NOW() - INTERVAL '30 days'
ORDER BY vt.created_at DESC;

-- ============================================================================
-- QUERY 9: Top 10 Direcciones Sospechosas por Monto Total
-- Identifica las direcciones que recibieron más fondos sin ser usuarios
-- ============================================================================
SELECT 
    COALESCE(c.recipient_wallet, vt.wallet_address) as suspicious_address,
    COUNT(DISTINCT c.id) as claim_count,
    COUNT(DISTINCT vt.id) as vault_transaction_count,
    SUM(COALESCE(c.usdc_amount, 0)) as total_from_claims,
    SUM(COALESCE(vt.amount_usdc, 0)) as total_from_vault,
    SUM(COALESCE(c.usdc_amount, 0) + COALESCE(vt.amount_usdc, 0)) as total_usdc,
    MIN(COALESCE(c.created_at, vt.created_at)) as first_activity,
    MAX(COALESCE(c.created_at, vt.created_at)) as last_activity
FROM (
    SELECT recipient_wallet as address, usdc_amount, created_at, id
    FROM claims
    WHERE created_at > NOW() - INTERVAL '30 days'
) c
FULL OUTER JOIN (
    SELECT wallet_address as address, amount_usdc, created_at, id
    FROM vault_transactions
    WHERE transaction_type = 'withdrawal'
    AND created_at > NOW() - INTERVAL '30 days'
) vt ON LOWER(c.address) = LOWER(vt.address)
LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(COALESCE(c.address, vt.address))
WHERE u.id IS NULL  -- No es usuario registrado
GROUP BY COALESCE(c.address, vt.address)
ORDER BY total_usdc DESC
LIMIT 10;

-- ============================================================================
-- INSTRUCCIONES:
-- 1. Copia y pega cada query en Supabase → SQL Editor
-- 2. Ejecuta cada query individualmente
-- 3. Revisa los resultados cuidadosamente
-- 4. Si encuentras direcciones sospechosas, verifícalas en Basescan:
--    https://basescan.org/address/[DIRECCION]
-- 5. Documenta tus hallazgos
-- ============================================================================
