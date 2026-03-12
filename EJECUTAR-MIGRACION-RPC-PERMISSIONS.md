# 🔧 Ejecutar Migración: Permisos RPC para Conversión Automática

## Problema Identificado

Las funciones RPC `increment_user_credits` y `decrement_user_credits` estaban siendo bloqueadas con error `403 Forbidden` porque:

1. **No tenían `SECURITY DEFINER`**: Se ejecutaban con los permisos del usuario que las llamaba (anon/authenticated), que no tienen permisos para modificar `user_credits` debido a RLS.
2. **RLS bloqueaba las operaciones**: Las políticas de Row Level Security impedían que usuarios autenticados modificaran sus propios créditos directamente.

## Solución Implementada

La migración `008_fix_rpc_permissions.sql`:

1. ✅ Agrega `SECURITY DEFINER` a ambas funciones RPC
2. ✅ Valida internamente que el usuario solo puede modificar sus propios créditos
3. ✅ Otorga permisos `EXECUTE` a usuarios autenticados y anónimos
4. ✅ Mantiene la seguridad mediante validación de wallet address

## Pasos para Ejecutar la Migración

### Opción 1: Supabase Dashboard (Recomendado)

1. **Abre Supabase Dashboard**
   - Ve a: https://supabase.com/dashboard
   - Selecciona tu proyecto

2. **Abre SQL Editor**
   - En el menú lateral, haz clic en "SQL Editor"
   - O ve directamente a: `https://supabase.com/dashboard/project/[TU_PROJECT_ID]/sql`

3. **Copia y Pega la Migración**
   - Abre el archivo: `supabase/migrations/008_fix_rpc_permissions.sql`
   - Copia TODO el contenido
   - Pégalo en el editor SQL de Supabase

4. **Ejecuta la Migración**
   - Haz clic en "Run" o presiona `Ctrl+Enter`
   - Espera a que termine la ejecución

5. **Verifica el Resultado**
   - Deberías ver mensajes como:
     ```
     ✅ increment_user_credits tiene SECURITY DEFINER
     ✅ decrement_user_credits tiene SECURITY DEFINER
     ✅ Migración de permisos RPC completada
     ```

### Opción 2: CLI de Supabase (Avanzado)

Si tienes Supabase CLI configurado:

```bash
cd "c:\NUEVO MUSICTOKENRING-OPERATIVO"
supabase db push
```

O ejecuta directamente:

```bash
supabase db execute --file supabase/migrations/008_fix_rpc_permissions.sql
```

## Verificación Post-Migración

Después de ejecutar la migración, verifica que todo funcione:

1. **Recarga la página del frontend** (Ctrl+F5 para limpiar caché)
2. **Conecta tu wallet**
3. **Inicia sesión** (Google/Email) - **CRÍTICO**: Debes estar autenticado
4. **Observa la consola del navegador**:
   - Deberías ver: `✅ Usuario autenticado: [user-id]`
   - Deberías ver: `✅✅✅ Créditos agregados automáticamente desde MTR vía Supabase RPC`
   - **NO deberías ver** errores `403 Forbidden`

5. **Verifica el saldo jugable**:
   - Debería reflejar automáticamente tu balance on-chain de MTR
   - Los créditos deberían aparecer inmediatamente después de la conversión

## Importante: Autenticación Requerida

⚠️ **CRÍTICO**: El sistema ahora requiere que el usuario esté **autenticado** (con Google/Email) para convertir créditos automáticamente.

- Si solo conectas la wallet sin autenticarte, verás un mensaje: "Por favor, inicia sesión para convertir tus créditos automáticamente"
- Esto es por seguridad: solo puedes modificar tus propios créditos

## Si Aún Ves Errores 403

Si después de ejecutar la migración sigues viendo errores `403 Forbidden`:

1. **Verifica que la migración se ejecutó correctamente**:
   ```sql
   SELECT proname, prosecdef 
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
   AND proname IN ('increment_user_credits', 'decrement_user_credits');
   ```
   - `prosecdef` debe ser `true` para ambas funciones

2. **Verifica que estás autenticado**:
   - Abre la consola del navegador
   - Ejecuta: `window.supabaseClient.auth.getSession()`
   - Debe devolver una sesión válida

3. **Verifica permisos GRANT**:
   ```sql
   SELECT grantee, privilege_type 
   FROM information_schema.routine_privileges 
   WHERE routine_name = 'increment_user_credits';
   ```
   - Debe incluir `authenticated` y `anon`

## Estado Actual

- ✅ Migración SQL creada: `supabase/migrations/008_fix_rpc_permissions.sql`
- ✅ Código frontend actualizado para verificar autenticación
- ✅ Validación de seguridad implementada en las funciones RPC
- ⏳ **PENDIENTE**: Ejecutar la migración en Supabase Dashboard

## Próximos Pasos

1. Ejecuta la migración SQL en Supabase (ver pasos arriba)
2. Recarga el frontend (Ctrl+F5)
3. Inicia sesión con Google/Email
4. Conecta tu wallet
5. Verifica que la conversión automática funcione

---

**Nota**: Esta es una solución **permanente y automática**. Una vez ejecutada la migración, el sistema funcionará completamente automático sin intervención manual.
