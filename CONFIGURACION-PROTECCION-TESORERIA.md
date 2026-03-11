# 🛡️ Configuración de Protección de Tesorería

## 📋 SISTEMA DE PROTECCIÓN DINÁMICA

El sistema ahora incluye un **límite de protección dinámico** que protege las reservas importantes de MTR en tesorería, revaluándose periódicamente según la cotización actual.

---

## 🎯 CÓMO FUNCIONA

### Protección Dinámica Basada en Precio:

1. **Valor Mínimo en USDC**: El sistema mantiene un valor mínimo de reserva en USDC
2. **Cálculo Dinámico**: Basado en el precio actual de MTR, calcula cuántos MTR equivalen a ese valor
3. **Actualización Periódica**: Se revalúa automáticamente cada hora (configurable)
4. **Protección Automática**: Antes de vender MTR, verifica que no se violará el límite

### Ejemplo:

- **Valor mínimo de reserva**: $500,000 USDC
- **Precio MTR actual**: $0.001
- **Límite de protección**: 500,000 / 0.001 = **500,000,000 MTR**

Si el precio sube a $0.002:
- **Nuevo límite**: 500,000 / 0.002 = **250,000,000 MTR** (menos MTR protegidos porque valen más)

Si el precio baja a $0.0005:
- **Nuevo límite**: 500,000 / 0.0005 = **1,000,000,000 MTR** (más MTR protegidos porque valen menos)

---

## ⚙️ CONFIGURACIÓN

### Variable de Entorno:

```
MIN_MTR_RESERVE_USDC_VALUE=500000
```

**Descripción**: Valor mínimo de reserva en USDC que debe mantenerse protegido.

**Valores Recomendados**:
- **Conservador**: `1000000` ($1 millón USDC)
- **Moderado**: `500000` ($500k USDC) - **Por defecto**
- **Permisivo**: `250000` ($250k USDC)

### Variable de Actualización (Opcional):

```
TREASURY_PROTECTION_UPDATE_INTERVAL=3600000
```

**Descripción**: Intervalo en milisegundos para revaluar el límite de protección.

**Valores**:
- **Cada hora**: `3600000` (1 hora) - **Por defecto**
- **Cada 30 minutos**: `1800000`
- **Cada 2 horas**: `7200000`
- **Cada 6 horas**: `21600000`

---

## 🔍 COMPORTAMIENTO DEL SISTEMA

### Escenario 1: Venta Normal (Sin Violar Límite)

```
Balance actual: 600,000,000 MTR
Límite de protección: 500,000,000 MTR
MTR a vender: 50,000,000 MTR

✅ Permitido: 600M - 50M = 550M > 500M (límite)
```

### Escenario 2: Venta que Violaría Límite

```
Balance actual: 520,000,000 MTR
Límite de protección: 500,000,000 MTR
MTR a vender: 50,000,000 MTR

❌ Bloqueado: 520M - 50M = 470M < 500M (límite)
⚠️ Disponible para vender: 20,000,000 MTR (520M - 500M)
```

### Escenario 3: Venta Parcial Permitida

Si el sistema necesita vender más de lo permitido pero hay algo disponible:
- Intenta vender solo lo disponible (si es al menos 50% de lo necesario)
- Si no alcanza el 50%, rechaza la venta completamente

---

## 📊 LOGS DEL SISTEMA

### Al Inicializar:

```
[mtr-swap] 🛡️ Treasury protection updated:
[mtr-swap]    MTR Price: $0.001234
[mtr-swap]    Min Reserve Value: $500,000 USDC
[mtr-swap]    Min MTR Reserve: 405,000,000 MTR
[mtr-swap] 🔄 Treasury protection updates scheduled every 60 minutes
```

### Al Intentar Vender (Protección Activada):

```
[mtr-swap] 🛡️ Treasury protection triggered: Treasury protection: Cannot sell 50,000,000 MTR. 
Current balance: 520,000,000 MTR. Minimum reserve: 500,000,000 MTR. 
Available to sell: 20,000,000 MTR
[mtr-swap] ⚠️ Attempting partial sale: 20,000,000 MTR
```

---

## 🎯 EFECTIVIDAD

### Protección de Reservas:

✅ **Garantiza** que siempre quede un valor mínimo en USDC protegido
✅ **Se adapta** automáticamente a cambios de precio
✅ **Se actualiza** periódicamente sin intervención manual
✅ **Previene** ventas que agoten las reservas importantes

### Casos de Uso:

1. **Precio Sube**: Menos MTR protegidos (pero mismo valor en USDC)
2. **Precio Baja**: Más MTR protegidos (mantiene valor en USDC)
3. **Volatilidad**: Se ajusta automáticamente cada hora

---

## ⚠️ IMPORTANTE

### Si Usas Wallet Separada:

Si `MTR_POOL_WALLET` es diferente de `PLATFORM_WALLET`:
- La protección solo aplica a `MTR_POOL_WALLET`
- Los 99 millones en `PLATFORM_WALLET` están completamente protegidos (no se consultan)

### Si Usas PLATFORM_WALLET (Tu Caso):

- La protección aplica a toda la wallet (incluyendo los 99 millones)
- El sistema protegerá el valor mínimo configurado
- Los 99 millones estarán protegidos según el límite dinámico

---

## 📝 EJEMPLO DE CONFIGURACIÓN

### Para Proteger $1 Millón en Reservas:

```env
MIN_MTR_RESERVE_USDC_VALUE=1000000
TREASURY_PROTECTION_UPDATE_INTERVAL=3600000
```

### Para Proteger $500k con Actualización Cada 30 Minutos:

```env
MIN_MTR_RESERVE_USDC_VALUE=500000
TREASURY_PROTECTION_UPDATE_INTERVAL=1800000
```

---

## ✅ CHECKLIST

- [ ] Decidir valor mínimo de reserva en USDC
- [ ] Configurar `MIN_MTR_RESERVE_USDC_VALUE` en Render
- [ ] (Opcional) Configurar `TREASURY_PROTECTION_UPDATE_INTERVAL`
- [ ] Verificar logs al iniciar servidor
- [ ] Confirmar que el límite se actualiza periódicamente

---

## 🔄 ACTUALIZACIÓN AUTOMÁTICA

El sistema actualiza el límite automáticamente:
- ✅ Al iniciar el servidor
- ✅ Cada hora (o intervalo configurado)
- ✅ Basado en el precio actual de MTR

**No necesitas intervención manual** - Todo es automático ✅

---

¿Necesitas ayuda con la configuración?
