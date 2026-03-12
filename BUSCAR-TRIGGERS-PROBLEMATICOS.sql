-- ==========================================
-- BUSCAR TRIGGERS QUE PUEDEN CAUSAR EL ERROR
-- ==========================================
-- Error: "record "new" has no field "wallet_address""

-- Buscar todos los triggers en la base de datos
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table as tabla,
    action_statement as codigo_trigger
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Buscar triggers específicamente en user_credits
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table = 'user_credits';

-- Ver el código fuente completo de los triggers
SELECT 
    t.tgname as trigger_name,
    c.relname as tabla,
    pg_get_triggerdef(t.oid) as definicion_completa
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;
