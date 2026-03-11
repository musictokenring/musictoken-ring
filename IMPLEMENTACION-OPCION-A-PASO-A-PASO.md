# 🛠️ IMPLEMENTACIÓN OPCIÓN A - Paso a Paso

## 📋 PLAN DE IMPLEMENTACIÓN

### Paso 1: Agregar Detección Automática de Fee Tier
- Agregar ABIs de Uniswap V3 Factory y Pool
- Crear función `findPoolFeeTier()` que busca pools con diferentes fee tiers
- Cachear el fee tier encontrado para evitar consultas repetidas

### Paso 2: Modificar Constructor para Detectar Fee Tier
- Al inicializar, detectar automáticamente qué fee tier tiene el pool
- Guardar en `this.poolFeeTier`
- Si no encuentra pool, deshabilitar swaps y mostrar error claro

### Paso 3: Actualizar Funciones de Swap
- `autoBuyMTR()`: Usar `this.poolFeeTier` en lugar de `500` hardcodeado
- `sellMTRForUSDC()`: Usar `this.poolFeeTier` en lugar de `500` hardcodeado

### Paso 4: Implementar Separación de Wallets
- Modificar para usar `MTR_POOL_WALLET` separada (configurable)
- Agregar validación: Si `MTR_POOL_WALLET === PLATFORM_WALLET`, mostrar advertencia
- Documentar cómo configurar wallet separada

### Paso 5: Agregar Validaciones de Seguridad
- Validar que MTR_POOL_WALLET tenga balance antes de intentar vender
- Agregar límite de protección para wallet de tesorería (opcional)
- Mejorar logs para mostrar claramente qué wallet se está usando

### Paso 6: Agregar Fallback a BaseSwap (Opcional)
- Si Uniswap no tiene pool, intentar BaseSwap
- Implementar como fallback automático

---

## 🎯 CAMBIOS ESPECÍFICOS

### Archivo: `backend/mtr-swap-service.js`

1. **Agregar constantes y ABIs**:
   - Uniswap V3 Factory address
   - Factory ABI
   - Pool ABI

2. **Agregar método `findPoolFeeTier()`**:
   - Busca pools con fee tiers: 500, 3000, 10000
   - Verifica liquidez
   - Retorna el fee tier encontrado o null

3. **Modificar constructor**:
   - Llamar `findPoolFeeTier()` al inicializar
   - Guardar resultado en `this.poolFeeTier`
   - Mostrar advertencia si no encuentra pool

4. **Modificar `autoBuyMTR()`**:
   - Usar `this.poolFeeTier` en lugar de `500`

5. **Modificar `sellMTRForUSDC()`**:
   - Usar `this.poolFeeTier` en lugar de `500`
   - Agregar validación temprana de balance MTR = 0

6. **Agregar validaciones de wallet**:
   - Verificar si `MTR_POOL_WALLET === PLATFORM_WALLET`
   - Mostrar advertencia si es la misma

---

## ⚠️ CONFIGURACIÓN REQUERIDA

### Variable de Entorno Nueva:
```
MTR_POOL_WALLET=<dirección_de_wallet_separada>
```

**Si NO se configura**: Usará `PLATFORM_WALLET` (por defecto) pero mostrará advertencia.

**Recomendación**: Crear una wallet nueva solo para el pool de auto-swap.

---

## ✅ RESULTADO ESPERADO

1. ✅ El sistema detecta automáticamente qué fee tier tiene el pool
2. ✅ Los swaps funcionan sin importar el fee tier (500, 3000, o 10000)
3. ✅ Los 99 millones de MTR en wallet de tesorería están protegidos
4. ✅ Solo se usa MTR de la wallet de pool configurada
5. ✅ Logs claros muestran qué wallet y fee tier se está usando

---

¿Procedo con la implementación?
