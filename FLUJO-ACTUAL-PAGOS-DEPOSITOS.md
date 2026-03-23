# 💰 FLUJO ACTUAL: Pagos y Depósitos - Music Token Ring

**Fecha:** 2026-03-11  
**Versión:** Sistema Refactorizado (USDC Directo + MTR Nominal)

---

## 📋 CONFIGURACIÓN GENERAL

### Wallets Principales:

```env
# Wallet de la Plataforma (Recibe depósitos)
PLATFORM_WALLET_ADDRESS=0x0000000000000000000000000000000000000001

# Vault Wallet (Respalda créditos con USDC real)
VAULT_WALLET_ADDRESS=0x0000000000000000000000000000000000000001

# Trading Fund Wallet (Para market making MTR)
TRADING_FUND_WALLET=0x[TBD] # Configurada por usuario

# Tokens
MTR_TOKEN_ADDRESS=0x99cd1eb32846c9027ed9cb8710066fa08791c33b
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

### Fees Configurados:

```env
# Fees por Tipo de Operación
DEPOSIT_FEE_RATE=0.05      # 5% del depósito
WITHDRAWAL_FEE_RATE=0.05   # 5% del retiro
BET_FEE_RATE=0.02          # 2% del pozo de apuesta

# Distribución de Fees
VAULT_FEE_PERCENTAGE=75        # 70-80% va al vault
TRADING_FUND_FEE_PERCENTAGE=25 # 20-30% va al trading fund
```

---

## 💵 FLUJO 1: DEPÓSITOS

### Opción A: Depósito USDC Directo (RECOMENDADO)

**Flujo:**
```
1. Usuario envía USDC → PLATFORM_WALLET (0x7537...2253)
2. DepositListener detecta transferencia USDC
3. Calcula:
   - Valor USDC recibido: X
   - Fee (5%): X * 0.05 = fee
   - Créditos nominales otorgados: X - fee (1:1 con USDC)
4. Acredita créditos nominales al usuario
5. Distribuye fee:
   - 75% → Vault Wallet (USDC real)
   - 25% → Trading Fund Wallet (USDC real)
```

**Ejemplo:**
```
Usuario envía: 100 USDC
Fee (5%): 5 USDC
Créditos otorgados: 95 créditos nominales
Distribución fee:
  - Vault: 3.75 USDC
  - Trading Fund: 1.25 USDC
```

**Archivo:** `backend/deposit-listener.js` (líneas 292-340)

---

### Opción B: Depósito MTR (Opcional con Swap Automático)

**Flujo:**
```
1. Usuario envía MTR → PLATFORM_WALLET
2. DepositListener detecta transferencia MTR
3. Intenta swap automático MTR → USDC (Aerodrome):
   - Si swap exitoso: usa USDC recibido
   - Si swap falla: usa precio MTR/USDC actual
4. Calcula igual que depósito USDC:
   - Valor en USDC: X
   - Fee (5%): X * 0.05
   - Créditos nominales: X - fee
5. Acredita créditos nominales
6. Distribuye fee (75% vault, 25% trading fund)
```

**Ejemplo:**
```
Usuario envía: 100,000 MTR
Precio MTR/USDC: 0.001
Valor en USDC: 100 USDC
Fee (5%): 5 USDC
Créditos otorgados: 95 créditos nominales
```

**Archivo:** `backend/deposit-listener.js` (líneas 296-340)

---

## 💸 FLUJO 2: RETIROS

**Flujo:**
```
1. Usuario solicita retirar X créditos nominales
2. ClaimService valida:
   - Usuario tiene suficientes créditos
   - Vault tiene suficiente USDC
3. Calcula:
   - Fee (5%): X * 0.05 = fee
   - USDC a enviar: X - fee (1:1 con créditos)
4. Transfiere USDC real al usuario
5. Quema/decrementa X créditos nominales
6. Distribuye fee:
   - 75% → Vault Wallet
   - 25% → Trading Fund Wallet
```

**Ejemplo:**
```
Usuario solicita retirar: 100 créditos nominales
Fee (5%): 5 créditos
USDC enviado: 95 USDC real
Distribución fee:
  - Vault: 3.75 USDC
  - Trading Fund: 1.25 USDC
