# 📋 PLAN DE REFACTORIZACIÓN: USDC Directo + MTR Nominal

**Objetivo:** Simplificar flujo para usuarios (USDC directo), eliminar volatilidad interna, generar marketing MTR sin riesgo.

**Fecha:** 2026-03-11  
**Estado:** Planificación

---

## 🎯 PRINCIPIOS FUNDAMENTALES

1. **USDC como base real**: Todo respaldado por USDC real en vault
2. **MTR como nominal interno**: Solo branding, sin valor real hasta retirar
3. **No tocar contratos existentes**: Mantener MTR ERC-20, dashboard, modos de juego
4. **Modificar solo flujos**: Depósitos, apuestas, retiros, fees

---

## 📊 FLUJO ACTUAL vs FLUJO NUEVO

### FLUJO ACTUAL (Simplificado)
```
Depósito MTR → Conversión a créditos → Apuestas → Retiro MTR/USDC
```

### FLUJO NUEVO (Propuesto)
```
Depósito USDC → Créditos MTR nominales 1:1 → Apuestas → Retiro USDC
Depósito MTR (opcional) → Swap a USDC → Créditos MTR nominales 1:1 → Apuestas → Retiro USDC
```

---

## 🔧 MODIFICACIONES POR COMPONENTE

### 1. DEPÓSITOS (`backend/deposit-listener.js`)

#### Cambios Requeridos:

**A. Priorizar USDC Directo:**
```javascript
// Detectar transferencia USDC → PLATFORM_WALLET
// Calcular: amount - (amount * 0.05) = netAmount (fee 5%)
// Emitir créditos nominales: netAmount (1:1 con USDC)
// Transferir fee (5%) a vault
```

**B. MTR Opcional con Swap:**
```javascript
// Detectar transferencia MTR → PLATFORM_WALLET
// Swap automático MTR → USDC (Aerodrome router)
// Calcular: usdcAmount - (usdcAmount * 0.05) = netAmount
// Emitir créditos nominales: netAmount (1:1 con USDC obtenido)
// Transferir fee (5%) a vault
```

**C. Distribución de Fees:**
```javascript
// Fee 5% del depósito:
// - 70-80% → vault (USDC real)
// - 20-30% → trading fund (nueva wallet)
```

#### Archivos a Modificar:
- `backend/deposit-listener.js` (líneas ~100-300)
- Crear `backend/trading-fund-service.js` (nuevo)

---

### 2. APUESTAS (`game-engine.js`)

#### Cambios Requeridos:

**A. Usar Solo Créditos Nominales:**
```javascript
// Ya está implementado: usa user_credits (nominales)
// NO cambiar lógica de juego, solo ajustar fees
```

**B. Fees Divididos:**
```javascript
// Fee 2% del pozo:
// - 70-80% → vault (USDC real)
// - 20-30% → trading fund (nueva wallet)
```

#### Archivos a Modificar:
- `game-engine.js` (función `sendBetFeeToVault`, línea ~4476)
- Crear función `distributeFeeToVaultAndTradingFund()`

---

### 3. RETIROS (`backend/claim-service.js`)

#### Cambios Requeridos:

**A. Conversión Nominales → USDC:**
```javascript
// Usuario pide retirar X nominales
// Verificar: vault.balance >= X
// Calcular fee: X * 0.05
// Distribuir fee: 70-80% vault, 20-30% trading fund
// Transferir: (X - fee) USDC real
// Quemar/decrementar: X nominales
```

**B. Validación de Vault:**
```javascript
// CRÍTICO: Verificar que vault tiene suficiente USDC
// Si no hay suficiente, rechazar retiro o usar cola
```

#### Archivos a Modificar:
- `backend/claim-service.js` (función `processClaim`)
- Agregar validación de vault balance

---

### 4. TRADING FUND (Nuevo)

#### Componentes a Crear:

**A. Wallet de Trading Fund:**
```javascript
// Nueva wallet: 0x[TBD] (crear manualmente)
// Solo recibe fees, nunca toca vault/apuestas
```

**B. Servicio de Distribución:**
```javascript
// backend/trading-fund-service.js
// Función: distributeFee(amount, feeType)
// - Calcula 70-80% → vault
// - Calcula 20-30% → trading fund
// - Transfiere USDC a ambas wallets
```

**C. Bot MTR (Separado):**
```python
# backend/mtr-trading-bot.py
# Usa trading fund para market making/arbitrage
# NO toca vault ni apuestas
# Genera volumen/hype en Aerodrome
```

#### Archivos a Crear:
- `backend/trading-fund-service.js` (nuevo)
- `backend/mtr-trading-bot.py` (nuevo)
- `.env.example` (agregar `TRADING_FUND_WALLET`)

---

### 5. UI (`index.html`)

#### Cambios Requeridos:

