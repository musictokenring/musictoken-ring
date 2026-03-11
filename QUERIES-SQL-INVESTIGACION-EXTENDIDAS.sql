-- ============================================================================
-- QUERIES SQL EXTENDIDAS: Investigación de Fuga de Fondos
-- Estas queries buscan en períodos más amplios y verifican otras tablas
-- ============================================================================

-- ============================================================================
-- QUERY EXTENDIDA 1: Verificar si existe la tabla 'claims'
-- ============================================================================
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'claims'
ORDER BY ordinal_position;

-- ============================================================================
-- QUERY EXTENDIDA 2: Contar TODOS los claims (sin límite de tiempo)
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

-- ============================================================================
-- QUERY EXTENDIDA 3: Claims con Wallet Incorrecta (SIN límite de tiempo)
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
LIMIT 100;

-- ============================================================================
-- QUERY EXTENDIDA 4: Resumen de Claims con Wallet Incorrecta (SIN límite de tiempo)
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
-- QUERY EXTENDIDA 5: Verificar si existe la tabla 'vault_transactions'
-- ============================================================================
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'vault_transactions'
ORDER BY ordinal_position;

-- ============================================================================
-- QUERY EXTENDIDA 6: TODAS las transacciones del vault (SIN límite de tiempo)
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

-- ============================================================================
-- QUERY EXTENDIDA 7: Transacciones del Vault a Direcciones Desconocidas (SIN límite de tiempo)
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
LIMIT 100;

-- ============================================================================
-- QUERY EXTENDIDA 8: Resumen de Transacciones Sospechosas (SIN límite de tiempo)
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
-- QUERY EXTENDIDA 9: Verificar tabla 'security_alerts'
-- ============================================================================
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'security_alerts'
ORDER BY ordinal_position;

-- ============================================================================
-- QUERY EXTENDIDA 10: TODAS las alertas de seguridad (SIN límite de tiempo)
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

-- ============================================================================
-- QUERY EXTENDIDA 11: Alertas de Wallet Mismatch (SIN límite de tiempo)
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

-- ============================================================================
-- QUERY EXTENDIDA 12: Buscar direcciones relacionadas con 'foodam.xyz'
-- Busca en todas las tablas posibles por referencias a esta dirección
-- ============================================================================
-- Primero, necesitamos saber si hay alguna referencia a esta dirección
-- Esta query busca en múltiples tablas

-- Buscar en claims
SELECT 
    'claims' as source_table,
    recipient_wallet as address,
    usdc_amount,
    created_at,
    tx_hash,
    status
FROM claims
WHERE LOWER(recipient_wallet) LIKE '%foodam%'
   OR LOWER(recipient_wallet) LIKE '%0x%'  -- Buscar todas y luego filtrar manualmente
ORDER BY created_at DESC
LIMIT 50;

-- Buscar en vault_transactions
SELECT 
    'vault_transactions' as source_table,
    wallet_address as address,
    amount_usdc,
    created_at,
    tx_hash,
    status,
    reason
FROM vault_transactions
WHERE LOWER(wallet_address) LIKE '%foodam%'
   OR LOWER(wallet_address) LIKE '%0x%'  -- Buscar todas y luego filtrar manualmente
ORDER BY created_at DESC
LIMIT 50;

-- ============================================================================
-- QUERY EXTENDIDA 13: Verificar todas las direcciones únicas en claims
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

-- ============================================================================
-- QUERY EXTENDIDA 14: Verificar todas las direcciones únicas en vault_transactions
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

-- ============================================================================
-- INSTRUCCIONES:
-- 1. Ejecuta primero las queries de verificación (1, 5, 9) para confirmar que las tablas existen
-- 2. Ejecuta las queries de conteo (2, 6, 10) para ver si hay datos
-- 3. Si hay datos, ejecuta las queries de investigación (3, 4, 7, 8, 11)
-- 4. Usa la Query 12 para buscar específicamente la dirección relacionada con foodam.xyz
-- 5. Las queries 13 y 14 te darán un resumen de todas las direcciones involucradas
-- ============================================================================