```

**Validaciones:**
- ✅ Verifica balance del vault antes de pagar
- ✅ Si vault bajo, intenta vender MTR para obtener USDC
- ✅ Rechaza retiro si no hay suficiente USDC

**Archivo:** `backend/claim-service.js` (líneas 100-250)

---

## 🎮 FLUJO 3: APUESTAS Y FEES

### Creación de Apuesta:

**Flujo:**
```
1. Usuario apuesta X créditos nominales
2. Se deducen créditos del balance del usuario
3. Créditos van a escrow (pozo de la batalla)
4. Pozo total = suma de apuestas de ambos jugadores
```

### Distribución de Premios:

**Flujo:**
```
1. Batalla termina, hay un ganador
2. Pozo total = apuesta1 + apuesta2
3. Calcula fee (2% del pozo):
   - Fee = pozo * 0.02
4. Premio al ganador:
   - Premio = pozo - fee
5. Distribuye fee:
   - 75% → Vault Wallet (USDC real)
   - 25% → Trading Fund Wallet (USDC real)
6. Acredita premio al ganador en créditos nominales
```

**Ejemplo:**
```
Jugador 1 apuesta: 50 créditos
Jugador 2 apuesta: 50 créditos
Pozo total: 100 créditos
Fee (2%): 2 créditos
Premio ganador: 98 créditos nominales
Distribución fee (en USDC equivalente):
  - Vault: 1.5 USDC
  - Trading Fund: 0.5 USDC
```

**Archivo:** `game-engine.js` (línea 4479) → `backend/server-auto.js` (endpoint `/api/vault/add-fee`)

---

## 🔄 CONVERSIÓN: CRÉDITOS NOMINALES

### Concepto:

**Créditos Nominales MTR:**
- Son fichas internas de la plataforma
- Valor fijo: **1 crédito = 1 USDC** (siempre)
- NO fluctúan como el token MTR nativo
- Respaldados 1:1 por USDC real en vault
- Se usan para apostar dentro de la plataforma

### Conversión:

```
Depósito:
  USDC real → Créditos nominales (1:1, menos fee)

Apuestas:
  Créditos nominales → Créditos nominales (sin conversión)

Retiro:
  Créditos nominales → USDC real (1:1, menos fee)
```

---

## 💼 DISTRIBUCIÓN DE FEES

### Trading Fund Service:

**Archivo:** `backend/trading-fund-service.js`

**Función:** `distributeFee(totalFeeAmount, feeType, txHash)`

**Distribución:**
```javascript
// Ejemplo: Fee de 10 USDC
Vault (75%): 7.5 USDC → VAULT_WALLET
Trading Fund (25%): 2.5 USDC → TRADING_FUND_WALLET
```

**Tipos de Fee:**
- `'deposit'` - Fee de depósito (5%)
- `'withdrawal'` - Fee de retiro (5%)
- `'bet'` - Fee de apuesta (2% del pozo)

**Fallback:**
- Si Trading Fund no está configurado → Todo va al vault
- Si transferencia falla → Envía al vault como fallback

---

## 🔍 VALIDACIONES Y SEGURIDAD

### Depósitos:

✅ **Protección contra duplicados:**
- Verifica `tx_hash` único en base de datos
- Usa `sessionStorage` para evitar procesamiento múltiple
- Escanea bloques históricos al iniciar

✅ **Validación de transacciones:**
- Verifica que la transacción fue exitosa
- Valida dirección del remitente
- Ignora transferencias internas (desde platform wallet)

### Retiros:

✅ **Validación de balance:**
- Verifica créditos suficientes del usuario
- Verifica USDC suficiente en vault
- Intenta obtener USDC vendiendo MTR si es necesario

✅ **Validación de wallet:**
- Formato de dirección válido (0x...)
- Verifica que el usuario tiene créditos

### Apuestas:

✅ **Validación de créditos:**
- Usuario debe tener créditos suficientes
- Apuesta mínima: 5 créditos
- Verifica que el usuario puede cubrir la apuesta

---

## 📊 ENDPOINTS DEL BACKEND

### `/api/vault/add-fee`

**Método:** POST

**Body:**
```json
{
  "feeType": "deposit" | "withdrawal" | "bet",
  "amount": 10.5,
  "matchId": "uuid-opcional",
  "sourceTxHash": "0x...-opcional"
}
```

**Respuesta:**
```json
{
  "success": true,
  "distributed": true,
  "vaultAmount": 7.5,
  "tradingFundAmount": 2.5,
  "vaultTxHash": "0x...",
  "tradingFundTxHash": "0x..."
}
```

**Archivo:** `backend/server-auto.js` (línea 1641)

---

## 🗄️ TABLAS DE BASE DE DATOS

### `deposits`:
```sql
- id (UUID)
- user_id (UUID)
- tx_hash (TEXT, UNIQUE)
- token (TEXT) -- 'USDC' o 'MTR'
- amount (DECIMAL)
- credits_awarded (DECIMAL)
- usdc_value_at_deposit (DECIMAL)
- deposit_fee (DECIMAL) -- 5%
- rate_used (DECIMAL)
- status (TEXT)
- processed_at (TIMESTAMP)
```

### `claims`:
```sql
- id (UUID)
- user_id (UUID)
- credits_amount (DECIMAL)
- usdc_amount (DECIMAL)
- withdrawal_fee (DECIMAL) -- 5%
- recipient_wallet (TEXT)
- status (TEXT)
- tx_hash (TEXT)
- created_at (TIMESTAMP)
```

### `user_credits`:
```sql
- user_id (UUID, PRIMARY KEY)
- credits (DECIMAL) -- Créditos nominales
- updated_at (TIMESTAMP)
```

---

## 🔄 FLUJO COMPLETO EJEMPLO

### Escenario: Usuario deposita, apuesta y retira

```
1. DEPÓSITO:
   Usuario envía 100 USDC → Platform Wallet
   → Recibe 95 créditos nominales
   → Fee 5 USDC distribuido (3.75 vault, 1.25 trading fund)

