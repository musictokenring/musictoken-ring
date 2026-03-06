# 🔄 Implementación de Auto-Swap MTR

## 📋 Resumen

Sistema automático que:
1. **Detecta depósitos de USDC** → Automáticamente compra MTR en Uniswap/BaseSwap
2. **Mantiene pool de MTR** → Los MTR comprados van a wallet interna
3. **Gestiona liquidez** → Vende MTR automáticamente cuando se necesita USDC para premios
4. **Genera volumen real** → MTR se mueve constantemente en el mercado

---

## ✅ Cambios Implementados

### 1. **Nuevo Servicio: `mtr-swap-service.js`**

**Ubicación:** `backend/mtr-swap-service.js`

**Funcionalidades:**
- ✅ Auto-compra MTR cuando llega depósito de USDC (90% del depósito)
- ✅ Auto-venta de MTR cuando se necesita USDC para premios
- ✅ Límites de seguridad (máximo 10k USDC/día en swaps)
- ✅ Manejo de slippage (5% tolerancia)
- ✅ Logging completo de todas las operaciones

**Configuración (variables de entorno):**
```bash
SWAP_WALLET_PRIVATE_KEY=0x...          # Clave privada para ejecutar swaps
MTR_POOL_WALLET=0x...                  # Wallet donde se guarda el MTR comprado (default: PLATFORM_WALLET)
SWAP_PERCENTAGE=0.90                   # % del depósito que se usa para comprar MTR (default: 90%)
MIN_SWAP_AMOUNT=10                     # Mínimo USDC para trigger swap (default: 10)
MAX_DAILY_SWAP=10000                   # Máximo USDC/día en swaps (default: 10000)
USDC_BUFFER_PERCENTAGE=0.20            # % de USDC que se mantiene como buffer (default: 20%)
SLIPPAGE_TOLERANCE=0.05                # Tolerancia a slippage (default: 5%)
```

### 2. **Nuevo Servicio: `liquidity-manager.js`**

**Ubicación:** `backend/liquidity-manager.js`

**Funcionalidades:**
- ✅ Monitorea balance de USDC y MTR cada 5 minutos
- ✅ Mantiene buffer mínimo de USDC (1000 USDC por defecto)
- ✅ Vende MTR automáticamente si buffer está bajo
- ✅ Asegura USDC disponible para premios

**Configuración:**
```bash
MIN_USDC_BUFFER=1000                   # Buffer mínimo de USDC (default: 1000)
TARGET_USDC_BUFFER=5000                # Buffer objetivo (default: 5000)
LIQUIDITY_CHECK_INTERVAL=300000       # Intervalo de verificación en ms (default: 5 min)
```

### 3. **Migración SQL: `007_create_swap_logs_table.sql`**

**Ubicación:** `supabase/migrations/007_create_swap_logs_table.sql`

**Tabla creada:** `swap_logs`
- Registra todas las operaciones de compra/venta de MTR
- Incluye: tipo (buy/sell), montos, tx hashes, estado, errores
- Índices para consultas rápidas

### 4. **Integración en `deposit-listener.js`**

**Cambios:**
- ✅ Importa `MTRSwapService`
- ✅ Inicializa servicio de swap en constructor
- ✅ Después de procesar depósito de USDC, ejecuta auto-swap automáticamente
- ✅ No bloquea el procesamiento del depósito si el swap falla

### 5. **Integración en `claim-service.js`**

**Cambios:**
- ✅ Importa `LiquidityManager`
- ✅ Antes de pagar premio, verifica si hay suficiente USDC
- ✅ Si no hay suficiente, intenta vender MTR automáticamente
- ✅ Solo paga si hay suficiente USDC disponible

### 6. **Integración en `server-auto.js`**

**Cambios:**
- ✅ Inicializa `LiquidityManager` al arrancar el servidor
- ✅ Inicia monitoreo periódico de liquidez
- ✅ Manejo de errores para que el servidor continúe si el servicio falla

---

## 🔒 Seguridad Implementada

### Límites de Seguridad

