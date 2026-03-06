# FLUJO COMPLETO DE PAGOS - MUSICTOKEN RING

## 📋 RESUMEN EJECUTIVO

El sistema utiliza un modelo de **créditos estables** donde:
- **1 crédito = 1 USDC** (tasa fija, no variable)
- Los usuarios depositan **MTR** o **USDC** directamente a una wallet centralizada de la plataforma
- El sistema detecta automáticamente los depósitos en blockchain
- Los créditos se almacenan en base de datos (no en blockchain)
- Los retiros se procesan desde el vault de la plataforma

---

## 🏦 DIRECCIONES DE WALLET

### Wallet Principal de la Plataforma (Recibe Depósitos)
```
Dirección: 0x75376BC58830f27415402875D26B73A6BE8E2253
Red: Base Network (Chain ID: 8453)
Propósito: Recibir todos los depósitos de usuarios (MTR y USDC)
```

### Tokens Soportados
- **MTR Token**: `0x99cd1eb32846c9027ed9cb8710066fa08791c33b` (ERC-20 en Base)
- **USDC Token**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Base USDC, 6 decimales)

### Wallet Admin (Para Retiros)
```
Dirección: 0x75376BC58830f27415402875D26B73A6BE8E2253
(Actualmente la misma que la wallet de depósitos)
Propósito: Enviar USDC a usuarios cuando reclaman créditos
```

---

## 💰 FLUJO DE DEPÓSITOS

### 1. Usuario Realiza Depósito

**Opción A: Depósito Directo**
- Usuario envía MTR o USDC desde su wallet personal a la dirección de la plataforma
- Dirección destino: `0x75376BC58830f27415402875D26B73A6BE8E2253`
- Transacción se confirma en Base Network

**Opción B: Depósito vía Ramp Network**
- Usuario compra USDC con fiat (COP, USD, etc.) usando widget de Ramp
- Ramp envía USDC a la wallet del usuario
- Usuario transfiere USDC desde su wallet a la wallet de la plataforma
- El sistema detecta automáticamente la transferencia

### 2. Detección Automática de Depósito

**Servicio: `DepositListener`** (`backend/deposit-listener.js`)

El sistema monitorea constantemente la blockchain usando:

```javascript
// Escucha eventos Transfer de tokens ERC-20
publicClient.watchEvent({
    address: tokenAddress, // MTR o USDC
    event: Transfer,
    args: { to: PLATFORM_WALLET } // Solo transferencias A la plataforma
})
```

**Proceso:**
1. Escanea los últimos 1000 bloques al iniciar
2. Monitorea nuevos bloques en tiempo real
3. Detecta eventos `Transfer` donde `to = PLATFORM_WALLET`
4. Verifica que la transacción fue exitosa
5. Evita procesar transacciones duplicadas

### 3. Procesamiento del Depósito

**Archivo:** `backend/deposit-listener.js` → función `processDeposit()`

**Pasos:**

1. **Extraer información de la transacción:**
   - `from`: Dirección de wallet del usuario
   - `value`: Cantidad de tokens transferidos
   - `txHash`: Hash de la transacción

2. **Convertir a valor USDC:**
   ```javascript
   if (tokenName === 'USDC') {
       usdcValue = amount; // 1 USDC = 1 USDC
   } else if (tokenName === 'MTR') {
       mtrPrice = await getMTRPrice(); // Precio actual de MTR en USDC
       usdcValue = amount * mtrPrice; // Valor equivalente en USDC
   }
   ```

3. **Calcular fee de depósito (5%):**
   ```javascript
   const DEPOSIT_FEE_RATE = 0.05; // 5%
   const depositFee = usdcValue * DEPOSIT_FEE_RATE;
   ```

4. **Calcular créditos otorgados:**
   ```javascript
   // Sistema de créditos estables: 1 crédito = 1 USDC
   const credits = usdcValue - depositFee;
   // Ejemplo: Si deposita 100 USDC
   // - Fee: 5 USDC
   // - Créditos: 95 créditos (95 USDC)
   ```

### 4. Identificación del Usuario

**Modalidad: Identificación por Wallet Address**

El sistema identifica usuarios por su dirección de wallet de Ethereum:

```javascript
// Buscar usuario por wallet_address
const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('wallet_address', from.toLowerCase()) // Dirección del remitente
    .single();
```

**Si el usuario no existe:**
- Se crea automáticamente un nuevo registro en la tabla `users`
- Se asigna un `user_id` único
- Se guarda la `wallet_address` en minúsculas

**Tabla `users`:**
```sql
- id (UUID, primary key)
- wallet_address (text, unique, lowercase)
- created_at (timestamp)
- (otros campos de perfil)
```

### 5. Acreditación de Créditos

**Tabla: `user_credits`**

```javascript
// Incrementar créditos del usuario
await supabase.rpc('increment_user_credits', {
    user_id_param: userId,
    credits_to_add: credits
});
```

**Estructura:**
```sql
- user_id (UUID, foreign key → users.id)
- credits (DECIMAL, balance actual)
- updated_at (timestamp)
```

