# 🔍 RESULTADO DE LA INVESTIGACIÓN - Pool MTR/USDC

## 📋 RESUMEN DE LO QUE ESTABA HACIENDO

### ✅ Archivos Creados:
1. **`PLAN-INVESTIGACION-POOL-MTR.md`**: Plan completo de investigación
2. **`backend/diagnostico-pool-mtr.js`**: Script para diagnosticar el problema
3. **`RESULTADO-INVESTIGACION-POOL-MTR.md`**: Este documento con los resultados

---

## 🔎 ANÁLISIS DEL CÓDIGO ACTUAL

### Problema Identificado en el Código:

#### 1. **`liquidity-manager.js` (líneas 112-120)**:
```javascript
if (balances.mtr > 0) {
    console.log(`[liquidity-manager] Selling MTR to replenish USDC buffer...`);
    const sellResult = await this.swapService.sellMTRForUSDC(usdcNeeded);
    // ...
}
```

**✅ BUENO**: Ya verifica si `balances.mtr > 0` antes de intentar vender.

#### 2. **`mtr-swap-service.js` (líneas 469-484)**:
```javascript
const mtrBalance = await this.publicClient.readContract({
    address: MTR_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [MTR_POOL_WALLET]
});

const mtrBalanceFormatted = parseFloat(formatUnits(mtrBalance, 18));

if (mtrBalanceFormatted < mtrToSell) {
    return { 
        success: false, 
        reason: `Insufficient MTR balance (${mtrBalanceFormatted.toFixed(2)} MTR, need ${mtrToSell.toFixed(2)})` 
    };
}
```

**✅ BUENO**: Verifica el balance antes de intentar vender.

#### 3. **PERO** - El problema está en la línea 533:
```javascript
fee: 500, // 0.05% fee tier - HARDCODEADO
```

**❌ PROBLEMA**: El código asume que el pool MTR/USDC existe con fee tier **500**, pero esto puede no ser cierto.

---

## 🎯 CAUSA PROBABLE DEL ERROR

### Escenario Más Probable: **Pool NO Existe con Fee Tier 500**

El error `exactInputSingle reverted` ocurre porque:

1. **El código intenta hacer swap con fee tier 500 (0.05%)**
2. **Ese pool específico NO EXISTE en Uniswap V3 Base**
3. **El contrato de Uniswap revierte la transacción**

### ¿Por qué el pool podría no existir?

- **Pool nunca creado**: Nadie ha creado un pool MTR/USDC con fee tier 500 en Uniswap V3 Base
- **Pool con otro fee tier**: El pool existe pero con fee tier 3000 (0.3%) o 10000 (1%)
- **Pool en otro DEX**: El pool está en BaseSwap, no en Uniswap V3

---

## ✅ VERIFICACIÓN DE TU HIPÓTESIS

### Tu Pregunta: "¿Es porque aún no hay usuarios apostando en USDC?"

### Respuesta: **PARCIALMENTE CORRECTO** ⚠️

**Explicación**:

1. **Si NO hay MTR comprado** (porque no hay depósitos):
   - ✅ El código YA tiene validación para esto
   - ✅ No debería intentar vender si `balances.mtr === 0`
   - ✅ El error NO debería ocurrir por esta razón

2. **PERO el error SÍ puede ocurrir si**:
   - ❌ El pool NO existe con fee tier 500
   - ❌ El `liquidity-manager` detecta que hay MTR (aunque sea poco)
   - ❌ Intenta vender pero el pool no existe → **REVERT**

3. **Conclusión**:
   - Si el balance de MTR es 0 → El código NO intenta vender (correcto)
   - Si el balance de MTR > 0 pero el pool no existe → El código intenta vender y falla (error)

---

## 🛠️ CORRECCIONES NECESARIAS

### Corrección 1: Detectar Automáticamente el Fee Tier Correcto

**Qué hacer**:
- Antes de hacer swap, buscar qué fee tier tiene el pool MTR/USDC
- Probar con fee tiers: 500, 3000, 10000
- Usar el que exista y tenga liquidez

