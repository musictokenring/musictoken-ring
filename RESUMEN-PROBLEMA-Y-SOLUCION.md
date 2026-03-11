# 🔍 RESUMEN: Problema Real y Solución

## ✅ Problema Identificado

**Usuario específico afectado:**
- User ID: `52053c46-f6da-4861-9143-fd76d3e8e5d9`
- Créditos: `5.0358`
- **Estado:** ❌ NO tiene wallet vinculada en `user_wallets`

## 🔴 Por Qué Ocurrió

### Flujo del Problema:

1. **Usuario se registra con Google Login**
   - ✅ Se crea cuenta en `auth.users` con `user_id = 52053c46-f6da-4861-9143-fd76d3e8e5d9`
   - ❌ NO se crea entrada en tabla `users` (legacy)
   - ❌ NO se vincula wallet en `user_wallets`

2. **Usuario hace depósito con MetaMask**
   - Backend detecta depósito desde wallet `0x...`
   - Backend busca usuario en `users` por wallet address
   - ❌ NO encuentra usuario (porque se registró con Google, no con wallet)
   - Backend crea **NUEVO usuario** en `users` con la wallet
   - ⚠️ Este nuevo usuario tiene **DIFERENTE ID** que el de `auth.users`
   - ✅ Backend acredita créditos al nuevo `user_id` (no al de Google Login)

3. **Resultado:**
   - Hay **DOS usuarios separados**:
     - Usuario en `auth.users` (Google Login) → `52053c46-f6da-4861-9143-fd76d3e8e5d9`
     - Usuario en `users` (creado por depósito) → `[otro_id]`
   - Los créditos están en el usuario de `users`, pero el frontend usa el `user_id` de `auth.users`
   - Cuando intenta crear desafío social, el backend busca wallet en `user_wallets` usando el `user_id` de `auth.users`
   - ❌ NO encuentra wallet → Rechaza con "Insufficient credits"

## ✅ Solución Inmediata

### Opción 1: Obtener wallet desde logs del backend

1. **Ejecuta `INVESTIGAR-USUARIO-SIN-WALLET.sql`** para obtener:
   - Email del usuario
   - `tx_hash` de los depósitos

2. **Revisa logs del backend** cuando se procesó el depósito:
   - Busca el `tx_hash` en los logs
   - El log debería mostrar: `Processing USDC deposit: { txHash, from: '0x...', ... }`
   - La `from` es la wallet address del usuario

3. **Ejecuta `SOLUCION-VINCULAR-WALLET-USUARIO.sql`**:
   - Reemplaza `'WALLET_ADDRESS_AQUI'` con la wallet real
   - Ejecuta el script

### Opción 2: Preguntar al usuario

1. Contacta al usuario y pídele su wallet address
2. Ejecuta `SOLUCION-VINCULAR-WALLET-USUARIO.sql` con esa wallet

### Opción 3: Buscar usuario duplicado en tabla users

1. **Ejecuta `SOLUCION-UNIR-USUARIOS-DUPLICADOS.sql` PASO 2**
   - Esto mostrará usuarios en `users` que tienen depósitos pero posiblemente diferente ID
   - Si encuentras uno con depósitos pero diferente ID, ese es el usuario duplicado

2. **Unir los usuarios:**
   - Ejecuta el PASO 3 del script `SOLUCION-UNIR-USUARIOS-DUPLICADOS.sql`
   - Esto moverá todos los depósitos y créditos al `user_id` correcto de `auth.users`

## 🛡️ Prevención Futura

### Modificar Backend (`deposit-listener.js`)

Cuando se procesa un depósito y NO se encuentra usuario en `users`:

1. **Buscar si existe usuario en `auth.users` con email conocido**
   - Si el usuario hizo login recientemente, podría tener sesión activa
   - Buscar por email o por alguna relación

2. **Si no se encuentra, crear usuario pero también:**
   - Crear entrada en `user_wallets` automáticamente
   - Vincular con `auth.users` si es posible

3. **Endpoint para vincular wallet manualmente:**
   - `POST /api/user/link-wallet` debería:
     - Verificar que el usuario está autenticado
     - Vincular la wallet al `user_id` de `auth.users`
     - Crear entrada en `users` y `user_wallets`

## 📋 Scripts Disponibles

1. **`DIAGNOSTICO-SIMPLE-Y-CLARO.sql`** - Identifica todos los usuarios con este problema
2. **`INVESTIGAR-USUARIO-SIN-WALLET.sql`** - Investiga usuario específico
3. **`SOLUCION-VINCULAR-WALLET-USUARIO.sql`** - Vincula wallet a usuario específico
4. **`SOLUCION-UNIR-USUARIOS-DUPLICADOS.sql`** - Une usuarios duplicados
5. **`SOLUCION-AUTOMATICA-TODOS-USUARIOS.sql`** - Identifica todos los casos similares

## 🎯 Próximos Pasos

1. ✅ Ejecutar `SOLUCION-UNIR-USUARIOS-DUPLICADOS.sql` PASO 2 para encontrar usuario duplicado
2. ✅ Obtener wallet address (logs, usuario, o usuario duplicado)
3. ✅ Ejecutar solución para vincular wallet
4. ✅ Verificar que el usuario puede crear desafíos sociales
5. ✅ Modificar backend para prevenir este problema en el futuro
