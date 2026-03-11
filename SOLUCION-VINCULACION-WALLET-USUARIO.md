# 🔗 Solución: Vinculación Wallet-Usuario para Navegadores Internos

## 🎯 Problema Identificado

### Situación Actual:
1. Usuario se loguea con Google/email en Chrome móvil
2. Usuario conecta wallet (MetaMask, Trust Wallet, Binance Wallet)
3. Wallet abre su navegador interno
4. **PROBLEMA:** La sesión de Google se pierde en el navegador interno
5. Usuario no puede hacer operaciones porque no está "logueado"

### Necesidad:
- Crear equivalencia entre login Google/email y wallet conectada
- Permitir operaciones en navegador interno de wallet sin login Google
- Mantener seguridad verificando que wallet pertenece al usuario

---

## 🔄 Flujo de Solución Propuesto

### Flujo 1: Usuario se loguea con Google PRIMERO

```
1. Usuario abre plataforma en Chrome móvil
2. Usuario hace login con Google → Sesión Supabase creada
3. Usuario conecta wallet → Wallet vinculada a su cuenta
4. Usuario hace operaciones → Todo funciona ✅
```

### Flujo 2: Usuario conecta wallet PRIMERO (navegador interno)

```
1. Usuario abre plataforma desde wallet (navegador interno)
2. Usuario conecta wallet → Sistema verifica si está vinculada
3. Si está vinculada → Obtiene userId automáticamente
4. Usuario puede hacer operaciones sin login Google ✅
```

### Flujo 3: Usuario nuevo desde wallet

```
1. Usuario abre plataforma desde wallet (navegador interno)
2. Usuario conecta wallet → No está vinculada
3. Sistema crea usuario automáticamente (como ahora)
4. Usuario puede hacer operaciones básicas ✅
5. Opcional: Usuario puede vincular con Google después
```

---

## 🛠️ Implementación Técnica

### 1. Endpoint para Vincular Wallet a Usuario Autenticado

**Nuevo endpoint:** `POST /api/user/link-wallet`

**Propósito:** Vincular wallet a usuario autenticado con Google/email

**Flujo:**
- Usuario está autenticado con Supabase (Google/email)
- Usuario conecta wallet
- Frontend llama a este endpoint con la wallet
- Backend verifica autenticación y vincula wallet a userId

---

### 2. Endpoint para Verificar Wallet Vinculada

**Nuevo endpoint:** `GET /api/user/wallet/:walletAddress`

**Propósito:** Verificar si wallet está vinculada y obtener userId

**Flujo:**
- Usuario conecta wallet en navegador interno
- Frontend llama a este endpoint
- Backend verifica si wallet está vinculada a un usuario
- Si está vinculada → Retorna userId
- Si no está vinculada → Retorna null (se crea usuario automáticamente)

---

### 3. Modificar Lógica de Autenticación en Frontend

**Cambios necesarios:**
- Verificar autenticación Supabase (Google/email)
- Si no hay sesión → Verificar si wallet está vinculada
- Si wallet está vinculada → Usar userId de la wallet
- Permitir operaciones con userId de wallet vinculada

---

## 🔒 Seguridad

### Validaciones Implementadas:

1. **Vinculación de Wallet:**
   - Solo usuarios autenticados pueden vincular wallets
   - Verificar que wallet no esté ya vinculada a otro usuario
   - Registrar IP y user agent para auditoría

2. **Uso de Wallet Vinculada:**
   - Verificar que wallet pertenece al userId en cada operación
   - Mantener validación de propiedad de wallet en `/api/claim`
   - Registrar operaciones para auditoría

3. **Prevención de Fraude:**
   - Una wallet solo puede estar vinculada a un usuario
   - Un usuario puede tener múltiples wallets vinculadas
   - Alertas de seguridad si se intenta vincular wallet ya vinculada

---

## 📊 Estructura de Base de Datos

### Tabla `users` (ya existe):
- `id` (UUID) - ID del usuario
- `wallet_address` (VARCHAR) - Wallet principal vinculada
- `email` (VARCHAR) - Email del usuario (de Google)
- `created_at` (TIMESTAMP)