2. APUESTA:
   Usuario apuesta 50 créditos nominales
   → Se deducen 50 créditos
   → Pozo total: 100 créditos (50 + 50 del oponente)
   → Usuario gana → Recibe 98 créditos (100 - 2% fee)
   → Fee 2 créditos distribuido (1.5 vault, 0.5 trading fund)

3. RETIRO:
   Usuario retira 100 créditos nominales
   → Recibe 95 USDC real
   → Fee 5 créditos distribuido (3.75 vault, 1.25 trading fund)
   → Balance final: 0 créditos nominales
```

---

## ⚙️ CONFIGURACIÓN REQUERIDA

### Variables de Entorno (.env):

```env
# Wallets
PLATFORM_WALLET_ADDRESS=0x0000000000000000000000000000000000000001
VAULT_WALLET_ADDRESS=0x0000000000000000000000000000000000000001
TRADING_FUND_WALLET=0x[TBD]

# Tokens
MTR_TOKEN_ADDRESS=0x99cd1eb32846c9027ed9cb8710066fa08791c33b
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

# Fees
DEPOSIT_FEE_RATE=0.05
WITHDRAWAL_FEE_RATE=0.05
BET_FEE_RATE=0.02

# Distribución
VAULT_FEE_PERCENTAGE=75
TRADING_FUND_FEE_PERCENTAGE=25

# RPC
BASE_RPC_URL=https://mainnet.base.org

# Admin
ADMIN_WALLET_PRIVATE_KEY=[PRIVATE_KEY]
ADMIN_WALLET_ADDRESS=[ADDRESS]

# Supabase
SUPABASE_URL=https://bscmgcnynbxalcuwdqlm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=[KEY]
```

---

## 📝 NOTAS IMPORTANTES

### Créditos Nominales:
- ✅ **NO** son tokens MTR reales
- ✅ Son fichas internas respaldadas por USDC
- ✅ Valor fijo 1:1 con USDC (sin volatilidad)
- ✅ Se ganan/perden en batallas
- ✅ Pueden exceder el balance on-chain MTR (por ganancias)

### Fees:
- ✅ Todos los fees se calculan en USDC equivalente
- ✅ Se distribuyen automáticamente (75% vault, 25% trading fund)
- ✅ Si trading fund no está configurado, todo va al vault

### Seguridad:
- ✅ Validación de balance antes de retiros
- ✅ Protección contra duplicados en depósitos
- ✅ Verificación de transacciones on-chain
- ✅ Fallbacks para casos de error

---

**Última Actualización:** 2026-03-11  
**Estado:** ✅ Sistema en Producción
