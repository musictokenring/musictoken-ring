-- ============================================
-- VERIFICACIÓN DE FLUJO PARA USUARIOS REGISTRADOS
-- Este script ayuda a verificar el estado de usuarios registrados
-- para probar el flujo de aceptación de desafíos sociales
-- ============================================

-- ============================================
-- PASO 1: USUARIOS REGISTRADOS CON WALLET VINCULADA
-- ============================================
-- Estos usuarios pueden aceptar desafíos sociales inmediatamente
SELECT 
    '✅ USUARIOS LISTOS PARA ACEPTAR DESAFÍOS' AS tipo,
    au.id::TEXT AS user_id,
    au.email AS email,
    au.created_at::TEXT AS fecha_registro,
    uw.wallet_address AS wallet_vinculada,
    COALESCE(uc.credits, 0) AS creditos,
    CASE 
        WHEN COALESCE(uc.credits, 0) >= 5 THEN '✅ Puede aceptar desafíos (mínimo 5 créditos)'
        WHEN COALESCE(uc.credits, 0) > 0 THEN '⚠️ Tiene créditos pero menos del mínimo'
        ELSE '❌ Sin créditos - necesita recargar'
    END AS estado_para_desafios,
    (SELECT COUNT(*) FROM deposits d WHERE d.user_id = au.id) AS num_depositos
FROM auth.users au
INNER JOIN user_wallets uw ON uw.user_id = au.id
LEFT JOIN user_credits uc ON uc.user_id = au.id
WHERE uw.is_primary = TRUE
ORDER BY uc.credits DESC NULLS LAST;

-- ============================================
-- PASO 2: USUARIOS REGISTRADOS SIN WALLET VINCULADA
-- ============================================
-- Estos usuarios necesitarán conectar wallet al aceptar desafío
SELECT 
    '⚠️ USUARIOS QUE NECESITARÁN CONECTAR WALLET' AS tipo,
    au.id::TEXT AS user_id,
    au.email AS email,
    au.created_at::TEXT AS fecha_registro,
    u.wallet_address AS wallet_en_users,
    COALESCE(uc.credits, 0) AS creditos,
    (SELECT COUNT(*) FROM deposits d WHERE d.user_id = au.id) AS num_depositos,
    CASE 
        WHEN u.wallet_address IS NOT NULL THEN '✅ Tiene wallet en users - se vinculará automáticamente'
        ELSE '⚠️ No tiene wallet - necesitará conectar por primera vez'
    END AS accion_necesaria
FROM auth.users au
LEFT JOIN users u ON u.id = au.id
LEFT JOIN user_wallets uw ON uw.user_id = au.id
LEFT JOIN user_credits uc ON uc.user_id = au.id
WHERE uw.wallet_address IS NULL
ORDER BY au.created_at DESC;

-- ============================================
-- PASO 3: RESUMEN PARA PRUEBAS
-- ============================================
SELECT 
    '📊 RESUMEN PARA PRUEBAS' AS tipo,
    COUNT(DISTINCT CASE WHEN uw.wallet_address IS NOT NULL THEN au.id END) AS usuarios_con_wallet_vinculada,
    COUNT(DISTINCT CASE WHEN uw.wallet_address IS NOT NULL AND COALESCE(uc.credits, 0) >= 5 THEN au.id END) AS usuarios_listos_para_desafios,
    COUNT(DISTINCT CASE WHEN uw.wallet_address IS NULL THEN au.id END) AS usuarios_sin_wallet,
    COUNT(DISTINCT CASE WHEN uw.wallet_address IS NULL AND u.wallet_address IS NOT NULL THEN au.id END) AS usuarios_con_wallet_en_users_pero_no_vinculada,
    COUNT(DISTINCT CASE WHEN uw.wallet_address IS NULL AND u.wallet_address IS NULL THEN au.id END) AS usuarios_sin_wallet_en_ninguna_parte
FROM auth.users au
LEFT JOIN users u ON u.id = au.id
LEFT JOIN user_wallets uw ON uw.user_id = au.id
LEFT JOIN user_credits uc ON uc.user_id = au.id;