**Código a agregar**:
```javascript
async findPoolFeeTier(tokenA, tokenB) {
    const feeTiers = [500, 3000, 10000];
    for (const fee of feeTiers) {
        const poolAddress = await this.publicClient.readContract({
            address: UNISWAP_V3_FACTORY,
            abi: FACTORY_ABI,
            functionName: 'getPool',
            args: [tokenA, tokenB, fee]
        });
        
        if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
            // Verificar liquidez
            const liquidity = await this.publicClient.readContract({
                address: poolAddress,
                abi: POOL_ABI,
                functionName: 'liquidity'
            });
            
            if (liquidity > 0n) {
                return fee; // Pool existe y tiene liquidez
            }
        }
    }
    return null; // No se encontró pool con liquidez
}
```

### Corrección 2: Mejorar Validación de Balance MTR

**Qué hacer**:
- Agregar validación más temprana en `sellMTRForUSDC`
- Si balance MTR es 0 o muy bajo, retornar error claro sin intentar swap

**Código a modificar**:
```javascript
async sellMTRForUSDC(requiredUSDC) {
    // Verificar balance MTR PRIMERO
    const mtrBalance = await this.publicClient.readContract({
        address: MTR_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [MTR_POOL_WALLET]
    });
    
    const mtrBalanceFormatted = parseFloat(formatUnits(mtrBalance, 18));
    
    if (mtrBalanceFormatted === 0) {
        return { 
            success: false, 
            reason: 'No MTR available to sell. Waiting for USDC deposits to buy MTR first.' 
        };
    }
    
    // ... resto del código
}
```

### Corrección 3: Fallback a BaseSwap

**Qué hacer**:
- Si Uniswap V3 no tiene pool, intentar con BaseSwap
- BaseSwap puede tener mejor liquidez para MTR/USDC

---

## 📊 ESTADO ACTUAL DEL SISTEMA

### ✅ Lo que SÍ Funciona:
1. ✅ Detección de depósitos USDC/MTR
2. ✅ Compra automática de MTR cuando llega USDC (si el pool existe)
3. ✅ Acreditación de créditos a usuarios
4. ✅ Sistema de apuestas con créditos
5. ✅ Validación de balance MTR antes de vender

### ❌ Lo que NO Funciona:
1. ❌ Venta de MTR si el pool no existe con fee tier 500
2. ❌ Detección automática del fee tier correcto
3. ❌ Fallback a otros DEX si Uniswap no tiene liquidez

---

## 🎯 PRÓXIMOS PASOS RECOMENDADOS

### Opción A: Corrección Completa (Recomendada)
1. ✅ Agregar función para detectar fee tier automáticamente
2. ✅ Mejorar validación de balance MTR
3. ✅ Agregar fallback a BaseSwap
4. ✅ Mejorar logs de errores

### Opción B: Corrección Mínima (Rápida)
1. ✅ Cambiar fee tier hardcodeado a 3000 o 10000 (si sabemos cuál existe)
2. ✅ Agregar validación temprana de balance MTR = 0

### Opción C: Verificación Manual Primero
1. ✅ Ejecutar script de diagnóstico para confirmar qué pool existe
2. ✅ Luego hacer corrección específica según resultados

---

## ⚠️ IMPORTANTE

**El sistema NO está crasheado**. El error solo ocurre cuando:
- Se intenta vender MTR (check periódico o retiro)
- Y el pool no existe con el fee tier configurado

**El resto del sistema funciona normalmente**:
- Depósitos se detectan ✅
- Créditos se acreditan ✅
- Apuestas funcionan ✅
- Retiros funcionan si hay USDC suficiente ✅

---

## 📝 DECISIÓN REQUERIDA

**¿Qué quieres que haga?**

1. **Opción 1**: Implementar corrección completa (detectar fee tier automáticamente + fallback)
2. **Opción 2**: Corrección mínima (cambiar fee tier a 3000 o 10000)
3. **Opción 3**: Primero ejecutar diagnóstico para confirmar qué pool existe

**Mi recomendación**: Opción 1 (corrección completa) para que el sistema sea más robusto.