1. **Límite diario de swaps:** Máximo 10,000 USDC por día
2. **Mínimo de swap:** Solo ejecuta swap si depósito >= 10 USDC
3. **Buffer de USDC:** Siempre mantiene 20% del depósito en USDC puro
4. **Slippage protection:** 5% de tolerancia máxima
5. **Verificación de balance:** Verifica balance antes de cada swap
6. **Logging completo:** Todas las operaciones se registran en BD

### Manejo de Errores

- ✅ Si swap falla, el depósito **ya está acreditado** (no se revierte)
- ✅ Si no hay suficiente MTR para vender, el sistema continúa normalmente
- ✅ Si el servicio está deshabilitado (sin clave privada), funciona sin swaps
- ✅ Errores no bloquean el procesamiento de depósitos/premios

---

## 🚀 Cómo Activar

### Paso 1: Ejecutar Migración SQL

```sql
-- Ejecutar en Supabase SQL Editor
-- Archivo: supabase/migrations/007_create_swap_logs_table.sql
```

### Paso 2: Configurar Variables de Entorno

**En Render (o tu servidor):**

```bash
# OBLIGATORIO para activar auto-swap
SWAP_WALLET_PRIVATE_KEY=0x...          # Clave privada de wallet con USDC para swaps

# OPCIONALES (tienen defaults)
MTR_POOL_WALLET=0x...                  # Wallet para guardar MTR (default: PLATFORM_WALLET)
SWAP_PERCENTAGE=0.90                   # % para comprar MTR (default: 90%)
MIN_SWAP_AMOUNT=10                     # Mínimo USDC (default: 10)
MAX_DAILY_SWAP=10000                   # Máximo diario (default: 10000)
MIN_USDC_BUFFER=1000                   # Buffer mínimo (default: 1000)
TARGET_USDC_BUFFER=5000                # Buffer objetivo (default: 5000)
```

### Paso 3: Aprobar Router de Uniswap

**Primera vez:** El sistema necesita aprobar el router de Uniswap para gastar USDC.

Esto se hace automáticamente la primera vez que se ejecuta un swap, pero puedes hacerlo manualmente:

```javascript
// Ejecutar una vez desde tu wallet
// Aprobar Uniswap Router para gastar USDC
// Router: 0x2626664c2603336E57B271c5C0b26F421741e481
// Token: USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
// Amount: Máximo (o un monto grande)
```

### Paso 4: Reiniciar Servidor

```bash
# El servidor detectará las nuevas variables y activará los servicios
```

---

## 📊 Flujo Completo

### 1. Usuario Deposita USDC

```
Usuario → Transfiere 100 USDC → Wallet de plataforma (0x7537...)
    ↓
DepositListener detecta depósito
    ↓
Acredita créditos al usuario (95 créditos = 100 USDC - 5% fee)
    ↓
Trigger auto-swap: Compra MTR con 90 USDC
    ↓
90 USDC → Uniswap → ~90,000 MTR (ejemplo)
    ↓
MTR va a MTR_POOL_WALLET
    ↓
Log registrado en swap_logs
```

### 2. Usuario Gana Premio

```
Usuario gana match → Reclama 50 créditos
    ↓
ClaimService verifica vault balance
    ↓
Si no hay suficiente USDC:
    ↓
LiquidityManager vende MTR automáticamente
    ↓
MTR → Uniswap → USDC
    ↓
Pago de premio en USDC al usuario
```

### 3. Monitoreo Continuo

```
Cada 5 minutos:
    ↓
LiquidityManager verifica balances
    ↓
Si USDC < 1000:
    ↓
Vende MTR para mantener buffer
```

---

## 🧪 Testing

### Verificar que Funciona

1. **Depositar USDC:**
   ```bash
   # Ver logs del servidor
   # Deberías ver:
   [deposit-listener] ✅ Credited X credits...
   [deposit-listener] 🔄 Triggering auto-swap...
   [mtr-swap] ✅ Successfully bought X MTR...
   ```

