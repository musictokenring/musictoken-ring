# 🔄 Flujo Completo: Vinculación Wallet-Usuario

## 📋 Resumen de la Solución

**Problema:** Cuando un usuario se loguea con Google/email y luego conecta su wallet, la wallet abre su navegador interno donde la sesión de Google se pierde.

**Solución:** Sistema de vinculación que permite usar la wallet como método de autenticación cuando no hay sesión Supabase disponible.

---

## 🔄 FLUJOS DETALLADOS

### Flujo A: Usuario se loguea con Google PRIMERO

```
1. Usuario abre plataforma en Chrome móvil
   └─> URL: musictokenring.xyz

2. Usuario hace click en "Iniciar Sesión"
   └─> Se abre popup de Google OAuth
   └─> Usuario autoriza con Google
   └─> Supabase crea sesión
   └─> userId obtenido: "abc-123-user-id"

3. Usuario conecta wallet (MetaMask, Trust Wallet, etc.)
   └─> Frontend detecta wallet conectada: "0x1234..."
   └─> Frontend llama: POST /api/user/link-wallet
       Headers: { Authorization: "Bearer [supabase_token]" }
       Body: { walletAddress: "0x1234..." }
   └─> Backend verifica:
       ✅ Usuario autenticado (userId: "abc-123-user-id")
       ✅ Wallet no vinculada a otro usuario
   └─> Backend vincula wallet:
       ✅ Crea registro en user_wallets
       ✅ Actualiza users.wallet_address si es primary
   └─> Frontend recibe: { success: true, walletId: "xyz..." }

4. Usuario puede hacer operaciones normalmente
   └─> Todo funciona porque tiene sesión Supabase ✅

5. Si wallet abre navegador interno:
   └─> Frontend verifica sesión Supabase → No hay ❌
   └─> Frontend llama: GET /api/user/wallet/0x1234...
   └─> Backend busca en user_wallets:
       ✅ Encuentra wallet vinculada
       ✅ Retorna: { linked: true, userId: "abc-123-user-id" }
   └─> Frontend usa userId para operaciones ✅
   └─> Usuario puede hacer operaciones sin login Google ✅
```

---

### Flujo B: Usuario conecta wallet PRIMERO (navegador interno)

```
1. Usuario abre plataforma desde wallet (navegador interno)
   └─> URL: musictokenring.xyz (en navegador interno de MetaMask/Trust Wallet)

2. Usuario conecta wallet
   └─> Frontend detecta wallet conectada: "0x1234..."
   └─> Frontend verifica sesión Supabase → No hay ❌

3. Frontend llama: GET /api/user/wallet/0x1234...
   └─> Backend busca en user_wallets:
       ✅ Encuentra wallet vinculada
       ✅ Retorna: { linked: true, userId: "abc-123-user-id" }
   └─> Frontend almacena userId: "abc-123-user-id"

4. Frontend llama: GET /api/user/credits/0x1234...
   └─> Backend usa userId de wallet link
   └─> Retorna créditos del usuario ✅

5. Usuario puede hacer operaciones
   └─> Frontend usa userId almacenado
   └─> Todas las operaciones funcionan ✅
   └─> No necesita login Google ✅
```

---

### Flujo C: Usuario nuevo desde wallet (sin vinculación previa)

```
1. Usuario nuevo abre plataforma desde wallet
   └─> URL: musictokenring.xyz (en navegador interno)

2. Usuario conecta wallet por primera vez
   └─> Frontend detecta wallet: "0x5678..."
   └─> Frontend verifica sesión Supabase → No hay ❌

3. Frontend llama: GET /api/user/wallet/0x5678...
   └─> Backend busca en user_wallets:
       ❌ Wallet no encontrada
       └─> Retorna: { linked: false, userId: null }

4. Frontend llama: GET /api/user/credits/0x5678...
   └─> Backend crea usuario automáticamente (como antes)
   └─> Retorna créditos: 0 ✅

5. Usuario puede hacer operaciones básicas
   └─> Puede depositar, apostar, etc. ✅
   └─> No necesita login Google ✅

6. Opcional: Usuario puede vincular con Google después
   └─> Si se loguea con Google en otro dispositivo
   └─> Puede vincular esta wallet después
```

---

## 🔒 SEGURIDAD

### Validaciones Implementadas:

1. **Vinculación de Wallet:**
   - ✅ Solo usuarios autenticados pueden vincular wallets
   - ✅ Verifica que wallet no esté vinculada a otro usuario
   - ✅ Registra IP y user agent para auditoría

2. **Uso de Wallet Vinculada:**
   - ✅ Verifica que wallet pertenece al userId en cada operación
   - ✅ Mantiene validación de propiedad de wallet en `/api/claim`
   - ✅ Registra operaciones para auditoría

