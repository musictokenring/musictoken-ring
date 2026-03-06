-- ==========================================
-- MIGRATION: Add UNIQUE constraint to deposits.tx_hash
-- Prevents duplicate deposit processing
-- ==========================================

-- Verificar si la constraint ya existe
DO $$
BEGIN
    -- Intentar agregar constraint único si no existe
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'deposits_tx_hash_unique' 
        AND conrelid = 'deposits'::regclass
    ) THEN
        -- Agregar constraint único
        ALTER TABLE deposits 
        ADD CONSTRAINT deposits_tx_hash_unique 
        UNIQUE (tx_hash);
        
        RAISE NOTICE 'Constraint UNIQUE agregado a deposits.tx_hash';
    ELSE
        RAISE NOTICE 'Constraint UNIQUE ya existe en deposits.tx_hash';
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
