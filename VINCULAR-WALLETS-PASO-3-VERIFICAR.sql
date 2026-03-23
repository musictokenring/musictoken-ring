-- ============================================
-- PASO 3: VERIFICACIÓN POST-CORRECCIÓN
-- Ejecuta este script después del PASO 2 para verificar que todo se vinculó correctamente
-- ============================================

SELECT 
    '✅ VERIFICACIÓN POST-CORRECCIÓN' AS tipo,
    u.id::TEXT AS user_id,
    au.email AS email,
    u.wallet_address AS wallet_en_users,
    uw.wallet_address AS wallet_en_user_wallets,
    CASE 
        WHEN uw.wallet_address IS NOT NULL THEN '✅ VINCULADA'
        ELSE '❌ AÚN SIN VINCULAR'
    END AS estado_final,
    COALESCE(uc.credits, 0) AS creditos
FROM users u
LEFT JOIN auth.users au ON au.id = u.id
LEFT JOIN user_wallets uw ON uw.wallet_address = u.wallet_address
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.wallet_address IS NOT NULL
    AND u.wallet_address != ''
    -- Excluir wallet de plataforma/tesorería
    AND LOWER(u.wallet_address) != '0x0000000000000000000000000000000000000001'
    -- Excluir wallets renombradas
    AND u.wallet_address NOT LIKE '%_old_%'
ORDER BY 
    CASE WHEN uw.wallet_address IS NULL THEN 0 ELSE 1 END,  -- Sin vincular primero
    creditos DESC NULLS LAST;