2. **Verificar swap_logs:**
   ```sql
   SELECT * FROM swap_logs 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

3. **Verificar balance MTR:**
   ```sql
   -- El MTR debería estar en MTR_POOL_WALLET
   -- Verificar en Basescan
   ```

4. **Verificar liquidez:**
   ```bash
   # Logs deberían mostrar:
   [liquidity-manager] Current balances: { usdc: X, mtr: Y }
   [liquidity-manager] ✅ USDC buffer healthy
   ```

---

## ⚠️ Consideraciones Importantes

### 1. **Fees de Gas**

- Cada swap cuesta ~$0.01-0.05 en gas (Base Network es barato)
- Se cobran desde `SWAP_WALLET_PRIVATE_KEY`
- Asegúrate de tener suficiente ETH para gas

### 2. **Slippage**

- El precio de MTR puede cambiar entre detección y ejecución
- Slippage tolerance: 5% (configurable)
- Si el precio cambia mucho, el swap puede fallar

### 3. **Pool de Liquidez**

- Asegúrate de que haya suficiente liquidez en Uniswap/BaseSwap
- Si el pool es pequeño, los swaps pueden tener mucho slippage

### 4. **Wallet de Swap**

- Debe tener:
  - USDC para comprar MTR
  - ETH para pagar gas
  - Aprobación del router de Uniswap

### 5. **MTR Pool Wallet**

- Si es diferente de `PLATFORM_WALLET`, necesita aprobar el router para vender MTR
- O transferir MTR a `SWAP_WALLET` antes de vender

---

## 🔍 Troubleshooting

### Swap no se ejecuta

1. **Verificar variables de entorno:**
   ```bash
   echo $SWAP_WALLET_PRIVATE_KEY  # Debe estar configurado
   ```

2. **Verificar logs:**
   ```bash
   # Buscar en logs:
   [mtr-swap] ⚠️ Service disabled
   [mtr-swap] Cannot swap: ...
   ```

3. **Verificar balance:**
   ```bash
   # El wallet debe tener USDC y ETH
   ```

### Swap falla

1. **Verificar slippage:**
   ```bash
   # Si precio cambió mucho, aumentar SLIPPAGE_TOLERANCE
   ```

2. **Verificar aprobación:**
   ```bash
   # El router debe estar aprobado para gastar USDC
   ```

3. **Verificar límite diario:**
   ```bash
   # Si se alcanzó MAX_DAILY_SWAP, esperar al día siguiente
   ```

### Liquidez baja

1. **Verificar buffer:**
   ```bash
   # Si USDC < MIN_USDC_BUFFER, debería vender MTR automáticamente
   ```

2. **Verificar MTR disponible:**
   ```bash
   # Debe haber MTR en MTR_POOL_WALLET para vender
   ```

---

## 📈 Resultados Esperados

### Volumen de MTR

- Cada depósito de USDC → Compra automática de MTR
- Cada premio grande → Venta de MTR si es necesario
- **Resultado:** MTR se mueve constantemente en el mercado

### Cotización

- Volumen constante → Precio se mueve
- Aparece en DexScreener, CoinMarketCap
- Más visibilidad del token

### Usuario

- Deposita USDC → Recibe créditos
- Apuesta con créditos → Gana créditos
- Reclama → Recibe USDC real
- **Todo transparente y automático**

---

## ✅ Checklist de Implementación

- [x] Servicio de auto-swap creado
- [x] Servicio de gestión de liquidez creado
- [x] Migración SQL creada
- [x] Integración en deposit-listener
- [x] Integración en claim-service
- [x] Integración en server-auto.js
- [ ] **PENDIENTE:** Ejecutar migración SQL en Supabase
- [ ] **PENDIENTE:** Configurar variables de entorno
- [ ] **PENDIENTE:** Probar con depósito real
- [ ] **PENDIENTE:** Verificar swaps en Basescan

---

## 🎯 Próximos Pasos

1. **Ejecutar migración SQL** en Supabase
2. **Configurar variables de entorno** en Render
3. **Probar con depósito pequeño** (10-50 USDC)
4. **Verificar logs** y transacciones en Basescan
5. **Monitorear** durante 24 horas
6. **Ajustar parámetros** si es necesario

---

**¿Listo para activar?** 🚀