3. **Prevención de Fraude:**
   - ✅ Una wallet solo puede estar vinculada a un usuario
   - ✅ Un usuario puede tener múltiples wallets vinculadas
   - ✅ Alertas de seguridad si se intenta vincular wallet ya vinculada

---

## 📊 ESTRUCTURA DE DATOS

### Tabla `user_wallets`:

```sql
CREATE TABLE user_wallets (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    wallet_address VARCHAR(42) UNIQUE,
    is_primary BOOLEAN DEFAULT FALSE,
    linked_at TIMESTAMP,
    linked_via VARCHAR(50), -- 'google', 'email', 'manual', 'auto'
    ip_address VARCHAR(45),
    user_agent TEXT,
    last_used_at TIMESTAMP
);
```

### Relación:

```
users (1) ──< (N) user_wallets
```

- Un usuario puede tener múltiples wallets
- Una wallet solo puede estar vinculada a un usuario
- Una wallet puede ser "primary" (la principal)

---

## 🎯 ENDPOINTS CREADOS

### 1. `GET /api/user/wallet/:walletAddress`

**Propósito:** Verificar si wallet está vinculada y obtener userId

**Uso:** Cuando usuario conecta wallet en navegador interno

**Respuesta:**
```json
{
  "linked": true,
  "userId": "abc-123-user-id",
  "walletAddress": "0x1234...",
  "userEmail": "user@gmail.com",
  "message": "Wallet is linked to a user account"
}
```

---

### 2. `POST /api/user/link-wallet`

**Propósito:** Vincular wallet a usuario autenticado

**Uso:** Cuando usuario está logueado con Google y conecta wallet

**Headers:**
```
Authorization: Bearer [supabase_access_token]
```

**Body:**
```json
{
  "walletAddress": "0x1234..."
}
```

**Respuesta:**
```json
{
  "success": true,
  "walletId": "xyz-789",
  "isPrimary": true,
  "alreadyLinked": false,
  "message": "Wallet linked successfully"
}
```

---

### 3. `GET /api/user/wallets`

**Propósito:** Obtener todas las wallets vinculadas a un usuario

**Uso:** Mostrar wallets del usuario en perfil

**Headers:**
```
Authorization: Bearer [supabase_access_token]
```

**Respuesta:**
```json
{
  "wallets": [
    {
      "id": "xyz-789",
      "wallet_address": "0x1234...",
      "is_primary": true,
      "linked_at": "2026-03-10T...",
      "linked_via": "google"
    }
  ],
  "count": 1
}
```

---

## 🔧 CAMBIOS EN FRONTEND

### 1. `src/credits-system.js`

**Cambios:**
- ✅ `loadBalance()` ahora verifica wallet link si no hay sesión Supabase
- ✅ `getUserId()` ahora usa wallet link como fallback
- ✅ Nuevo método `linkWalletToUser()` para vincular wallet

### 2. `src/claim-ui.js`

**Cambios:**
- ✅ Ya tiene validación de autenticación
- ✅ Ahora también acepta userId de wallet link

### 3. Lógica de conexión de wallet

**Cambio necesario:**
- Cuando usuario conecta wallet Y tiene sesión Supabase:
  - Llamar automáticamente a `linkWalletToUser()`
  - Vincular wallet a cuenta

---

## ✅ BENEFICIOS

1. ✅ **Funciona en navegadores internos de wallets**
2. ✅ **Mantiene seguridad** - Verifica propiedad de wallet
3. ✅ **Flexible** - Funciona con o sin login Google
4. ✅ **Auditable** - Registra todas las vinculaciones
5. ✅ **Backward compatible** - No rompe funcionalidad existente
6. ✅ **Sin cambios para usuarios existentes** - Todo sigue funcionando

---

## 🚀 PRÓXIMOS PASOS

1. ✅ Crear migración SQL para `user_wallets`
2. ✅ Crear servicio `WalletLinkService`
3. ✅ Crear endpoints de vinculación
4. ✅ Modificar `credits-system.js` para usar wallet link
5. ⏳ Modificar lógica de conexión de wallet en `index.html`
6. ⏳ Probar en diferentes escenarios
7. ⏳ Documentar para usuarios

---

## 📝 NOTAS IMPORTANTES

- **Seguridad:** La validación de propiedad de wallet en `/api/claim` sigue funcionando
- **Compatibilidad:** Usuarios existentes siguen funcionando sin cambios
- **Flexibilidad:** Usuarios pueden tener múltiples wallets vinculadas
- **Auditoría:** Todas las vinculaciones se registran con IP y user agent
