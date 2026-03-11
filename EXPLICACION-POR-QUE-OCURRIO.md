# ¿Por qué ocurrió este problema?

## Problema Detectado
Usuario con ID `52053c46-f6da-4861-9143-fd76d3e8e5d9` tiene **5.0358 créditos** pero **NO tiene wallet vinculada** en la tabla `user_wallets`.

## Causas Probables

### 1. **Registro con Google Login sin wallet inicial**
- El usuario se registró usando Google Login (`auth.users`)
- En ese momento, el sistema creó su cuenta en `auth.users`
- **PERO** el usuario no tenía una wallet conectada al momento del registro
- El sistema NO creó automáticamente una entrada en `users` (tabla legacy)
- El sistema NO vinculó ninguna wallet en `user_wallets`

### 2. **Depósito realizado después del registro**
- El usuario hizo un depósito usando su wallet de MetaMask/otra wallet
- El backend procesó el depósito y:
  - ✅ Creó el registro en `deposits` con el `user_id` correcto
  - ✅ Acreditó los créditos en `user_credits`
  - ❌ **NO vinculó automáticamente la wallet** en `user_wallets`
  - ❌ **NO creó entrada en tabla `users`** (legacy)

### 3. **Flujo de vinculación de wallet no se ejecutó**
El flujo esperado debería ser:
1. Usuario se registra → `auth.users` ✅
2. Usuario conecta wallet → Crear en `users` + `user_wallets` ❌ (NO ocurrió)
3. Usuario hace depósito → Verificar wallet vinculada ❌ (NO estaba vinculada)
4. Backend debería vincular automáticamente la wallet del depósito ❌ (NO lo hizo)

## Por qué el backend rechaza las deducciones

Cuando el usuario intenta crear un desafío social:
1. Frontend envía: `POST /api/user/deduct-credits` con `walletAddress`
2. Backend busca: `SELECT user_id FROM user_wallets WHERE wallet_address = ?`
3. **Resultado: NO encuentra el usuario** porque la wallet NO está en `user_wallets`
4. Backend no puede identificar qué `user_id` corresponde a esa wallet
5. Backend rechaza con: `400 Bad Request - Insufficient credits`

## Solución

### Opción 1: Vincular manualmente (para este usuario específico)
1. Obtener la wallet address del usuario (preguntarle o revisar logs)
2. Ejecutar `SOLUCION-VINCULAR-WALLET-USUARIO.sql` con la wallet correcta

### Opción 2: Solución automática para todos los casos similares
Crear un script que:
1. Busque usuarios con créditos pero sin wallet vinculada
2. Intente encontrar su wallet desde los depósitos (si es posible)
3. Vincule automáticamente

### Opción 3: Prevenir en el futuro
Modificar el backend para que:
- Cuando se procese un depósito, **automáticamente vincule la wallet** si no está vinculada
- Cuando un usuario conecte su wallet por primera vez, cree las entradas necesarias en `users` y `user_wallets`
