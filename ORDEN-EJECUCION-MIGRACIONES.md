# 📋 ORDEN DE EJECUCIÓN DE MIGRACIONES

## ✅ Estado Actual

- ✅ **008_fix_rpc_permissions.sql** - EJECUTADA (2/2 funciones con SECURITY DEFINER)

---

## 🔄 Migraciones Probablemente Pendientes

### 1️⃣ PRIMERO: 001_credits_system.sql

**Ruta:**
```
c:\NUEVO MUSICTOKENRING-OPERATIVO\supabase\migrations\001_credits_system.sql
```

**Qué hace:**
- Crea las tablas base del sistema:
  - `users` - Usuarios
  - `user_credits` - Créditos de usuarios
  - `deposits` - Depósitos
  - `claims` - Retiros
  - `platform_settings` - Configuración de la plataforma
  - `rate_changes` - Historial de cambios de tasa
  - `match_wins` - Victorias en partidas
- Crea las funciones RPC básicas:
  - `increment_user_credits`
  - `decrement_user_credits`

**Ejecutar si:** No tienes las tablas principales del sistema

---

### 2️⃣ SEGUNDO: 004_enable_rls_security.sql

**Ruta:**
```
c:\NUEVO MUSICTOKENRING-OPERATIVO\supabase\migrations\004_enable_rls_security.sql
```

**Qué hace:**
- Habilita Row Level Security (RLS) en todas las tablas
- Crea políticas de seguridad para que:
  - Los usuarios solo puedan ver/modificar sus propios datos
  - El servicio backend pueda gestionar todos los datos
- Protege contra acceso no autorizado

**Ejecutar si:** Las tablas no tienen RLS habilitado

---

### 3️⃣ TERCERO: 002_stable_credits_system.sql

**Ruta:**
```
c:\NUEVO MUSICTOKENRING-OPERATIVO\supabase\migrations\002_stable_credits_system.sql
```

**Qué hace:**
- Crea tablas de vault (tesorería):
  - `vault_fees` - Fees acumulados
  - `vault_balance` - Balance del vault
- Crea funciones de vault:
  - `update_vault_balance` - Actualizar balance del vault
  - `get_vault_balance` - Obtener balance del vault
- Agrega columnas a `deposits` y `claims` para tracking de fees

**Ejecutar si:** No tienes las tablas de vault (pero parece que ya las tienes según verificaciones anteriores)

---

## 📝 Cómo Ejecutar

1. **Abre el archivo SQL en Cursor:**
   - Presiona `Ctrl+P`
   - Pega la ruta del archivo
   - Presiona Enter

2. **Copia todo el contenido:**
   - `Ctrl+A` (seleccionar todo)
   - `Ctrl+C` (copiar)

3. **Pega en Supabase SQL Editor:**
   - Abre Supabase Dashboard → SQL Editor
   - Pega el contenido (`Ctrl+V`)
   - Ejecuta (`Ctrl+Enter`)

4. **Verifica el resultado:**
   - Debe decir "Success" sin errores
   - Revisa los mensajes `RAISE NOTICE` si los hay

---

## ✅ Verificación Final

Después de ejecutar todas las migraciones necesarias, ejecuta nuevamente:

```
c:\NUEVO MUSICTOKENRING-OPERATIVO\QUE-MIGRACIONES-FALTAN.sql
```

Deberías ver `✅ YA EJECUTADA` en todas las migraciones.

---

## 🚀 Próximos Pasos Después de las Migraciones

1. **Recarga el frontend** (Ctrl+F5 para limpiar caché)
2. **Inicia sesión** con Google/Email
3. **Conecta tu wallet**
4. **Verifica** que la conversión automática de MTR a créditos funcione

---

## ⚠️ Nota Importante

Ejecuta las migraciones **en el orden indicado** (001 → 004 → 002), ya que algunas dependen de otras.
