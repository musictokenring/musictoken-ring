-- ==========================================
-- VERIFICAR QUE LOS TRIGGERS PROBLEMÁTICOS FUERON ELIMINADOS
-- ==========================================

-- Verificar triggers en user_credits
SELECT 
    t.tgname as trigger_name,
    c.relname as tabla,
    pg_get_triggerdef(t.oid) as definicion_completa
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
AND c.relname = 'user_credits'
AND NOT t.tgisinternal
ORDER BY t.tgname;

-- Verificar funciones de trigger que puedan referenciar wallet_address
SELECT 
    p.proname as funcion,
    pg_get_functiondef(p.oid) as definicion_completa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND (
    pg_get_functiondef(p.oid) LIKE '%wallet_address%'
    OR pg_get_functiondef(p.oid) LIKE '%NEW.wallet%'
    OR pg_get_functiondef(p.oid) LIKE '%trigger_update_wallet%'
)
ORDER BY p.proname;

-- Resumen
DO $$
DECLARE
    trigger_count INTEGER;
    function_count INTEGER;
BEGIN
    -- Contar triggers en user_credits
    SELECT COUNT(*) INTO trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relname = 'user_credits'
    AND NOT t.tgisinternal;
    
    -- Contar funciones que referencian wallet_address
    SELECT COUNT(*) INTO function_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    AND (
        pg_get_functiondef(p.oid) LIKE '%wallet_address%'
        OR pg_get_functiondef(p.oid) LIKE '%NEW.wallet%'
    );
    
    RAISE NOTICE '';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'VERIFICACIÓN DE TRIGGERS';
    RAISE NOTICE '==========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Triggers en user_credits: %', trigger_count;
    
    IF trigger_count = 0 THEN
        RAISE NOTICE '✅ No hay triggers en user_credits (correcto)';
    ELSIF trigger_count = 1 THEN
        RAISE NOTICE '✅ Hay 1 trigger (probablemente solo updated_at)';
    ELSE
        RAISE WARNING '⚠️  Hay % triggers, revisar si alguno causa problemas', trigger_count;
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE 'Funciones que referencian wallet_address: %', function_count;
    
    IF function_count = 0 THEN
        RAISE NOTICE '✅ No hay funciones problemáticas';
    ELSE
        RAISE WARNING '⚠️  Hay % funciones que referencian wallet_address, revisar', function_count;
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '==========================================';
    
    IF trigger_count <= 1 AND function_count = 0 THEN
        RAISE NOTICE '✅ Estado: Los triggers problemáticos fueron eliminados';
        RAISE NOTICE '   Ahora puedes probar la conversión automática de créditos';
    ELSE
        RAISE WARNING '⚠️  Estado: Aún puede haber triggers o funciones problemáticas';
    END IF;
    
    RAISE NOTICE '';
END $$;
