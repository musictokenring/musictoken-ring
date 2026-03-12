-- ==========================================
-- SOLUCIÓN: Eliminar triggers problemáticos
-- ==========================================
-- Error: "record "new" has no field "wallet_address""
-- Este error ocurre cuando un trigger intenta acceder a NEW.wallet_address
-- pero el registro NEW no tiene ese campo (porque viene de user_credits, no de users)

-- Eliminar triggers que puedan estar causando el problema
DROP TRIGGER IF EXISTS update_user_credits_updated_at ON public.user_credits;
DROP TRIGGER IF EXISTS sync_wallet_on_credits_update ON public.user_credits;
DROP TRIGGER IF EXISTS validate_wallet_on_credits ON public.user_credits;

-- Verificar si hay más triggers problemáticos
DO $$
DECLARE
    trigger_rec RECORD;
BEGIN
    FOR trigger_rec IN 
        SELECT t.tgname, c.relname
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
        AND c.relname = 'user_credits'
        AND NOT t.tgisinternal
    LOOP
        RAISE NOTICE 'Eliminando trigger: % en tabla %', trigger_rec.tgname, trigger_rec.relname;
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.user_credits CASCADE', trigger_rec.tgname);
    END LOOP;
END $$;

-- Crear un trigger simple solo para updated_at (sin referencias a wallet_address)
CREATE OR REPLACE FUNCTION update_user_credits_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear el trigger solo si no existe
DROP TRIGGER IF EXISTS set_user_credits_updated_at ON public.user_credits;
CREATE TRIGGER set_user_credits_updated_at
    BEFORE UPDATE ON public.user_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_user_credits_timestamp();

-- Verificar resultado
DO $$
DECLARE
    trigger_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relname = 'user_credits'
    AND NOT t.tgisinternal;
    
    RAISE NOTICE '';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'TRIGGERS EN user_credits: %', trigger_count;
    RAISE NOTICE '==========================================';
    
    IF trigger_count = 1 THEN
        RAISE NOTICE '✅ Solo queda el trigger de updated_at (correcto)';
    ELSIF trigger_count = 0 THEN
        RAISE NOTICE '⚠️  No hay triggers (puede estar bien si updated_at se maneja en la función)';
    ELSE
        RAISE WARNING '⚠️  Hay % triggers, revisar si alguno causa problemas', trigger_count;
    END IF;
    
    RAISE NOTICE '';
END $$;
