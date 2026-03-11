# 📋 Guía: Ejecutar Migración de Vinculación Wallet-Usuario

## 🎯 Objetivo

Crear la tabla `user_wallets` que permite vincular múltiples wallets a una cuenta de usuario, habilitando autenticación basada en wallet en navegadores internos.

---

## 📝 Paso 1: Ejecutar Migración SQL en Supabase

### 1. Abre Supabase SQL Editor

1. Ve a tu proyecto en Supabase: https://supabase.com/dashboard
2. Selecciona tu proyecto
3. Ve a **SQL Editor** en el menú lateral
4. Haz clic en **New Query**

### 2. Copia y Pega la Migración

**Abre el archivo:** `backend/migrations/010_create_user_wallets_table.sql`

**Copia TODO el contenido** y pégalo en el SQL Editor de Supabase.

### 3. Ejecuta la Migración

1. Haz clic en **Run** (o presiona Ctrl+Enter)
2. Verifica que no haya errores
3. Deberías ver: "Success. No rows returned" (es normal, solo crea la tabla)

---

## ✅ Paso 2: Verificar que la Tabla se Creó

### Ejecuta esta Query en Supabase:

```sql
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'user_wallets'
ORDER BY ordinal_position;
```

**Deberías ver:** Todas las columnas de la tabla `user_wallets` listadas.

---

## 🔍 Paso 3: Verificar Endpoints (Después del Deploy)

### Después de hacer deploy en Render, verifica:

1. **Endpoint de verificación de wallet:**
   ```
   GET https://musictoken-ring.onrender.com/api/user/wallet/0x[TU_WALLET]
   ```

2. **Endpoint de vinculación (requiere autenticación):**
   ```
   POST https://musictoken-ring.onrender.com/api/user/link-wallet
   Headers: { Authorization: "Bearer [supabase_token]" }
   Body: { walletAddress: "0x[TU_WALLET]" }
   ```

---

## 🎯 Cómo Funciona Después de la Migración

### Escenario 1: Usuario se loguea con Google primero

1. Usuario se loguea con Google → Sesión Supabase creada
2. Usuario conecta wallet → Sistema vincula automáticamente
3. Wallet se guarda en `user_wallets` vinculada al userId
4. Si wallet abre navegador interno → Sistema encuentra userId por wallet ✅

### Escenario 2: Usuario conecta wallet primero (navegador interno)

1. Usuario conecta wallet en navegador interno
2. Sistema verifica: `GET /api/user/wallet/:walletAddress`
3. Si wallet está vinculada → Retorna userId ✅
4. Si no está vinculada → Crea usuario automáticamente (como antes) ✅

---

## 📊 Estructura de la Tabla Creada

### Tabla `user_wallets`:

- `id` - UUID único del registro
- `user_id` - Referencia al usuario (users.id)
- `wallet_address` - Dirección de wallet (única)
- `is_primary` - Si es la wallet principal
- `linked_at` - Fecha de vinculación
- `linked_via` - Método ('google', 'email', 'manual', 'auto')
- `ip_address` - IP de vinculación (auditoría)
- `user_agent` - User agent (auditoría)
- `last_used_at` - Última vez que se usó

---

## ✅ Verificación Post-Migración

### Query para verificar vinculaciones:

```sql
SELECT 
    uw.*,
    u.email as user_email,
    u.wallet_address as user_primary_wallet
FROM user_wallets uw
JOIN users u ON uw.user_id = u.id
ORDER BY uw.linked_at DESC
LIMIT 10;
```

**Esto mostrará:** Todas las wallets vinculadas con información del usuario.

---

## 🚨 Troubleshooting

### Error: "relation user_wallets does not exist"

**Solución:** La migración no se ejecutó correctamente. Vuelve a ejecutarla.

### Error: "duplicate key value violates unique constraint"

**Solución:** La tabla ya existe. Esto es normal si ejecutaste la migración antes.

### Error: "function uuid_generate_v4() does not exist"

**Solución:** Ejecuta primero:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

## 📝 Notas Importantes

1. ✅ **Backward Compatible:** Los usuarios existentes siguen funcionando sin cambios
2. ✅ **Auto-vinculación:** Cuando usuario se loguea con Google y conecta wallet, se vincula automáticamente
3. ✅ **Seguridad:** La validación de propiedad de wallet sigue funcionando en `/api/claim`
4. ✅ **Auditoría:** Todas las vinculaciones se registran con IP y user agent

---

## 🎯 Próximos Pasos Después de la Migración

1. ✅ Ejecutar migración SQL en Supabase
2. ⏳ Hacer deploy en Render (automático desde GitHub)
3. ⏳ Probar vinculación manualmente
4. ⏳ Verificar que funciona en navegadores internos de wallets

---

**¿Listo para ejecutar la migración?**
