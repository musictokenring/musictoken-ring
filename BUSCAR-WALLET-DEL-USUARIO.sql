-- ============================================
-- BUSCAR WALLET DEL USUARIO
-- User ID: 52053c46-f6da-4861-9143-fd76d3e8e5d9
-- ============================================
-- Este script busca la wallet address del usuario desde diferentes fuentes

-- OPCIÓN 1: Buscar en depósitos del usuario
SELECT 
    '🔍 WALLET DESDE DEPÓSITOS' AS fuente,
    d.tx_hash AS transaccion,
    'Revisar tx_hash en BaseScan para obtener wallet del remitente' AS instruccion,
    d.created_at::TEXT AS fecha_deposito,
    d.credits_awarded AS creditos_otorgados
FROM deposits d
WHERE d.user_id = '52053c46-f6da-4861-9143-fd76d3e8e5d9'
ORDER BY d.created_at DESC
LIMIT 5;

-- OPCIÓN 2: Buscar si hay usuario duplicado en tabla users con wallet
SELECT 
    '🔍 USUARIO DUPLICADO EN users' AS fuente,
    u.id::TEXT AS user_id_en_users,
    u.wallet_address AS wallet_encontrada,
    u.created_at::TEXT AS fecha_creacion,
    CASE 
        WHEN u.id = '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID 
        THEN '✅ Es el mismo usuario'
        ELSE '⚠️ Usuario diferente (duplicado)'
    END AS estado
FROM users u
WHERE EXISTS (
    SELECT 1 FROM deposits d 
    WHERE d.user_id = u.id 
    AND d.user_id != '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID
)
OR u.wallet_address IN (
    -- Buscar wallets que tienen depósitos pero pueden estar vinculadas a otro user_id
    SELECT DISTINCT u2.wallet_address
    FROM users u2
    INNER JOIN deposits d2 ON d2.user_id = u2.id
    WHERE d2.user_id != '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID
)
ORDER BY u.created_at DESC;

-- OPCIÓN 3: Buscar en user_wallets si hay alguna wallet vinculada
SELECT 
    '🔍 WALLET EN user_wallets' AS fuente,
    uw.wallet_address AS wallet_encontrada,
    uw.user_id::TEXT AS user_id_vinculado,
    uw.is_primary AS es_principal,
    uw.linked_via AS metodo_vinculacion,
    uw.created_at::TEXT AS vinculada_en
FROM user_wallets uw
WHERE uw.user_id = '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID;

-- OPCIÓN 4: Buscar usuarios en users que tienen depósitos pero diferente ID
-- Estos pueden ser usuarios creados automáticamente por el backend cuando procesó el depósito
SELECT 
    '🔍 POSIBLE USUARIO DUPLICADO (creado por depósito)' AS fuente,
    u.id::TEXT AS user_id_duplicado,
    u.wallet_address AS wallet_encontrada,
    u.created_at::TEXT AS fecha_creacion,
    COUNT(DISTINCT d.id) AS total_depositos,
    SUM(d.credits_awarded) AS creditos_depositados,
    'Este usuario fue creado cuando se procesó el depósito' AS nota
FROM users u
INNER JOIN deposits d ON d.user_id = u.id
WHERE u.id != '52053c46-f6da-4861-9143-fd76d3e8e5d9'::UUID
GROUP BY u.id, u.wallet_address, u.created_at
HAVING COUNT(DISTINCT d.id) > 0
ORDER BY total_depositos DESC;

-- INSTRUCCIONES:
-- 1. Ejecuta este script completo
-- 2. Revisa los resultados de cada OPCIÓN
-- 3. Si encuentras una wallet en OPCIÓN 2 o 4, esa es la wallet que necesitas
-- 4. Si solo encuentras tx_hash en OPCIÓN 1, necesitas revisar la transacción en BaseScan
--    para obtener la wallet del remitente (from address)
