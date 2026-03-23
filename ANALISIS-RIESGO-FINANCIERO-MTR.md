# ⚠️ ANÁLISIS CRÍTICO: Riesgo Financiero MTR → Créditos

## 🔴 PROBLEMA IDENTIFICADO

### Escenario de Ataque/Explotación:

1. **En Aerodrome (DEX público):**
   - 1 USDC = ~760,000 MTR (según imágenes proporcionadas)
   - Usuario compra 760,000 MTR por 1 USDC

2. **En Music Token Ring:**
   - Usuario deposita 760,000 MTR a la plataforma
   - Sistema intenta convertir MTR → USDC
   - **RIESGO:** Si el sistema usa precio de mercado incorrecto o falla el swap, podría acreditar créditos basados en un valor incorrecto

3. **Resultado Potencial:**
   - Usuario recibe créditos basados en valor incorrecto
   - Usuario retira créditos como USDC 1:1
   - **PÉRDIDA MASIVA para la plataforma**

---

## 🔍 ANÁLISIS DEL CÓDIGO ACTUAL

### Flujo Actual (`deposit-listener.js` líneas 296-336):

```javascript
if (tokenName === 'MTR') {
    // Intenta hacer swap MTR → USDC usando Aerodrome
    if (this.swapService && this.swapService.enabled) {
        const swapResult = await this.swapService.swapMTRToUSDC(amount, txHash);
        
        if (swapResult.success && swapResult.usdcReceived > 0) {
            usdcValue = swapResult.usdcReceived; // ✅ CORRECTO: Usa USDC real recibido
        } else {
            // ⚠️ FALLBACK PELIGROSO: Usa precio de mercado
            const mtrPrice = await this.getMTRPrice();
            usdcValue = amount * mtrPrice; // ❌ RIESGO: Precio puede estar desactualizado
        }
    } else {
        // ⚠️ FALLBACK PELIGROSO: Usa precio si no hay swap service
        const mtrPrice = await this.getMTRPrice();
        usdcValue = amount * mtrPrice; // ❌ RIESGO: Precio puede estar desactualizado
    }
}
```

### Problemas Identificados:

1. **❌ Función `swapMTRToUSDC` NO EXISTE**
   - El código intenta llamarla pero no está implementada
   - Esto significa que SIEMPRE cae en el fallback de precio

2. **❌ Fallback de Precio es Peligroso**
   - `getMTRPrice()` obtiene precio de base de datos (`platform_settings`)
   - Si el precio está desactualizado o incorrecto, podría acreditar créditos incorrectos
   - Ejemplo: Si precio en DB es 0.001 USDC/MTR pero precio real es 0.0000013 USDC/MTR (1/760,000), el usuario recibiría ~760x más créditos de lo debido

3. **❌ No Hay Validación de Precio Mínimo**
   - No hay límite mínimo de precio MTR
   - Si MTR cae a precio muy bajo, usuarios podrían explotar

4. **❌ No Hay Límite de Depósito MTR**
   - No hay límite máximo de MTR que se puede depositar
   - Usuario podría depositar millones de MTR baratos

---

## 🛡️ SOLUCIONES RECOMENDADAS

### 1. **Implementar Swap Real MTR → USDC (CRÍTICO)**

```javascript
// En mtr-swap-service.js
async swapMTRToUSDC(mtrAmount, depositTxHash) {
    // 1. Verificar que tenemos suficiente liquidez en pool
    // 2. Ejecutar swap REAL en Aerodrome usando Uniswap V3 Router
    // 3. Obtener USDC REAL recibido del swap
    // 4. Retornar USDC recibido (no precio estimado)
    
    // CRÍTICO: Usar precio REAL del swap, no precio de base de datos
    const actualUSDCReceived = await this.executeSwapOnAerodrome(mtrAmount);
    return {
        success: true,
        usdcReceived: actualUSDCReceived, // USDC REAL recibido
        swapTxHash: swapTxHash
    };
}
```

### 2. **Validar Precio Mínimo de MTR**

```javascript
// Precio mínimo aceptable: 0.000001 USDC/MTR (1 MTR = 0.000001 USDC)
const MIN_MTR_PRICE = 0.000001; // Precio mínimo para aceptar depósitos

if (mtrPrice < MIN_MTR_PRICE) {
    throw new Error('MTR price too low. Deposits temporarily disabled.');
}
```

