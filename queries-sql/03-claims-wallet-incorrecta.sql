-- ============================================================================
-- QUERY 3: Claims con Wallet Incorrecta (SIN límite de tiempo)
-- Encuentra todos los claims donde la wallet de destino NO coincide con 
-- la wallet registrada del usuario (en toda la historia)
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
