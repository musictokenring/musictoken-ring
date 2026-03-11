-- ============================================
-- DIAGNÓSTICO COMPLETO DEL SISTEMA
-- Verifica usuarios, wallets, créditos, depósitos y problemas
-- Ejecuta TODO este script de una vez para ver todos los problemas
-- ============================================

-- ============================================
-- SECCIÓN 1: USUARIOS CON GOOGLE LOGIN
-- ============================================
SELECT 
    '=== SECCIÓN 1: USUARIOS CON GOOGLE LOGIN ===' AS seccion,
    '' AS campo,
    '' AS valor,
    '' AS problema;

SELECT 
    'Usuario Google' AS campo,
    u.id::TEXT AS valor,
    u.email AS detalle_adicional,
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.id = u.id) 
        THEN '⚠️ NO existe en tabla users (legacy)'
        ELSE '✅ Existe en tabla users'
    END AS problema
FROM auth.users u
WHERE u.email IS NOT NULL
    AND (u.raw_user_meta_data->>'provider' = 'google' OR u.email LIKE '%@gmail.com')
ORDER BY u.created_at DESC
LIMIT 50;

-- ============================================
-- SECCIÓN 2: USUARIOS CON DEPÓSITOS PERO SIN WALLET VINCULADA
-- ============================================
SELECT 
    '=== SECCIÓN 2: PROBLEMA CRÍTICO - Usuarios con DEPÓSITOS pero SIN WALLET VINCULADA ===' AS seccion,
    '' AS campo,
    '' AS valor,
    '' AS problema;

SELECT 
    '❌ PROBLEMA CRÍTICO' AS campo,
    au.id::TEXT AS user_id,
    au.email AS email,
    COUNT(DISTINCT d.id) AS total_depositos,
    SUM(d.credits_awarded) AS creditos_depositados,
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_wallets uw WHERE uw.user_id = au.id) 
        THEN '✅ Tiene wallet vinculada'
        ELSE '❌ NO tiene wallet vinculada en user_wallets'
    END AS estado_wallet,
    CASE 
        WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = au.id) 
        THEN '✅ Existe en tabla users'
        ELSE '❌ NO existe en tabla users (legacy)'
    END AS estado_users,
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_credits uc WHERE uc.user_id = au.id) 
        THEN COALESCE((SELECT uc.credits::TEXT FROM user_credits uc WHERE uc.user_id = au.id), '0')
        ELSE '❌ NO tiene créditos registrados'
    END AS creditos_actuales
FROM auth.users au
INNER JOIN deposits d ON d.user_id = au.id
WHERE NOT EXISTS (
    SELECT 1 FROM user_wallets uw WHERE uw.user_id = au.id
)
GROUP BY au.id, au.email
ORDER BY total_depositos DESC;

-- ============================================
-- SECCIÓN 3: DEPÓSITOS RECIBIDOS POR WALLET (sin user_id)
-- ============================================
SELECT 
    '=== SECCIÓN 3: DEPÓSITOS recibidos pero wallet NO vinculada a usuario ===' AS seccion,
    '' AS campo,
    '' AS valor,
    '' AS problema;

-- Buscar depósitos donde la wallet del depósito no está vinculada
SELECT 
    'Depósito sin usuario vinculado' AS campo,
    d.tx_hash AS valor,
    d.token AS tipo_token,
    d.amount::TEXT AS monto,
    d.credits_awarded::TEXT AS creditos_otorgados,
    d.created_at::TEXT AS fecha,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM user_wallets uw 
            WHERE LOWER(uw.wallet_address) = LOWER(
                -- Intentar extraer wallet del tx_hash o de otra fuente
                (SELECT wallet_address FROM users u WHERE u.id = d.user_id LIMIT 1)
            )
        )
        THEN '✅ Wallet vinculada'
        ELSE '❌ Wallet NO vinculada - PROBLEMA'
    END AS problema