### 3. **Límite Máximo de Depósito MTR**

```javascript
// Límite máximo: 10,000,000 MTR por depósito
const MAX_MTR_DEPOSIT = 10000000;

if (amount > MAX_MTR_DEPOSIT) {
    throw new Error(`MTR deposit exceeds maximum limit of ${MAX_MTR_DEPOSIT} MTR`);
}
```

### 4. **Validar Precio en Tiempo Real**

```javascript
// Obtener precio REAL del pool de Aerodrome antes de procesar
async function getRealTimeMTRPrice() {
    // Consultar pool directamente en Aerodrome/Uniswap V3
    // No confiar en precio de base de datos para depósitos grandes
    const poolPrice = await queryAerodromePool();
    return poolPrice;
}
```

### 5. **Rechazar Depósitos si Swap Falla**

```javascript
// Si swap falla, RECHAZAR el depósito en lugar de usar precio fallback
if (!swapResult.success) {
    // Registrar depósito como "rejected_swap_failed"
    await supabase.from('deposits').insert({
        status: 'rejected_swap_failed',
        reason: 'MTR swap to USDC failed. Please try again or deposit USDC directly.'
    });
    throw new Error('MTR swap failed. Deposit rejected for security.');
}
```

### 6. **Monitoreo de Precio en Tiempo Real**

```javascript
// Actualizar precio MTR cada 5 minutos desde pool real
setInterval(async () => {
    const realPrice = await getRealTimeMTRPrice();
    await supabase.from('platform_settings').upsert({
        key: 'mtr_usdc_price',
        mtr_usdc_price: realPrice,
        updated_at: new Date().toISOString()
    });
}, 5 * 60 * 1000); // 5 minutos
```

---

## 🚨 RECOMENDACIÓN INMEDIATA

### **OPCIÓN A: Deshabilitar Depósitos MTR Temporalmente**

```javascript
// En deposit-listener.js
if (tokenName === 'MTR') {
    console.error('[deposit-listener] ⚠️ MTR deposits temporarily disabled for security review');
    throw new Error('MTR deposits are temporarily disabled. Please deposit USDC directly.');
}
```

### **OPCIÓN B: Implementar Swap Real + Validaciones**

1. Implementar `swapMTRToUSDC` con swap real en Aerodrome
2. Agregar validación de precio mínimo
3. Agregar límite máximo de depósito
4. Rechazar depósitos si swap falla (no usar fallback de precio)
5. Actualizar precio en tiempo real desde pool

---

## 📊 IMPACTO POTENCIAL

### Escenario Pesimista (Sin Protecciones):

- Usuario compra 760,000 MTR por 1 USDC en Aerodrome
- Deposita 760,000 MTR a la plataforma
- Sistema usa precio incorrecto (0.001 USDC/MTR en lugar de 0.0000013)
- Usuario recibe: 760,000 * 0.001 = 760 créditos
- Usuario retira: 760 USDC
- **PÉRDIDA: 759 USDC por depósito**

### Escenario Realista (Con Swap Real):

- Usuario compra 760,000 MTR por 1 USDC en Aerodrome
- Deposita 760,000 MTR a la plataforma
- Sistema ejecuta swap real: 760,000 MTR → ~0.99 USDC (después de fees)
- Usuario recibe: 0.99 * 0.95 = 0.94 créditos (después de fee 5%)
- Usuario retira: 0.94 USDC
- **RESULTADO: Correcto, sin pérdida**

---

## ✅ CONCLUSIÓN

**El sistema ACTUALMENTE tiene vulnerabilidades que podrían permitir explotación financiera.**

**Acciones Requeridas:**
1. ✅ Implementar swap REAL MTR → USDC (no usar precio fallback)
2. ✅ Agregar validaciones de precio mínimo y límites
3. ✅ Rechazar depósitos si swap falla (no usar fallback)
4. ✅ Actualizar precio en tiempo real desde pool
5. ⚠️ Considerar deshabilitar depósitos MTR hasta que esté implementado

**Prioridad: CRÍTICA** 🔴
