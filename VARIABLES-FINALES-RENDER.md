# 📋 VARIABLES DE ENTORNO FINALES PARA RENDER

## ✅ VARIABLES OBLIGATORIAS (Ya Configuradas)

Estas variables **YA DEBEN ESTAR** configuradas en Render. Solo verifica que existan:

```
SWAP_WALLET_PRIVATE_KEY=<tu_clave_privada_de_PLATFORM_WALLET>
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/tu-api-key
MIN_USDC_BUFFER=1000
```

---

## 🆕 VARIABLES NUEVAS OBLIGATORIAS (Agregar Ahora)

### 1. Protección de Tesorería - Valor Mínimo

```
MIN_MTR_RESERVE_USDC_VALUE=1000000
```

**Descripción**: Valor mínimo en USDC que debe mantenerse protegido en tesorería  
**Valor**: `1000000` ($1 millón USDC)  
**Recomendación**: Mantener este valor para máxima protección

---

## ⚙️ VARIABLES OPCIONALES (Tienen Defaults Seguros)

Estas variables son **opcionales**. Si no las configuras, el sistema usará valores por defecto seguros.

### 2. Protección de Tesorería - Frecuencia de Actualización

```
TREASURY_PROTECTION_UPDATE_INTERVAL=1800000
```

**Descripción**: Intervalo en milisegundos para revaluar el límite de protección  
**Valor por defecto**: `1800000` (30 minutos)  
**Opciones**:
- `900000` = 15 minutos (más frecuente)
- `1800000` = 30 minutos (recomendado)
- `3600000` = 1 hora

**Recomendación**: Dejar por defecto (30 minutos) o no configurar

---

### 3. Porcentaje de Swap

```
SWAP_PERCENTAGE=0.90
```

**Descripción**: Porcentaje del depósito USDC que se usa para comprar MTR  
**Valor por defecto**: `0.90` (90%)  
**Recomendación**: Dejar por defecto o no configurar

---

### 4. Monto Mínimo de Swap

```
MIN_SWAP_AMOUNT=10
```

**Descripción**: Monto mínimo en USDC para activar swap automático  
**Valor por defecto**: `10` (10 USDC)  
**Recomendación**: Dejar por defecto o no configurar

---

### 5. Límite Diario de Swap

```
MAX_DAILY_SWAP=10000
```

**Descripción**: Máximo de USDC que se puede usar para comprar MTR por día  
**Valor por defecto**: `10000` (10,000 USDC)  
**Recomendación**: Dejar por defecto o no configurar

---

### 6. Wallet de Pool MTR (Opcional - No Configurar)

```
MTR_POOL_WALLET=<dirección_wallet_separada>
```

**Descripción**: Wallet separada para pool de MTR (opcional)  
**Valor por defecto**: Usa `PLATFORM_WALLET`  
**Recomendación**: **NO CONFIGURAR** (dejar que use PLATFORM_WALLET por defecto)

---

## 📝 LISTA COMPLETA PARA COPIAR Y PEGAR

### Variables Obligatorias (Verificar que Existan):

```env
SWAP_WALLET_PRIVATE_KEY=<tu_clave_privada>
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/tu-api-key
MIN_USDC_BUFFER=1000
```

### Variables Nuevas (Agregar):

```env
MIN_MTR_RESERVE_USDC_VALUE=1000000
```

### Variables Opcionales (Solo si Quieres Cambiar Defaults):

```env
TREASURY_PROTECTION_UPDATE_INTERVAL=1800000
SWAP_PERCENTAGE=0.90
MIN_SWAP_AMOUNT=10
MAX_DAILY_SWAP=10000
```

---

## 🎯 CONFIGURACIÓN MÍNIMA RECOMENDADA

**Solo necesitas agregar UNA variable nueva**:

```env
MIN_MTR_RESERVE_USDC_VALUE=1000000
```

**Las demás variables opcionales tienen defaults seguros** y no necesitas configurarlas a menos que quieras cambiar el comportamiento.

---

## 📊 RESUMEN DE VALORES POR DEFECTO

Si NO configuras las variables opcionales, el sistema usará:

| Variable | Valor por Defecto | Descripción |
|----------|-------------------|-------------|
| `MIN_MTR_RESERVE_USDC_VALUE` | `1000000` | $1 millón protegido |
| `TREASURY_PROTECTION_UPDATE_INTERVAL` | `1800000` | Actualización cada 30 min |
| `SWAP_PERCENTAGE` | `0.90` | 90% para comprar MTR |
| `MIN_SWAP_AMOUNT` | `10` | Mínimo 10 USDC |
| `MAX_DAILY_SWAP` | `10000` | Máximo 10k USDC/día |
| `MTR_POOL_WALLET` | `PLATFORM_WALLET` | Usa wallet de tesorería |

---

## ✅ CHECKLIST PARA RENDER

### Paso 1: Verificar Variables Existentes
- [ ] `SWAP_WALLET_PRIVATE_KEY` existe
- [ ] `BASE_RPC_URL` existe (con Alchemy)
- [ ] `MIN_USDC_BUFFER` existe

### Paso 2: Agregar Variable Nueva
- [ ] Agregar `MIN_MTR_RESERVE_USDC_VALUE=1000000`

### Paso 3: (Opcional) Agregar Variables Opcionales
- [ ] `TREASURY_PROTECTION_UPDATE_INTERVAL=1800000` (si quieres cambiar frecuencia)
- [ ] Otras variables opcionales solo si necesitas cambiar defaults

### Paso 4: Deploy y Verificar
- [ ] Hacer deploy
- [ ] Verificar logs al iniciar
- [ ] Confirmar que muestra protección de $1 millón
- [ ] Confirmar que muestra actualización cada 30 minutos

---

## 🚀 CONFIGURACIÓN RÁPIDA (Mínima)

**Solo agrega esta variable en Render**:

```
MIN_MTR_RESERVE_USDC_VALUE=1000000
```

**Todo lo demás funcionará con defaults seguros** ✅

---

## 📞 VALORES RECOMENDADOS POR ESCENARIO

### Escenario Conservador (Máxima Protección):
```env
MIN_MTR_RESERVE_USDC_VALUE=2000000
TREASURY_PROTECTION_UPDATE_INTERVAL=900000
```

### Escenario Moderado (Recomendado):
```env
MIN_MTR_RESERVE_USDC_VALUE=1000000
TREASURY_PROTECTION_UPDATE_INTERVAL=1800000
```

### Escenario Permisivo (Menos Protección):
```env
MIN_MTR_RESERVE_USDC_VALUE=500000
TREASURY_PROTECTION_UPDATE_INTERVAL=3600000
```

---

## ⚠️ IMPORTANTE

1. **NO borres** las variables existentes (`SWAP_WALLET_PRIVATE_KEY`, `BASE_RPC_URL`, etc.)
2. **Solo agrega** `MIN_MTR_RESERVE_USDC_VALUE=1000000`
3. **Las demás son opcionales** - solo configúralas si quieres cambiar defaults

---

## ✅ LISTA FINAL SIMPLIFICADA

**Para copiar y pegar en Render** (solo la nueva):

```
MIN_MTR_RESERVE_USDC_VALUE=1000000
```

**Eso es todo** - el resto funciona con defaults ✅
