-- CORRECCIÓN CRÍTICA: Saldo Inflado en user_credits
-- Este script corrige saldos que exceden el balance on-chain MTR
-- Ejecutar SOLO para el usuario afectado (wallet: 0x7537...2253)

-- Paso 1: Verificar saldo actual
SELECT 
    u.id,
    u.wallet_address,
    uc.credits as saldo_actual,
    -- El saldo on-chain es aproximadamente 98,024,480 MTR
    -- Si el saldo en user_credits excede esto, está inflado
    CASE 
        WHEN uc.credits > 98024480 THEN 'INFLADO - NECESITA CORRECCIÓN'
        ELSE 'OK'
    END as estado
FROM users u
LEFT JOIN user_credits uc ON u.id = uc.user_id
WHERE u.wallet_address ILIKE '0x7537%2253'
ORDER BY uc.credits DESC;

-- Paso 2: CORREGIR saldo inflado (usar saldo on-chain como máximo)
-- IMPORTANTE: Ajustar el valor según el saldo on-chain REAL del usuario
UPDATE user_credits
SET 
    credits = LEAST(credits, 98024480), -- Máximo: saldo on-chain
    updated_at = NOW()
WHERE user_id IN (
    SELECT u.id 
    FROM users u 
    WHERE u.wallet_address ILIKE '0x7537%2253'
)
AND credits > 98024480; -- Solo corregir si excede el on-chain

-- Paso 3: Verificar corrección
SELECT 
    u.wallet_address,
    uc.credits as saldo_corregido,
    'Corregido a máximo on-chain' as accion
FROM users u
LEFT JOIN user_credits uc ON u.id = uc.user_id
WHERE u.wallet_address ILIKE '0x7537%2253';

-- NOTA: Si el usuario tiene ganancias legítimas de batallas,
-- puede tener más créditos que el on-chain. En ese caso,
-- NO ejecutar la corrección automática. Verificar primero.