FROM deposits d
WHERE d.user_id IS NOT NULL
ORDER BY d.created_at DESC
LIMIT 20;

-- ============================================
-- SECCIÓN 4: DISCREPANCIAS ENTRE auth.users, users, user_wallets y user_credits
-- ============================================
SELECT 
    '=== SECCIÓN 4: DISCREPANCIAS ENTRE TABLAS ===' AS seccion,
    '' AS campo,
    '' AS valor,
    '' AS problema;

SELECT 
    'Discrepancia detectada' AS campo,
    au.id::TEXT AS user_id,
    au.email AS email,
    CASE 
        WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = au.id) THEN '✅'
        ELSE '❌'
    END AS en_users,
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_wallets uw WHERE uw.user_id = au.id) THEN '✅'
        ELSE '❌'
    END AS en_user_wallets,
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_credits uc WHERE uc.user_id = au.id) THEN '✅'
        ELSE '❌'
    END AS en_user_credits,
    CASE 
        WHEN EXISTS (SELECT 1 FROM deposits d WHERE d.user_id = au.id) THEN '✅'
        ELSE '❌'
    END AS tiene_depositos,
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM users u WHERE u.id = au.id) 
            OR NOT EXISTS (SELECT 1 FROM user_wallets uw WHERE uw.user_id = au.id)
        THEN '⚠️ PROBLEMA: Usuario sin entrada en users o sin wallet vinculada'
        ELSE '✅ OK'
    END AS problema
FROM auth.users au
WHERE au.email IS NOT NULL
ORDER BY au.created_at DESC
LIMIT 50;

-- ============================================
-- SECCIÓN 5: WALLETS EN user_wallets SIN USUARIO EN users
-- ============================================
SELECT 
    '=== SECCIÓN 5: WALLETS vinculadas pero usuario NO existe en tabla users ===' AS seccion,
    '' AS campo,
    '' AS valor,
    '' AS problema;

SELECT 
    '❌ PROBLEMA: Foreign Key Roto' AS campo,
    uw.wallet_address AS wallet,
    uw.user_id::TEXT AS user_id_en_user_wallets,
    uw.is_primary AS es_principal,
    uw.linked_via AS metodo_vinculacion,
    CASE 
        WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = uw.user_id) 
        THEN '✅ Usuario existe en users'
        ELSE '❌ Usuario NO existe en users - FOREIGN KEY ROTO'
    END AS problema,
    CASE 
        WHEN EXISTS (SELECT 1 FROM auth.users au WHERE au.id = uw.user_id) 
        THEN '✅ Usuario existe en auth.users'
        ELSE '❌ Usuario NO existe en auth.users'
    END AS existe_en_auth_users
FROM user_wallets uw
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = uw.user_id)
ORDER BY uw.created_at DESC;

-- ============================================
-- SECCIÓN 6: RESUMEN DE PROBLEMAS CRÍTICOS
-- ============================================
SELECT 
    '=== SECCIÓN 6: RESUMEN DE PROBLEMAS CRÍTICOS ===' AS seccion,
    '' AS campo,
    '' AS valor,
    '' AS problema;

SELECT 
    'Problema' AS tipo,
    COUNT(*)::TEXT AS cantidad,
    'Usuarios con depósitos pero sin wallet vinculada' AS descripcion
FROM auth.users au
INNER JOIN deposits d ON d.user_id = au.id
WHERE NOT EXISTS (SELECT 1 FROM user_wallets uw WHERE uw.user_id = au.id)

UNION ALL

SELECT 
    'Problema',
    COUNT(*)::TEXT,
    'Wallets en user_wallets sin usuario en tabla users (Foreign Key Roto)'
FROM user_wallets uw
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = uw.user_id)

UNION ALL

SELECT 
    'Problema',
    COUNT(*)::TEXT,
    'Usuarios en auth.users sin entrada en tabla users (legacy)'
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = au.id)
    AND au.email IS NOT NULL

UNION ALL