### Nueva Tabla `user_wallets` (a crear):
- `id` (UUID) - ID del registro
- `user_id` (UUID) - Referencia a users.id
- `wallet_address` (VARCHAR) - Dirección de wallet vinculada
- `is_primary` (BOOLEAN) - Si es la wallet principal
- `linked_at` (TIMESTAMP) - Fecha de vinculación
- `linked_via` (VARCHAR) - Método de vinculación ('google', 'email', 'manual')
- `ip_address` (VARCHAR) - IP de vinculación
- `user_agent` (TEXT) - User agent de vinculación

**Ventajas:**
- Un usuario puede tener múltiples wallets
- Rastreo completo de vinculaciones
- Auditoría de seguridad

---

## 🎯 Flujo Completo Detallado

### Escenario A: Usuario se loguea con Google primero

```
1. Usuario abre plataforma en Chrome móvil
2. Click en "Iniciar Sesión" → Login con Google
3. Supabase crea sesión → userId obtenido
4. Usuario conecta wallet (MetaMask, Trust Wallet, etc.)
5. Frontend detecta wallet conectada
6. Frontend llama: POST /api/user/link-wallet
   Body: { walletAddress: "0x..." }
   Headers: { Authorization: "Bearer [supabase_token]" }
7. Backend verifica:
   - Usuario autenticado ✅
   - Wallet no vinculada a otro usuario ✅
8. Backend vincula wallet:
   - Actualiza users.wallet_address
   - Crea registro en user_wallets
9. Usuario puede hacer operaciones ✅
10. Si wallet abre navegador interno:
    - Frontend verifica sesión Supabase → No hay
    - Frontend llama: GET /api/user/wallet/:walletAddress
    - Backend retorna userId de wallet vinculada
    - Frontend usa ese userId para operaciones ✅
```

### Escenario B: Usuario conecta wallet primero (navegador interno)

```
1. Usuario abre plataforma desde wallet (navegador interno)
2. Usuario conecta wallet
3. Frontend verifica sesión Supabase → No hay
4. Frontend llama: GET /api/user/wallet/:walletAddress
5. Backend verifica:
   - ¿Wallet está vinculada? → SÍ
   - Retorna userId vinculado
6. Frontend usa userId para operaciones ✅
7. Usuario puede hacer operaciones sin login Google
```

### Escenario C: Usuario nuevo desde wallet

```
1. Usuario abre plataforma desde wallet (navegador interno)
2. Usuario conecta wallet
3. Frontend verifica sesión Supabase → No hay
4. Frontend llama: GET /api/user/wallet/:walletAddress
5. Backend verifica:
   - ¿Wallet está vinculada? → NO
   - Retorna null
6. Frontend llama: GET /api/user/credits/:walletAddress
7. Backend crea usuario automáticamente (como ahora)
8. Usuario puede hacer operaciones básicas ✅
9. Opcional: Usuario puede vincular con Google después
```

---

## 📝 Cambios de Código Necesarios

### 1. Crear Migración SQL para `user_wallets`

### 2. Crear Endpoint `/api/user/link-wallet`

### 3. Crear Endpoint `/api/user/wallet/:walletAddress`

### 4. Modificar Frontend para manejar ambos casos

### 5. Actualizar lógica de autenticación

---

## ✅ Beneficios de esta Solución

1. ✅ **Funciona en navegadores internos de wallets**
2. ✅ **Mantiene seguridad** - Verifica propiedad de wallet
3. ✅ **Flexible** - Funciona con o sin login Google
4. ✅ **Auditable** - Registra todas las vinculaciones
5. ✅ **Backward compatible** - No rompe funcionalidad existente

---

## 🚀 Próximos Pasos

1. Crear migración SQL para tabla `user_wallets`
2. Implementar endpoints de vinculación
3. Modificar frontend para usar nueva lógica
4. Probar en diferentes escenarios
5. Documentar para usuarios
