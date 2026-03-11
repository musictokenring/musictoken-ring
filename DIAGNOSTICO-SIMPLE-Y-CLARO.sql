-- ============================================
-- DIAGNÓSTICO SIMPLE Y CLARO - TODO EN UNA SOLA EJECUCIÓN
-- Ejecuta este script completo y verás TODOS los problemas claramente
-- ============================================

SELECT * FROM (
-- ============================================
-- PROBLEMA 1: Usuarios con DEPÓSITOS pero SIN WALLET VINCULADA
-- Este es el problema principal que causa "Insufficient credits"
-- ============================================
SELECT 
    '❌ PROBLEMA CRÍTICO' AS tipo,
    'Usuario con DEPÓSITOS pero SIN wallet vinculada' AS problema,
    au.id::TEXT AS user_id,
    au.email AS email,
    COUNT(DISTINCT d.id)::TEXT AS total_depositos,
    SUM(d.credits_awarded)::TEXT AS creditos_depositados,
    COALESCE((SELECT uc.credits::TEXT FROM user_credits uc WHERE uc.user_id = au.id), '0') AS creditos_actuales,
    'SOLUCIÓN: Vincular wallet usando VINCULAR-WALLET-SEGURO.sql' AS solucion
FROM auth.users au
INNER JOIN deposits d ON d.user_id = au.id
WHERE NOT EXISTS (
    SELECT 1 FROM user_wallets uw WHERE uw.user_id = au.id
)
GROUP BY au.id, au.email

UNION ALL

-- ============================================
-- PROBLEMA 2: Wallets en user_wallets SIN usuario en tabla users (Foreign Key Roto)
-- ============================================
SELECT 
    '❌ FOREIGN KEY ROTO' AS tipo,
    'Wallet vinculada pero usuario NO existe en tabla users' AS problema,
    uw.user_id::TEXT AS user_id,
    '' AS email,
    '0' AS total_depositos,
    '0' AS creditos_depositados,
    '0' AS creditos_actuales,
    'SOLUCIÓN: Crear usuario en tabla users con este user_id' AS solucion
FROM user_wallets uw
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = uw.user_id)
    AND uw.wallet_address IS NOT NULL

UNION ALL

-- ============================================
-- PROBLEMA 3: Usuarios en auth.users SIN entrada en tabla users (legacy)
-- ============================================
SELECT 
    '⚠️ DISCREPANCIA' AS tipo,
    'Usuario en auth.users pero NO en tabla users (legacy)' AS problema,
    au.id::TEXT AS user_id,
    au.email AS email,
    COALESCE(depositos_count.total::TEXT, '0') AS total_depositos,
    COALESCE(depositos_count.creditos::TEXT, '0') AS creditos_depositados,
    COALESCE((SELECT uc.credits::TEXT FROM user_credits uc WHERE uc.user_id = au.id), '0') AS creditos_actuales,
    'SOLUCIÓN: Crear entrada en tabla users con este user_id' AS solucion
FROM auth.users au
LEFT JOIN (
    SELECT 
        d.user_id,
        COUNT(*) AS total,
        SUM(d.credits_awarded) AS creditos
    FROM deposits d
    GROUP BY d.user_id
) depositos_count ON depositos_count.user_id = au.id
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = au.id)
    AND au.email IS NOT NULL
    AND (
        depositos_count.total > 0 
        OR EXISTS (SELECT 1 FROM user_credits uc WHERE uc.user_id = au.id)
    )

UNION ALL

-- ============================================
-- PROBLEMA 4: Usuarios con créditos pero SIN wallet vinculada
-- ============================================
SELECT 
    '⚠️ PROBLEMA' AS tipo,
    'Usuario con CRÉDITOS pero SIN wallet vinculada' AS problema,
    uc.user_id::TEXT AS user_id,
    COALESCE((SELECT au.email FROM auth.users au WHERE au.id = uc.user_id), '') AS email,
    '0' AS total_depositos,
    '0' AS creditos_depositados,
    uc.credits::TEXT AS creditos_actuales,
    'SOLUCIÓN: Vincular wallet al usuario' AS solucion
FROM user_credits uc
WHERE NOT EXISTS (SELECT 1 FROM user_wallets uw WHERE uw.user_id = uc.user_id)
    AND uc.credits > 0

UNION ALL

-- ============================================
-- RESUMEN: Contar problemas por tipo
-- ============================================
SELECT 
    '📊 RESUMEN' AS tipo,
    'Total usuarios con depósitos pero sin wallet vinculada' AS problema,
    COUNT(DISTINCT au.id)::TEXT AS user_id,
    '' AS email,
    '' AS total_depositos,
    '' AS creditos_depositados,
    '' AS creditos_actuales,
    'Estos usuarios NO pueden crear desafíos sociales' AS solucion
FROM auth.users au
INNER JOIN deposits d ON d.user_id = au.id
WHERE NOT EXISTS (SELECT 1 FROM user_wallets uw WHERE uw.user_id = au.id)

UNION ALL

SELECT 
    '📊 RESUMEN' AS tipo,
    'Total wallets con Foreign Key roto' AS problema,
    COUNT(*)::TEXT AS user_id,
    '' AS email,
    '' AS total_depositos,
    '' AS creditos_depositados,
    '' AS creditos_actuales,
    'Estas wallets necesitan usuario en tabla users' AS solucion
FROM user_wallets uw
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = uw.user_id)

UNION ALL

SELECT 
    '📊 RESUMEN' AS tipo,
    'Total usuarios sin entrada en tabla users (legacy)' AS problema,
    COUNT(*)::TEXT AS user_id,
    '' AS email,
    '' AS total_depositos,
    '' AS creditos_depositados,
    '' AS creditos_actuales,
    'Estos usuarios necesitan entrada en tabla users' AS solucion
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = au.id)
    AND au.email IS NOT NULL
    AND (EXISTS (SELECT 1 FROM deposits d WHERE d.user_id = au.id) 
         OR EXISTS (SELECT 1 FROM user_credits uc WHERE uc.user_id = au.id))

) resultados

ORDER BY 
    CASE tipo
        WHEN '❌ PROBLEMA CRÍTICO' THEN 1
        WHEN '❌ FOREIGN KEY ROTO' THEN 2
        WHEN '⚠️ PROBLEMA' THEN 3
        WHEN '⚠️ DISCREPANCIA' THEN 4
        WHEN '📊 RESUMEN' THEN 5
        ELSE 6
    END,
    user_id;
