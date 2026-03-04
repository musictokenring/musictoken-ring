-- Script para verificar el CONSTRAINT actual de bet_amount en social_challenges
-- Ejecuta esto para ver qué mínimo tiene configurado actualmente

-- ==========================================
-- VERIFICAR CONSTRAINT DE bet_amount
-- ==========================================
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'social_challenges'::regclass
AND contype = 'c'
AND pg_get_constraintdef(oid) LIKE '%bet_amount%';

-- ==========================================
-- INTERPRETACIÓN DEL RESULTADO
-- ==========================================
-- Si ves "CHECK (bet_amount >= 100)" o "CHECK (bet_amount >= 100.0)" 
--    → NECESITAS ejecutar: 003_update_min_bet_to_5.sql
--
-- Si ves "CHECK (bet_amount >= 5)" o "CHECK (bet_amount >= 5.0)"
--    → ✅ Ya está actualizado, NO necesitas hacer nada más
--
-- Si no ves ningún resultado
--    → La tabla no tiene constraint de bet_amount (raro, pero posible)