**Características:**
- Los créditos se almacenan en **base de datos** (Supabase/PostgreSQL)
- **NO** se almacenan en blockchain
- Balance se actualiza atómicamente
- Soporta hasta 4 decimales de precisión

### 6. Registro del Depósito

**Tabla: `deposits`**

Se registra cada depósito con:
```sql
- id (UUID)
- user_id (UUID)
- tx_hash (text, unique) - Hash de transacción blockchain
- token (text) - 'MTR' o 'USDC'
- amount (DECIMAL) - Cantidad de tokens depositados
- credits_awarded (DECIMAL) - Créditos otorgados
- usdc_value_at_deposit (DECIMAL) - Valor en USDC al momento del depósito
- deposit_fee (DECIMAL) - Fee aplicado (5%)
- status (text) - 'processed'
- processed_at (timestamp)
```

### 7. Fee al Vault

**5% del depósito se envía al vault:**

```javascript
await sendFeeToVault(depositFee, 'deposit', txHash);
```

El vault acumula fees para:
- Mantener liquidez para retiros
- Pagar premios de batallas
- Operaciones de la plataforma

---

## 💸 FLUJO DE RETIROS (CLAIMS)

### 1. Usuario Solicita Retiro

**Mínimo:** 5 créditos (equivalente a 5 USDC)

**Proceso:**
1. Usuario ingresa cantidad de créditos a retirar
2. Frontend valida que tenga suficiente balance
3. Se envía request al backend: `POST /api/claim`

### 2. Procesamiento del Retiro

**Servicio: `ClaimService`** (`backend/claim-service.js`)

**Pasos:**

1. **Validar balance:**
   ```javascript
   // Verificar que el usuario tenga suficientes créditos
   const currentBalance = await getUserCredits(userId);
   if (currentBalance < credits) {
       throw new Error('Insufficient credits');
   }
   ```

2. **Calcular fee de retiro (5%):**
   ```javascript
   const WITHDRAWAL_FEE_RATE = 0.05; // 5%
   const withdrawalFee = credits * WITHDRAWAL_FEE_RATE;
   const usdcAmount = credits - withdrawalFee;
   ```

3. **Verificar liquidez del vault:**
   ```javascript
   const vaultBalance = await vaultService.getVaultBalance();
   if (vaultBalance < usdcAmount) {
       throw new Error('Insufficient vault liquidity');
   }
   ```

4. **Deducir créditos del usuario:**
   ```javascript
   await supabase.rpc('decrement_user_credits', {
       user_id_param: userId,
       credits_to_subtract: credits
   });
   ```

5. **Transferir USDC desde vault:**
   ```javascript
   // Transferir USDC desde wallet admin a wallet del usuario
   const txHash = await vaultService.withdrawFromVault(
       usdcAmount,
       walletAddress, // Wallet del usuario
       'claim_payout'
   );
   ```

6. **Registrar el claim:**
   ```sql
   Tabla: claims
   - user_id
   - credits_claimed
   - usdc_amount (después del fee)
   - withdrawal_fee
   - tx_hash (hash de la transacción de retiro)
   - status: 'completed'
   ```

7. **Fee al vault:**
   ```javascript
   // El fee de retiro también va al vault
   await vaultService.addFee(withdrawalFee, 'withdrawal', txHash);
   ```

---

## 📊 IDENTIFICACIÓN DE SALDOS

### Modalidad: Base de Datos Centralizada

**El sistema NO consulta balances directamente de blockchain para créditos.**

### 1. Balance de Créditos (En Plataforma)

**Endpoint:** `GET /api/user/credits/:walletAddress`

**Proceso:**
```javascript
// 1. Buscar usuario por wallet_address
const user = await supabase
    .from('users')
    .select('id')
    .eq('wallet_address', walletAddress.toLowerCase())
    .single();

// 2. Obtener créditos de la tabla user_credits
const creditsData = await supabase
    .from('user_credits')
    .select('credits')
    .eq('user_id', user.id)
    .single();

// 3. Retornar balance
return {
    credits: creditsData.credits,
    usdcValue: creditsData.credits, // 1:1 fijo
    userId: user.id
};
```

**Actualización:**
- Se actualiza cada 30 segundos automáticamente en el frontend
- Se actualiza inmediatamente después de depósitos/retiros/apuestas

### 2. Balance On-Chain (MTR en Wallet del Usuario)

**Solo para visualización, NO se usa para créditos:**

```javascript
// Leer balance de MTR directamente de blockchain
const mtrBalance = await publicClient.readContract({
    address: MTR_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [userWalletAddress]
});
```

**Propósito:**
- Mostrar al usuario cuánto MTR tiene en su wallet
- NO afecta el balance de créditos en la plataforma

### 3. Balance Jugable

**Cálculo:**
```javascript
// Balance jugable = créditos disponibles para apostar
const jugableBalance = creditsBalance; // Mismo que créditos
// (En el futuro podría haber restricciones, pero actualmente es igual)
```

---

## 🔄 ARQUITECTURA DEL SISTEMA

### Componentes Principales

