-- Script de VERIFICACIÓN: Estado de la tabla social_challenges
-- Ejecuta esto PRIMERO para verificar si la tabla existe y qué constraint tiene

-- ==========================================
-- VERIFICACIÓN 1: ¿Existe la tabla?
-- ==========================================
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'social_challenges')
        THEN '✅ La tabla social_challenges EXISTE'
        ELSE '❌ La tabla social_challenges NO EXISTE'
    END AS tabla_status;

-- ==========================================
-- VERIFICACIÓN 2: Si existe, ¿qué constraint tiene?
-- ==========================================
DO $$
DECLARE
    constraint_name TEXT;
    constraint_check TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'social_challenges') THEN
        -- Buscar el constraint de bet_amount
        SELECT 
            conname,
            pg_get_constraintdef(oid) 
        INTO constraint_name, constraint_check
        FROM pg_constraint
        WHERE conrelid = 'social_challenges'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%bet_amount%';
        
        IF constraint_check IS NOT NULL THEN
            RAISE NOTICE 'Constraint encontrado: %', constraint_name;
            RAISE NOTICE 'Definición: %', constraint_check;
            
            -- Verificar si es >= 5 o >= 100
            IF constraint_check LIKE '%>= 5%' OR constraint_check LIKE '%>=5%' THEN
                RAISE NOTICE '✅ El constraint ya está actualizado a mínimo 5 créditos';
            ELSIF constraint_check LIKE '%>= 100%' OR constraint_check LIKE '%>=100%' THEN
                RAISE NOTICE '⚠️ El constraint tiene mínimo 100 créditos - NECESITA ACTUALIZACIÓN';
            ELSE
                RAISE NOTICE '⚠️ Constraint encontrado pero no reconocido: %', constraint_check;
            END IF;
        ELSE
            RAISE NOTICE '⚠️ No se encontró constraint de bet_amount en social_challenges';
        END IF;
    ELSE
        RAISE NOTICE 'La tabla no existe, no se puede verificar el constraint';
    END IF;
END $$;

-- ==========================================
-- VERIFICACIÓN 3: ¿Hay datos en la tabla?
-- ==========================================
DO $$
DECLARE
    row_count INTEGER;
    min_bet_amount DECIMAL;
    max_bet_amount DECIMAL;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'social_challenges') THEN
        SELECT COUNT(*), MIN(bet_amount), MAX(bet_amount)
        INTO row_count, min_bet_amount, max_bet_amount
        FROM social_challenges;
        
        RAISE NOTICE 'Total de registros: %', row_count;
        IF row_count > 0 THEN
            RAISE NOTICE 'Apuesta mínima en datos: % créditos', min_bet_amount;
            RAISE NOTICE 'Apuesta máxima en datos: % créditos', max_bet_amount;
            
            IF min_bet_amount < 5 THEN
                RAISE WARNING '⚠️ HAY REGISTROS con bet_amount < 5. Estos necesitarán actualización manual.';
            END IF;
        ELSE
            RAISE NOTICE 'La tabla está vacía - no hay datos que verificar';
        END IF;
    END IF;
END $$;

-- ==========================================
-- VERIFICACIÓN 4: Resumen y próximos pasos
-- ==========================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'social_challenges') THEN
        RAISE NOTICE '';
        RAISE NOTICE '═══════════════════════════════════════════════════════';
        RAISE NOTICE 'RESUMEN:';
        RAISE NOTICE '═══════════════════════════════════════════════════════';
        RAISE NOTICE 'La tabla social_challenges EXISTE';
        RAISE NOTICE '';
        RAISE NOTICE 'PRÓXIMOS PASOS:';
        RAISE NOTICE '1. Revisa los mensajes anteriores para ver el constraint actual';
        RAISE NOTICE '2. Si el constraint es >= 100, ejecuta: 003_update_min_bet_to_5.sql';
        RAISE NOTICE '3. Si el constraint ya es >= 5, NO necesitas hacer nada más';
        RAISE NOTICE '═══════════════════════════════════════════════════════';
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE '═══════════════════════════════════════════════════════';
        RAISE NOTICE 'RESUMEN:';
        RAISE NOTICE '═══════════════════════════════════════════════════════';
        RAISE NOTICE 'La tabla social_challenges NO EXISTE';
        RAISE NOTICE '';
        RAISE NOTICE 'PRÓXIMOS PASOS:';
        RAISE NOTICE '1. Ejecuta PRIMERO: create-social-challenges-table.sql';
        RAISE NOTICE '   (Este archivo ya tiene el mínimo de 5 créditos)';
        RAISE NOTICE '2. NO necesitas ejecutar 003_update_min_bet_to_5.sql';
        RAISE NOTICE '═══════════════════════════════════════════════════════';
    END IF;
END $$;
