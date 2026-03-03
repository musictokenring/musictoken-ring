# Plan de Migración: Sistema de Créditos Estables

## Objetivo
Eliminar volatilidad del MTR en retiros y garantizar que los usuarios siempre cobren en USDC lo que ganaron, sin riesgo de precio del token.

## Principios Fundamentales
- **MTR solo como entrada**: Se compra en Aerodrome y se deposita → convierte a créditos estables
- **1 crédito = 1 USDC fijo**: Siempre, sin conversión variable
- **Apuestas en créditos**: Todo dentro de la plataforma usa créditos estables
- **Retiros directos**: Créditos → USDC 1:1 desde vault de liquidez
- **Fees fijos**: 5% depósito, 2% apuesta, 5% retiro (todo en USDC)

## Cambios Requeridos

### 1. Sistema de Depósitos (`backend/deposit-listener.js`)

**Cambios:**
- ✅ MTR recibido: calcular valor en USDC al momento del depósito usando oracle/precio actual
- ✅ USDC recibido: usar directamente (1 USDC = 1 crédito)
- ✅ Fee de depósito: 5% del valor en USDC → enviar a vault
- ✅ Créditos otorgados: (valor USDC - fee) créditos (1:1 con USDC)
- ✅ MTR recibido: enviar a pool de liquidez o quemar (no guardar)

**Ejemplo:**
- Usuario deposita 1000 MTR cuando precio MTR = 0.001 USDC
- Valor en USDC: 1000 × 0.001 = 1 USDC
- Fee (5%): 0.05 USDC → vault
- Créditos otorgados: 0.95 créditos (1 crédito = 1 USDC)

### 2. Sistema de Créditos (`src/credits-system.js`)

**Cambios:**
- ✅ Eliminar cálculo dinámico de USDC equivalente
- ✅ Mostrar siempre: "X créditos = $X USDC" (1:1 fijo)
- ✅ Actualizar UI para mostrar estabilidad

### 3. Sistema de Apuestas (`game-engine.js`)

**Cambios:**
- ✅ Mantener apuestas en créditos
- ✅ Fee de apuesta: 2% del pozo total → vault antes de repartir
- ✅ Ganador recibe: (pozo total - 2% fee) créditos

**Ejemplo:**
- Apuesta total: 200 créditos (100 cada jugador)
- Fee (2%): 4 créditos → vault
- Ganador recibe: 196 créditos

### 4. Sistema de Retiros (`backend/claim-service.js`)

**Cambios:**
- ✅ Eliminar conversión MTR → USDC
- ✅ Retiro directo: 1 crédito = 1 USDC
- ✅ Fee de retiro: 5% → vault
- ✅ Usuario recibe: (créditos - 5%) USDC desde vault

**Ejemplo:**
- Usuario quiere retirar 100 créditos
- Fee (5%): 5 créditos → vault
- Usuario recibe: 95 USDC directo

### 5. Vault de Liquidez

**Implementación:**
- Opción A: Wallet separado controlado por admin (más simple)
- Opción B: Contrato inteligente con funciones de depósito/retiro (más seguro)

**Funciones:**
- Acumular fees (5% depósito, 2% apuesta, 5% retiro)
- Pagar retiros automáticamente
- Verificar balance antes de pagar
- Mostrar balance público en dashboard

### 6. Base de Datos

**Nuevas tablas/campos:**
- `vault_balance`: Tracking del balance del vault en USDC
- `deposit_fees`: Registro de fees de depósito
- `bet_fees`: Registro de fees de apuestas
- `withdrawal_fees`: Registro de fees de retiros
- `deposits`: Agregar campo `usdc_value_at_deposit` y `deposit_fee`

### 7. UI/UX

**Cambios:**
- Mostrar "Créditos estables: 1 crédito = 1 USDC fijo"
- Mostrar balance del vault públicamente
- Mensajes de transparencia sobre estabilidad
- Eliminar referencias a "precio variable" o "conversión MTR"

## Orden de Implementación

1. ✅ Actualizar lógica de depósitos (créditos estables + fee 5%)
2. ✅ Actualizar sistema de créditos (1:1 fijo)
3. ✅ Implementar fees en apuestas (2%)
4. ✅ Actualizar retiros (1:1 directo + fee 5%)
5. ✅ Crear/actualizar vault
6. ✅ Actualizar UI
7. ✅ Actualizar base de datos

## Testing

- Testear depósito MTR → créditos estables
- Testear depósito USDC → créditos estables
- Testear apuesta con fee 2%
- Testear retiro con fee 5%
- Verificar que vault acumula fees correctamente
- Verificar que ganador siempre recibe al menos lo apostado (menos fees)
