# ⚠️ VERIFICACIÓN CRÍTICA: Variables de Entorno en Render

## 🔍 PROBLEMA DETECTADO

### Variable Faltante: `PLATFORM_WALLET_ADDRESS`

**Situación actual:**
- ✅ Tienes `ADMIN_WALLET_ADDRESS` en Render
- ❌ **NO tienes `PLATFORM_WALLET_ADDRESS` en Render**
- ⚠️ El código busca `PLATFORM_WALLET_ADDRESS` en múltiples lugares

**Código que busca `PLATFORM_WALLET_ADDRESS`:**
- `deposit-listener.js` (línea 13)
- `mtr-swap-service.js` (línea 19)
- `server-auto.js` (línea 106)
- `claim-service.js` (línea 18) - pero usa `ADMIN_WALLET_ADDRESS`
- Y muchos otros archivos...

---

## ✅ BUENAS NOTICIAS

### 1. `MTR_POOL_WALLET` No Existe → Es Seguro

**Código:**
```javascript
const MTR_POOL_WALLET = process.env.MTR_POOL_WALLET || PLATFORM_WALLET;
```

**Comportamiento:**
- Si `MTR_POOL_WALLET` no existe → Usa `PLATFORM_WALLET` como fallback
- ✅ **Esto es SEGURO** - El MTR comprado va a `PLATFORM_WALLET`
- ✅ **NO es la causa de la fuga** - La fuga fue de USDC, no de MTR

---

### 2. Fallback en el Código

**Código en múltiples archivos:**
```javascript
const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS || '0x0000000000000000000000000000000000000001';
```

**Comportamiento:**
- Si `PLATFORM_WALLET_ADDRESS` no existe → Usa la dirección hardcodeada
- ✅ **Esto funciona** - El sistema usa la dirección por defecto
- ⚠️ **PERO** es mejor tenerla explícitamente configurada

---

## ⚠️ VERIFICACIONES NECESARIAS

### 1. Verificar que `ADMIN_WALLET_ADDRESS` = `PLATFORM_WALLET_ADDRESS`

**Pregunta crítica:**
- ¿`ADMIN_WALLET_ADDRESS` en Render es `0x0000000000000000000000000000000000000001`?

**Si NO es la misma:**
- 🔴 **PROBLEMA CRÍTICO** - Las wallets no están sincronizadas
- Esto podría causar que los fondos vayan a direcciones incorrectas

**Solución:**
- Agregar `PLATFORM_WALLET_ADDRESS` en Render con el mismo valor que `ADMIN_WALLET_ADDRESS`
- O verificar que ambas apunten a la misma wallet

---

### 2. Verificar que `ADMIN_WALLET_PRIVATE_KEY` corresponde a `PLATFORM_WALLET`

**Pregunta crítica:**
- ¿`ADMIN_WALLET_PRIVATE_KEY` es la clave privada de `0x0000000000000000000000000000000000000001`?

**Si NO corresponde:**
- 🔴 **PROBLEMA CRÍTICO** - Las claves no coinciden con las wallets
- Esto podría causar que las transacciones fallen o vayan a direcciones incorrectas

---

### 3. Verificar que `SWAP_WALLET_PRIVATE_KEY` es segura

**Código:**
```javascript
const SWAP_WALLET_PRIVATE_KEY = process.env.SWAP_WALLET_PRIVATE_KEY || process.env.ADMIN_WALLET_PRIVATE_KEY;
```

**Comportamiento:**
- Si `SWAP_WALLET_PRIVATE_KEY` no existe → Usa `ADMIN_WALLET_PRIVATE_KEY`
- ✅ Esto es aceptable si ambas wallets son la misma
- ⚠️ Pero es mejor tener una wallet separada para swaps

---

## 🎯 ACCIONES RECOMENDADAS

### 1. Agregar `PLATFORM_WALLET_ADDRESS` en Render ⚠️ URGENTE

**Valor a configurar:**
```
PLATFORM_WALLET_ADDRESS = 0x0000000000000000000000000000000000000001
```

**O si `ADMIN_WALLET_ADDRESS` es diferente, usar ese valor:**
```
PLATFORM_WALLET_ADDRESS = [mismo valor que ADMIN_WALLET_ADDRESS]
```

---

### 2. Verificar Sincronización de Wallets

**Ejecuta este check en Supabase SQL Editor:**

```sql
-- Verificar si hay transacciones a direcciones desconocidas
SELECT DISTINCT 
    vt.wallet_address,
    COUNT(*) as transaction_count,
    SUM(vt.amount_usdc) as total_usdc
FROM vault_transactions vt
LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(vt.wallet_address)
WHERE vt.transaction_type = 'withdrawal'
AND u.id IS NULL
GROUP BY vt.wallet_address
ORDER BY total_usdc DESC;
```

**Esto mostrará:** Direcciones que recibieron fondos pero no pertenecen a usuarios.

---

### 3. Verificar Logs del Servidor

**En Render → Logs, busca:**
- `Platform Wallet:` - Debe mostrar `0x0000000000000000000000000000000000000001`
- `MTR pool wallet:` - Debe mostrar la misma dirección (porque `MTR_POOL_WALLET` no existe)
- `Admin wallet:` - Debe coincidir con `PLATFORM_WALLET`

---

## 📊 CONCLUSIÓN

### ✅ Lo que está bien:
1. `MTR_POOL_WALLET` no existe → Usa `PLATFORM_WALLET` (seguro)
2. El código tiene fallbacks que funcionan

### ⚠️ Lo que necesita verificación:
1. **`PLATFORM_WALLET_ADDRESS` no existe** → Agregarla explícitamente
2. **Verificar que `ADMIN_WALLET_ADDRESS` = `PLATFORM_WALLET`** → Deben ser la misma
3. **Verificar que las claves privadas corresponden** → Deben coincidir con las wallets

### 🔴 Causa más probable de la fuga:
**Sigue siendo el endpoint `/api/claim` sin validación** (ya corregido), pero necesitamos verificar:
- Si `ADMIN_WALLET_ADDRESS` y `PLATFORM_WALLET_ADDRESS` están sincronizadas
- Si las claves privadas corresponden a las wallets correctas

---

## 🎯 PRÓXIMOS PASOS

1. **Verificar valor de `ADMIN_WALLET_ADDRESS` en Render**
2. **Agregar `PLATFORM_WALLET_ADDRESS` con el mismo valor**
3. **Revisar logs del servidor para confirmar qué wallet está usando**
4. **Ejecutar queries SQL para encontrar la dirección del atacante**

**¿Puedes verificar qué valor tiene `ADMIN_WALLET_ADDRESS` en Render? Debe ser `0x0000000000000000000000000000000000000001`.**