**A. Sección de Depósito:**
```html
<!-- Enfocar en USDC directo -->
<button>Depositar USDC Directo</button> <!-- Principal -->
<button>Convertir MTR a Créditos</button> <!-- Secundario -->

<!-- Explicación clara -->
<p>Créditos MTR nominales: X = $X USDC estables</p>
<p>Respaldados 1:1 por USDC real en vault</p>
```

**B. Sección de Retiro:**
```html
<!-- Explicar conversión -->
<p>Retiras créditos nominales → Recibes USDC real</p>
<p>Fee de retiro: 5%</p>
```

#### Archivos a Modificar:
- `index.html` (sección de depósito/retiro)

---

## 🔒 SEGURIDAD Y VALIDACIONES

### Validaciones Críticas:

1. **Vault Balance Check:**
   ```javascript
   // Antes de retiro: verificar vault.balance >= amount
   if (vaultBalance < requestedAmount) {
       throw new Error('Vault insuficiente');
   }
   ```

2. **Fee Distribution:**
   ```javascript
   // Validar que suma de fees = 100%
   const vaultFee = amount * 0.75; // 75%
   const tradingFundFee = amount * 0.25; // 25%
   assert(vaultFee + tradingFundFee === amount * feeRate);
   ```

3. **Nominales vs USDC:**
   ```javascript
   // Validar que créditos nominales emitidos = USDC neto recibido
   // (1:1 respaldo)
   ```

---

## 📝 IMPLEMENTACIÓN ITERATIVA

### Fase 1: Depósitos y Retiros (Prioridad Alta)
- [ ] Modificar `deposit-listener.js` para priorizar USDC
- [ ] Agregar swap MTR → USDC opcional
- [ ] Crear `trading-fund-service.js`
- [ ] Modificar `claim-service.js` para retiros USDC
- [ ] Validar vault balance antes de retiros

### Fase 2: Fees Divididos (Prioridad Media)
- [ ] Modificar `sendBetFeeToVault` en `game-engine.js`
- [ ] Implementar distribución 70-80% / 20-30%
- [ ] Actualizar logs y monitoreo

### Fase 3: UI y UX (Prioridad Media)
- [ ] Actualizar sección de depósito en `index.html`
- [ ] Enfocar en USDC directo
- [ ] Explicar créditos nominales claramente

### Fase 4: Bot MTR (Prioridad Baja)
- [ ] Crear `mtr-trading-bot.py`
- [ ] Configurar market making en Aerodrome
- [ ] Implementar stops-loss y gestión de riesgo

---

## 🧪 TESTING

### Tests Requeridos:

1. **Depósito USDC:**
   - Enviar 100 USDC → Verificar 95 créditos nominales (5% fee)
   - Verificar distribución de fee (75% vault, 25% trading fund)

2. **Depósito MTR:**
   - Enviar MTR → Verificar swap a USDC
   - Verificar créditos nominales = USDC obtenido (menos fee)

3. **Apuesta:**
   - Apostar 10 nominales → Verificar fee 2% distribuido correctamente

4. **Retiro:**
   - Retirar 100 nominales → Verificar 95 USDC transferidos (5% fee)
   - Verificar distribución de fee

---

## 📊 CONFIGURACIÓN

### Variables de Entorno Nuevas:

```env
# Trading Fund
TRADING_FUND_WALLET=0x[TBD]
TRADING_FUND_PERCENTAGE=25  # 20-30%

# Vault
VAULT_WALLET=0x75376BC58830f27415402875D26B73A6BE8E2253
VAULT_FEE_PERCENTAGE=75  # 70-80%

# Fees
DEPOSIT_FEE_RATE=0.05  # 5%
WITHDRAWAL_FEE_RATE=0.05  # 5%
BET_FEE_RATE=0.02  # 2%
```

---

## ⚠️ ADVERTENCIAS

1. **NO modificar contratos existentes** (MTR ERC-20, etc.)
2. **NO cambiar lógica de juego** (modos, verificación streams)
3. **Solo modificar flujos** de depósito/apuesta/retiro
4. **Mantener compatibilidad** con usuarios existentes

---

## ✅ CHECKLIST DE VALIDACIÓN

- [ ] Depósitos USDC funcionan correctamente
- [ ] Depósitos MTR con swap funcionan
- [ ] Fees distribuidos correctamente (vault + trading fund)
- [ ] Retiros validan vault balance
- [ ] Retiros transfieren USDC correctamente
- [ ] UI explica claramente créditos nominales
- [ ] Bot MTR separado (no toca vault/apuestas)
- [ ] Tests pasan en testnet Base

---

**Próximos Pasos:**
1. Revisar código actual en detalle
2. Implementar Fase 1 (Depósitos y Retiros)
3. Testing exhaustivo
4. Implementar Fase 2 (Fees Divididos)
5. Continuar iterativamente
