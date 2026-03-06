-- ==========================================
-- MIGRATION: Verificar y asegurar UNIQUE constraint en deposits.tx_hash
-- Prevents duplicate deposit processing
-- NOTA: La tabla deposits ya tiene tx_hash UNIQUE en la migración 001
-- Esta migración verifica y asegura que existe
-- ==========================================

-- Verificar si la constraint ya existe (debería existir desde migración 001)
DO $$
BEGIN
    -- Verificar si existe constraint único en tx_hash
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conrelid = 'deposits'::regclass
        AND contype = 'u'
        AND (
            -- Buscar constraint que incluya tx_hash
            conkey::int[] = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'deposits'::regclass AND attname = 'tx_hash')]
            OR conname LIKE '%tx_hash%'
        )
    ) THEN
        -- Si no existe, agregar constraint único
        ALTER TABLE deposits 
        ADD CONSTRAINT deposits_tx_hash_unique 
        UNIQUE (tx_hash);
        
        RAISE NOTICE '✅ Constraint UNIQUE agregado a deposits.tx_hash';
    ELSE
        RAISE NOTICE '✅ Constraint UNIQUE ya existe en deposits.tx_hash (verificado)';
    END IF;
END $$;

-- Verificar constraint
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'deposits'::regclass
AND conname = 'deposits_tx_hash_unique';

-- Comentario
COMMENT ON CONSTRAINT deposits_tx_hash_unique ON deposits IS 
'Protección crítica contra duplicados: previene procesar la misma transacción dos veces';
