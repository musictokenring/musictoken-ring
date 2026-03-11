# 🔐 Configuración de Wallet Separada para Pool MTR

## 📋 IMPORTANTE: Protección de Wallet de Tesorería

Para proteger los **99 millones de MTR** en la wallet de tesorería, necesitas configurar una wallet separada para el pool de auto-swap.

---

## 🎯 PASO 1: Crear Wallet Separada (Opcional pero Recomendado)

### Opción A: Usar Wallet Existente
Si ya tienes una wallet que quieres usar solo para el pool de auto-swap, usa esa dirección.

### Opción B: Crear Nueva Wallet
1. Usa MetaMask o cualquier wallet
2. Crea una nueva cuenta
3. Copia la dirección (address)
4. **NO necesitas fondos en esta wallet** - el sistema transferirá MTR automáticamente

---

## 🎯 PASO 2: Configurar Variable de Entorno en Render

### Variable a Agregar:
```
MTR_POOL_WALLET=<dirección_de_wallet_separada>
```

**Ejemplo**:
```
MTR_POOL_WALLET=0x1234567890123456789012345678901234567890
```

### ¿Qué Pasa si NO Configuras Esta Variable?

**Comportamiento por defecto**:
- El sistema usará `PLATFORM_WALLET` (wallet de tesorería)
- Verás una **ADVERTENCIA** en los logs:
  ```
  ⚠️ ADVERTENCIA: MTR_POOL_WALLET es la misma que PLATFORM_WALLET
  ⚠️ Esto significa que se usará la wallet de tesorería para swaps
  ⚠️ Recomendación: Configurar MTR_POOL_WALLET como wallet separada
  ```
- **Los swaps funcionarán**, pero usarán la wallet de tesorería

---

## 🎯 PASO 3: Cómo Funciona el Sistema

### Flujo con Wallet Separada:

1. **Usuario deposita USDC** → Llega a `PLATFORM_WALLET`
2. **Sistema compra MTR** → MTR va a `MTR_POOL_WALLET` (wallet separada)
3. **Usuario gana y retira** → Si falta USDC, sistema vende MTR de `MTR_POOL_WALLET`
4. **Resultado**: Los 99 millones en `PLATFORM_WALLET` **NO se tocan**

### Flujo sin Wallet Separada (por defecto):

1. **Usuario deposita USDC** → Llega a `PLATFORM_WALLET`
2. **Sistema compra MTR** → MTR va a `PLATFORM_WALLET` (misma wallet)
3. **Usuario gana y retira** → Si falta USDC, sistema vende MTR de `PLATFORM_WALLET`
4. **Resultado**: El sistema verá los 99 millones y podría intentar venderlos

---

## ⚠️ IMPORTANTE: Aprobación de Tokens (AUTOMÁTICA)

### ✅ El Sistema Aprueba Tokens Automáticamente

**NO necesitas aprobar tokens manualmente**. El código lo hace automáticamente.

**Cómo Funciona**:

1. **Si NO configuras `MTR_POOL_WALLET`** (usa `PLATFORM_WALLET` por defecto):
   - ✅ USDC se aprueba automáticamente cuando se necesita comprar MTR
   - ✅ MTR se aprueba automáticamente cuando se necesita vender
   - ✅ **TODO ES AUTOMÁTICO** - No necesitas hacer nada

2. **Si configuras `MTR_POOL_WALLET` nueva**:
   - Si `SWAP_WALLET_PRIVATE_KEY` es de la misma wallet → ✅ Todo automático
   - Si `SWAP_WALLET_PRIVATE_KEY` es diferente → ⚠️ Podría necesitar aprobación manual (caso avanzado)

**Para uso normal (sin wallet nueva)**: Todo es automático ✅

---

## 📊 Verificación

### Después de Configurar:

1. **Revisa los logs** al iniciar el servidor:
   ```
   [mtr-swap] ✅ MTR_POOL_WALLET configurada separadamente
   [mtr-swap] Swap wallet: 0x...
   [mtr-swap] MTR pool wallet: 0x... (diferente de PLATFORM_WALLET)
   [mtr-swap] Platform wallet (tesorería): 0x75376BC58830f27415402875D26B73A6BE8E2253
   ```

2. **Si ves advertencia**, significa que `MTR_POOL_WALLET === PLATFORM_WALLET`

---

## 🎯 RECOMENDACIÓN FINAL

**Para máxima seguridad**:
1. ✅ Crear wallet nueva solo para pool
2. ✅ Configurar `MTR_POOL_WALLET` con esa dirección
3. ✅ Usar `SWAP_WALLET_PRIVATE_KEY` de esa misma wallet (o de PLATFORM_WALLET si prefieres)

**Esto garantiza**:
- ✅ Los 99 millones están protegidos
- ✅ Solo se usa MTR comprado automáticamente
- ✅ Control total sobre qué MTR se vende

---

## ❓ PREGUNTAS FRECUENTES

### ¿Necesito fondos en MTR_POOL_WALLET?
**No**. El sistema transferirá MTR automáticamente cuando compre.

### ¿Puedo usar PLATFORM_WALLET como MTR_POOL_WALLET?
**Sí**, pero verás advertencias. Los 99 millones podrían verse afectados.

### ¿Qué pasa si no configuro MTR_POOL_WALLET?
El sistema usará `PLATFORM_WALLET` por defecto y mostrará advertencias.

### ¿Necesito aprobar tokens manualmente?
Solo si `MTR_POOL_WALLET` es diferente de la wallet con `SWAP_WALLET_PRIVATE_KEY`.

---

## ✅ CHECKLIST DE CONFIGURACIÓN

- [ ] Decidir si usar wallet separada o no
- [ ] Si sí: Crear/configurar wallet separada
- [ ] Agregar `MTR_POOL_WALLET` en Render (si usas wallet separada)
- [ ] Verificar logs al iniciar servidor
- [ ] Confirmar que no hay advertencias (o entender las advertencias)

---

¿Necesitas ayuda con algún paso específico?
