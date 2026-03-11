# Plan de Investigación y Corrección - Pool MTR/USDC

## 📋 ANÁLISIS ACTUAL DEL PROBLEMA

### Situación Actual:
1. **Error detectado**: `ContractFunctionExecutionError: The contract function 'exactInputSingle' reverted`
2. **Cuándo ocurre**: Cuando el sistema intenta **vender MTR** para obtener USDC
3. **Configuración actual**:
   - Router: Uniswap V3 Base (`0x2626664c2603336E57B271c5C0b26F421741e481`)
   - Fee tier: **500** (0.05%) - hardcodeado en el código
   - MTR Token: `0x99cd1eb32846c9027ed9cb8710066fa08791c33b`
   - USDC Token: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

### Cuándo se Intenta Vender MTR:
1. **Check periódico** (`liquidity-manager.js`): Cada 5 minutos verifica si el buffer USDC está bajo (< 1000 USDC)
2. **Retiro de usuario** (`claim-service.js`): Cuando un usuario intenta retirar y no hay suficiente USDC en el vault

---

## 🔍 INVESTIGACIÓN QUE VOY A REALIZAR

### Paso 1: Verificar si el Pool MTR/USDC Existe en Uniswap V3 Base
- **Qué haré**: Consultar directamente la blockchain para verificar si existe un pool MTR/USDC en Uniswap V3
- **Cómo**: Usar el contrato Factory de Uniswap V3 para buscar pools existentes
- **Qué busco**: 
  - ¿Existe el pool?
  - ¿Con qué fee tier existe? (500, 3000, 10000)
  - ¿Tiene liquidez suficiente?

### Paso 2: Verificar si Hay MTR en el Pool Wallet
- **Qué haré**: Consultar el balance de MTR en `MTR_POOL_WALLET` (0x75376BC58830f27415402875D26B73A6BE8E2253)
- **Por qué**: Si no hay MTR comprado aún (porque no hay depósitos), el error puede ser simplemente que no hay tokens para vender
- **Qué busco**: Balance actual de MTR en el pool wallet

### Paso 3: Verificar Liquidez en el Pool (si existe)
- **Qué haré**: Si el pool existe, verificar cuánta liquidez tiene
- **Por qué**: Un pool sin liquidez suficiente causaría el revert
- **Qué busco**: Cantidad de USDC y MTR en el pool

### Paso 4: Verificar Logs del Sistema
- **Qué haré**: Revisar los logs para entender el contexto exacto del error
- **Qué busco**: 
  - ¿Se está intentando vender cuando no hay MTR?
  - ¿El error ocurre en el check periódico o en un retiro real?
  - ¿Cuánto MTR se intenta vender?

---

## 🛠️ CORRECCIONES QUE PODRÍA NECESITAR HACER

### Escenario A: El Pool NO Existe o Tiene Otro Fee Tier
**Solución**:
1. Detectar automáticamente el fee tier correcto del pool
2. O usar múltiples fee tiers (500, 3000, 10000) y probar hasta encontrar el correcto
3. O cambiar a BaseSwap si tiene mejor liquidez

### Escenario B: No Hay MTR para Vender (Aún No Hay Depósitos)
**Solución**:
1. Agregar validación: **NO intentar vender si el balance de MTR es 0**
2. Mejorar los logs para indicar claramente: "No hay MTR para vender, esperando depósitos"
3. Esto es **NORMAL** si aún no hay usuarios depositando USDC

### Escenario C: Pool Existe pero Sin Liquidez Suficiente
**Solución**:
1. Agregar verificación de liquidez antes de intentar el swap
2. Mostrar error claro: "Pool sin liquidez suficiente"
3. Sugerir usar BaseSwap como alternativa

### Escenario D: Problema con el Router o Path
**Solución**:
1. Verificar que el router de Uniswap V3 Base sea correcto
2. Implementar fallback a BaseSwap
3. Mejorar el manejo de errores para mostrar mensajes más claros

---

## 📊 VERIFICACIÓN DE LA HIPÓTESIS DEL USUARIO

### Tu Pregunta: "¿Es porque aún no hay usuarios apostando en USDC creando liquidez?"

**Respuesta**: **MUY PROBABLE** ✅

**Razones**:
1. El sistema solo compra MTR cuando llega un depósito de USDC
2. Si no hay depósitos → No hay MTR comprado → No hay nada que vender
3. El `liquidity-manager` intenta vender MTR cada 5 minutos si el buffer USDC está bajo
4. Si el buffer está bajo PERO no hay MTR → El swap falla porque no hay tokens

**Cómo lo verifico**:
- Consultar el balance de MTR en el pool wallet
- Si es 0 → Confirmado: No hay MTR porque no hay depósitos aún
- Si hay MTR → El problema es otro (pool no existe, fee tier incorrecto, etc.)

---

## 🎯 PLAN DE ACCIÓN

### Fase 1: Investigación (SIN CAMBIOS AL CÓDIGO)
1. ✅ Crear script de diagnóstico que:
   - Consulta balance de MTR en pool wallet
   - Busca pools MTR/USDC en Uniswap V3 Base
   - Verifica fee tiers disponibles
   - Verifica liquidez si el pool existe

### Fase 2: Análisis de Resultados
- Determinar la causa exacta del error
- Confirmar si es por falta de MTR o por configuración del pool

### Fase 3: Correcciones (SOLO DESPUÉS DE EXPLICARTE)
- Implementar las correcciones necesarias según el escenario encontrado
- Agregar validaciones para evitar intentos de venta cuando no hay MTR
- Mejorar manejo de errores y logs

---

## ⚠️ IMPORTANTE

**NO haré cambios al código hasta que**:
1. ✅ Complete la investigación
2. ✅ Te explique los resultados
3. ✅ Tú apruebes las correcciones propuestas

**El código actual seguirá funcionando para**:
- ✅ Detectar depósitos de USDC
- ✅ Comprar MTR cuando lleguen depósitos
- ✅ Acreditar créditos a usuarios
- ✅ Procesar apuestas (sistema de créditos)

**Lo que NO funcionará hasta resolver**:
- ❌ Venta automática de MTR (pero esto es normal si no hay MTR para vender)

---

## 📝 PRÓXIMOS PASOS

1. **Ahora**: Ejecutar script de diagnóstico para investigar
2. **Después**: Mostrarte los resultados y explicar qué encontré
3. **Finalmente**: Proponer correcciones específicas y esperar tu aprobación

¿Procedo con la investigación?
