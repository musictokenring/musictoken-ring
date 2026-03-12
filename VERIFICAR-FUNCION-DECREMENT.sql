-- ==========================================
-- VERIFICAR FUNCIÓN decrement_user_credits
-- Ejecuta este script para verificar que la función tiene los permisos correctos
-- ==========================================

-- 1. Verificar que la función existe y tiene SECURITY DEFINER
SELECT 
    p.proname as function_name,
    p.prosecdef as is_security_definer,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND p.proname = 'decrement_user_credits';

-- 2. Verificar permisos de ejecución
SELECT 
    p.proname as function_name,
    r.rolname as role_name,
    has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
AND p.proname = 'decrement_user_credits'
AND r.rolname IN ('authenticated', 'anon', 'service_role')
ORDER BY r.rolname;

-- 3. Verificar que la función puede acceder a user_credits
-- (Esto se verifica ejecutando la función, pero primero verificamos la definición)
SELECT 
    CASE 
        WHEN pg_get_functiondef(p.oid) LIKE '%SECURITY DEFINER%' THEN '✅ Tiene SECURITY DEFINER'
        ELSE '❌ NO tiene SECURITY DEFINER'
    END as security_status,
    CASE 
        WHEN pg_get_functiondef(p.oid) LIKE '%user_credits%' THEN '✅ Accede a user_credits'
        ELSE '❌ NO accede a user_credits'
    END as table_access
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND p.proname = 'decrement_user_credits';