-- ============================================
-- PASO 4: USUARIOS DE PRUEBA RECOMENDADOS (auth.users)
-- ============================================
-- Usuarios ideales para probar diferentes escenarios (solo usuarios en auth.users)
SELECT 
    '🧪 USUARIOS DE PRUEBA RECOMENDADOS (auth.users)' AS tipo,
    au.id::TEXT AS user_id,
    au.email AS email,
    CASE 
        WHEN uw.wallet_address IS NOT NULL AND COALESCE(uc.credits, 0) >= 5 THEN '✅ Escenario 1: Usuario con wallet y créditos suficientes'
        WHEN uw.wallet_address IS NOT NULL AND COALESCE(uc.credits, 0) > 0 AND COALESCE(uc.credits, 0) < 5 THEN '⚠️ Escenario 2: Usuario con wallet pero créditos insuficientes'
        WHEN uw.wallet_address IS NOT NULL AND COALESCE(uc.credits, 0) = 0 THEN '⚠️ Escenario 3: Usuario con wallet pero sin créditos'
        WHEN uw.wallet_address IS NULL AND u.wallet_address IS NOT NULL THEN '🔗 Escenario 4: Usuario con wallet en users pero no vinculada'
        WHEN uw.wallet_address IS NULL AND u.wallet_address IS NULL THEN '🆕 Escenario 5: Usuario nuevo sin wallet'
        ELSE '❓ Estado desconocido'
    END AS escenario_de_prueba,
    uw.wallet_address AS wallet_vinculada,
    u.wallet_address AS wallet_en_users,
    COALESCE(uc.credits, 0) AS creditos
FROM auth.users au
LEFT JOIN users u ON u.id = au.id
LEFT JOIN user_wallets uw ON uw.user_id = au.id
LEFT JOIN user_credits uc ON uc.user_id = au.id
ORDER BY 
    CASE 
        WHEN uw.wallet_address IS NOT NULL AND COALESCE(uc.credits, 0) >= 5 THEN 1
        WHEN uw.wallet_address IS NOT NULL AND COALESCE(uc.credits, 0) > 0 THEN 2
        WHEN uw.wallet_address IS NOT NULL AND COALESCE(uc.credits, 0) = 0 THEN 3
        WHEN uw.wallet_address IS NULL AND u.wallet_address IS NOT NULL THEN 4
        WHEN uw.wallet_address IS NULL AND u.wallet_address IS NULL THEN 5
        ELSE 6
    END,
    au.created_at DESC;

-- ============================================
-- PASO 5: USUARIOS CON WALLET VINCULADA (incluye usuarios solo en users)
-- ============================================
-- Muestra TODOS los usuarios con wallet vinculada, incluso si no están en auth.users
SELECT 
    '🔗 TODOS LOS USUARIOS CON WALLET VINCULADA' AS tipo,
    uw.user_id::TEXT AS user_id,
    au.email AS email,
    CASE 
        WHEN au.id IS NOT NULL THEN '✅ Existe en auth.users'
        ELSE '⚠️ Solo existe en users (wallet-only)'
    END AS tipo_usuario,
    uw.wallet_address AS wallet_vinculada,
    COALESCE(uc.credits, 0) AS creditos,
    (SELECT COUNT(*) FROM deposits d WHERE d.user_id = uw.user_id) AS num_depositos,
    CASE 
        WHEN COALESCE(uc.credits, 0) >= 5 THEN '✅ Puede aceptar desafíos (mínimo 5 créditos)'
        WHEN COALESCE(uc.credits, 0) > 0 THEN '⚠️ Tiene créditos pero menos del mínimo'
        ELSE '⚠️ Sin créditos - puede tener MTR on-chain'
    END AS estado_para_desafios
FROM user_wallets uw
LEFT JOIN auth.users au ON au.id = uw.user_id
LEFT JOIN user_credits uc ON uc.user_id = uw.user_id
WHERE uw.is_primary = TRUE
ORDER BY 
    CASE WHEN au.id IS NOT NULL THEN 1 ELSE 2 END,  -- Usuarios en auth.users primero
    creditos DESC NULLS LAST;
