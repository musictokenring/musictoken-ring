-- ============================================================================
-- QUERY 7: Transacciones del Vault a Direcciones Desconocidas (SIN límite de tiempo)
-- Encuentra retiros del vault a direcciones que NO pertenecen a usuarios
-- ⚠️ ESTA ES UNA DE LAS QUERIES MÁS IMPORTANTES
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