1. **DepositListener** (`backend/deposit-listener.js`)
   - Monitorea blockchain en tiempo real
   - Detecta depósitos automáticamente
   - Procesa y acredita créditos

2. **VaultService** (`backend/vault-service.js`)
   - Gestiona el vault de liquidez
   - Acumula fees (depósito, apuesta, retiro)
   - Procesa retiros de usuarios

3. **ClaimService** (`backend/claim-service.js`)
   - Procesa solicitudes de retiro
   - Valida balances y liquidez
   - Ejecuta transferencias USDC

4. **CreditsSystem** (`src/credits-system.js` - Frontend)
   - Muestra balance de créditos
   - Actualiza UI en tiempo real
   - Maneja solicitudes de retiro

### Base de Datos (Supabase/PostgreSQL)

**Tablas principales:**

1. **`users`**
   - Almacena información de usuarios
   - Identificación por `wallet_address`

2. **`user_credits`**
   - Balance de créditos por usuario
   - Actualizado atómicamente

3. **`deposits`**
   - Historial de depósitos
   - Incluye tx_hash, amounts, fees

4. **`claims`**
   - Historial de retiros
   - Incluye tx_hash de retiro

5. **`vault_balance`**
   - Balance actual del vault
   - Sincronizado con blockchain

6. **`vault_fees`**
   - Registro de todos los fees acumulados
   - Por tipo: deposit, bet, withdrawal

---

## 📈 CONVERSIÓN DE VALORES

### Sistema de Créditos Estables

**Regla fundamental:** `1 crédito = 1 USDC` (fijo, no variable)

### Depósito de USDC
```
Ejemplo: Usuario deposita 100 USDC
- Valor USDC: 100 USDC
- Fee (5%): 5 USDC
- Créditos otorgados: 95 créditos
- Equivalente: 95 USDC
```

### Depósito de MTR
```
Ejemplo: Usuario deposita 100,000 MTR
- Precio MTR: 0.001 USDC (ejemplo)
- Valor USDC: 100 USDC
- Fee (5%): 5 USDC
- Créditos otorgados: 95 créditos
- Equivalente: 95 USDC
```

### Retiro de Créditos
```
Ejemplo: Usuario retira 100 créditos
- Créditos a retirar: 100 créditos
- Fee (5%): 5 créditos
- USDC enviado: 95 USDC
- Equivalente: 95 USDC transferidos a wallet del usuario
```

---

## 🔐 SEGURIDAD Y VALIDACIONES

### Validaciones de Depósito

1. ✅ Transacción debe ser exitosa (`status === 'success'`)
2. ✅ Dirección destino debe ser `PLATFORM_WALLET`
3. ✅ No procesar transacciones duplicadas (verificar `tx_hash`)
4. ✅ No procesar transferencias desde la plataforma misma
5. ✅ Verificar que el usuario existe o crearlo

### Validaciones de Retiro

1. ✅ Usuario debe tener suficientes créditos
2. ✅ Mínimo de retiro: 5 créditos
3. ✅ Vault debe tener suficiente liquidez
4. ✅ Wallet address debe ser válida
5. ✅ Transacción blockchain debe confirmarse

### Prevención de Duplicados

- Hash de transacción (`tx_hash`) es único en tabla `deposits`
- Set en memoria (`processedTxHashes`) evita procesar dos veces
- Verificación en base de datos antes de procesar

---

## 📝 RESUMEN DE MODALIDADES

### ✅ Modalidad Actual: **Base de Datos Centralizada**

**Características:**
- Los créditos se almacenan en PostgreSQL (Supabase)
- NO se almacenan en blockchain como tokens
- Identificación de usuarios por `wallet_address`
- Balance consultado desde base de datos, no blockchain
- Depósitos detectados automáticamente desde blockchain
- Retiros ejecutados desde wallet centralizada de la plataforma

**Ventajas:**
- ✅ Transacciones instantáneas (sin esperar confirmaciones)
- ✅ Sin fees de gas para operaciones internas
- ✅ Escalable para muchos usuarios
- ✅ Sistema de créditos estables (1:1 con USDC)

**Consideraciones:**
- ⚠️ Requiere confianza en la plataforma (custodial)
- ⚠️ Los créditos no son tokens transferibles
- ⚠️ Depende de la integridad de la base de datos

---

## 🔍 VERIFICACIÓN DE DIRECCIONES

### Dirección de Plataforma (Depósitos)
```
✅ Verificada: 0x75376BC58830f27415402875D26B73A6BE8E2253
Red: Base Network (8453)
Tokens aceptados: MTR, USDC
```

### Dirección Admin (Retiros)
```
✅ Verificada: 0x75376BC58830f27415402875D26B73A6BE8E2253
(Actualmente la misma que depósitos)
Red: Base Network (8453)
Token enviado: USDC
```

### Tokens
```
✅ MTR: 0x99cd1eb32846c9027ed9cb8710066fa08791c33b
✅ USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

---

**Documento generado:** $(Get-Date -Format "yyyy-MM-dd HH:mm")  
**Versión del sistema:** 3.9
