-- ==========================================
-- VERIFICAR ESTADO DE LA FUNCIÓN RPC
-- ==========================================
-- Este script verifica cómo está configurada la función increment_user_credits

-- Verificar si la función existe y tiene SECURITY DEFINER
SELECT 
    proname as funcion,
    prosecdef as tiene_security_definer,
    CASE 
        WHEN prosecdef = true THEN '✅ SÍ'
        ELSE '❌ NO'
    END as estado_security_definer,
    pg_get_functiondef(oid) as definicion_completa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND proname = 'increment_user_credits';

-- Verificar permisos GRANT
SELECT 
    grantee,
    privilege_type
FROM information_schema.routine_privileges 
WHERE routine_schema = 'public'
AND routine_name = 'increment_user_credits';

-- Verificar el código fuente de la función (mostrar solo las primeras líneas relevantes)
SELECT 
    prosrc as codigo_fuente
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND proname = 'increment_user_credits';