SELECT 
    'Problema',
    COUNT(*)::TEXT,
    'Usuarios con créditos pero sin wallet vinculada'
FROM user_credits uc
WHERE NOT EXISTS (SELECT 1 FROM user_wallets uw WHERE uw.user_id = uc.user_id);

-- ============================================
-- SECCIÓN 7: VERIFICAR USUARIOS ESPECÍFICOS QUE REPORTARON PROBLEMAS
-- ============================================
SELECT 
    '=== SECCIÓN 7: USUARIO ESPECÍFICO CON PROBLEMAS ===' AS seccion,
    '' AS campo,
    '' AS valor,
    '' AS problema;

-- Usuario específico mencionado anteriormente
SELECT 
    'Usuario específico' AS campo,
    '978e9e29-11b0-405d-bf68-b20622016aad' AS user_id,
    au.email AS email,
    CASE 
        WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = au.id) 
        THEN '✅ Existe en users'
        ELSE '❌ NO existe en users'
    END AS en_users,
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_wallets uw WHERE uw.user_id = au.id) 
        THEN (SELECT uw.wallet_address FROM user_wallets uw WHERE uw.user_id = au.id LIMIT 1)
        ELSE '❌ NO tiene wallet vinculada'
    END AS wallet_vinculada,
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_credits uc WHERE uc.user_id = au.id) 
        THEN (SELECT uc.credits::TEXT FROM user_credits uc WHERE uc.user_id = au.id)
        ELSE '❌ NO tiene créditos'
    END AS creditos,
    CASE 
        WHEN EXISTS (SELECT 1 FROM deposits d WHERE d.user_id = au.id) 
        THEN COUNT(*)::TEXT
        ELSE '0'
    END AS total_depositos
FROM auth.users au
LEFT JOIN deposits d ON d.user_id = au.id
WHERE au.id = '978e9e29-11b0-405d-bf68-b20622016aad'
GROUP BY au.id, au.email;

-- ============================================
-- SECCIÓN 8: DESAFÍOS SOCIALES FALLIDOS (últimos 7 días)
-- ============================================
SELECT 
    '=== SECCIÓN 8: DESAFÍOS SOCIALES RECIENTES Y SU ESTADO ===' AS seccion,
    '' AS campo,
    '' AS valor,
    '' AS problema;

SELECT 
    'Desafío Social' AS campo,
    sc.challenge_id::TEXT AS challenge_id,
    sc.challenger_id::TEXT AS user_id,
    sc.bet_amount::TEXT AS apuesta,
    sc.status AS estado,
    sc.created_at::TEXT AS fecha_creacion,
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_wallets uw WHERE uw.user_id = sc.challenger_id) 
        THEN '✅ Usuario tiene wallet vinculada'
        ELSE '❌ Usuario NO tiene wallet vinculada - PROBLEMA'
    END AS problema,
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_credits uc WHERE uc.user_id = sc.challenger_id) 
        THEN (SELECT uc.credits::TEXT FROM user_credits uc WHERE uc.user_id = sc.challenger_id)
        ELSE '0'
    END AS creditos_en_momento_creacion
FROM social_challenges sc
WHERE sc.created_at >= NOW() - INTERVAL '7 days'
ORDER BY sc.created_at DESC
LIMIT 20;

-- ============================================
-- INSTRUCCIONES FINALES
-- ============================================
SELECT 
    '=== INSTRUCCIONES ===' AS seccion,
    '1. Revisa SECCIÓN 2: Usuarios con depósitos pero sin wallet vinculada' AS paso1,
    '2. Revisa SECCIÓN 5: Wallets con Foreign Key roto' AS paso2,
    '3. Revisa SECCIÓN 6: Resumen de problemas críticos' AS paso3,
    '4. Si encuentras usuarios con depósitos pero sin wallet, necesitas vincularlas' AS paso4,
    '5. Si encuentras Foreign Keys rotos, necesitas crear usuarios en tabla users' AS paso5;
