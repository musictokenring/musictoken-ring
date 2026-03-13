# 🚨 SOLUCIÓN CRÍTICA: Saldo Duplicado en Hard Refresh

**Fecha:** 2026-03-11  
**Problema:** Cada hard refresh (Ctrl+Shift+R) incrementa el saldo en la misma cantidad del saldo on-chain MTR

---

## 🔍 DIAGNÓSTICO

### Problema Identificado:
El saldo de créditos jugables se multiplica cada vez que se hace un hard refresh. En la imagen se ve:
- **On-chain:** 98.024.480 MTR
- **Créditos jugables:** 784.195.820,00 (≈8x el on-chain)

### Causa Raíz:
Aunque la conversión automática en `refreshMtrBalance` estaba comentada, el código después del comentario aún podía ejecutarse en ciertos casos, o había múltiples llamadas a `loadBalance` que podían estar causando el problema.

---

## ✅ SOLUCIÓN IMPLEMENTADA

### 1. Bloqueo Explícito en `refreshMtrBalance`

**Archivo:** `index.html` (línea ~4771)

**Cambio:**
```javascript
// ⚠️⚠️⚠️ CONVERSIÓN AUTOMÁTICA COMPLETAMENTE DESHABILITADA ⚠️⚠️⚠️
// CRÍTICO: NO EJECUTAR NINGUNA CONVERSIÓN AUTOMÁTICA EN refreshMtrBalance
return; // SALIR INMEDIATAMENTE - NO EJECUTAR NINGUNA CONVERSIÓN
```

**Efecto:** Garantiza que `refreshMtrBalance` SOLO actualice el balance on-chain visual, NUNCA incremente créditos.

---

## 🔍 VERIFICACIÓN ADICIONAL REQUERIDA

### Puntos a Revisar:

1. **`loadBalance` en `credits-system.js`:**
   - ✅ Solo lee de Supabase/backend
   - ✅ NO incrementa créditos
   - ⚠️ Verificar que no haya lógica oculta que incremente

2. **`selectSongForBattle` conversión automática:**
   - ✅ Tiene protección con `sessionStorage`
   - ✅ Solo se ejecuta si hay desafío pendiente
   - ⚠️ Verificar que la protección funcione correctamente

3. **Múltiples llamadas a `loadBalance`:**
   - ⚠️ Hay múltiples llamadas en diferentes puntos
   - ⚠️ Verificar que no causen efectos secundarios

---

## 🧪 TESTING REQUERIDO

### Pasos para Verificar:

1. **Limpiar estado:**
   ```javascript
   // En consola del navegador:
   sessionStorage.clear();
   localStorage.clear();
   ```

2. **Verificar saldo actual:**
   - Anotar saldo on-chain MTR
   - Anotar saldo de créditos jugables

3. **Hacer hard refresh:**
   - Ctrl+Shift+R (Windows/Linux)
   - Cmd+Shift+R (Mac)

4. **Verificar saldo después:**
   - ✅ El saldo de créditos NO debe incrementarse
   - ✅ Debe mantenerse igual o solo cambiar por transacciones reales

5. **Repetir 3-5 veces:**
   - Hacer múltiples hard refreshes
   - Verificar que el saldo NO se multiplique

---

## 📝 NOTAS IMPORTANTES

### Conversión Automática:
- **DESHABILITADA COMPLETAMENTE** en `refreshMtrBalance`
- **Solo activa** en `selectSongForBattle` cuando hay desafío pendiente y créditos insuficientes
- **Protección:** `sessionStorage` con cooldown de 10 segundos

### Flujo Correcto:
1. Usuario hace hard refresh
2. `refreshMtrBalance` actualiza balance on-chain visual
3. `loadBalance` lee créditos desde Supabase
4. **NO se incrementan créditos automáticamente**

---

## ⚠️ SI EL PROBLEMA PERSISTE

### Pasos de Debugging:

1. **Abrir consola del navegador:**
   ```javascript
   // Buscar logs de conversión:
   // - "[refreshMtrBalance] 🔄 Detectado MTR on-chain"
   // - "[refreshMtrBalance] ✅✅✅ Créditos agregados"
   // - "[selectSongForBattle] 💰 Conversión automática"
   ```

2. **Verificar llamadas a `increment_user_credits`:**
   ```javascript
   // En consola, buscar:
   console.log('[INCREMENT]', arguments);
   ```

3. **Revisar `sessionStorage`:**
   ```javascript
   // Verificar flags de conversión:
   for (let i = 0; i < sessionStorage.length; i++) {
       const key = sessionStorage.key(i);
       if (key.includes('conversion') || key.includes('mtr')) {
           console.log(key, sessionStorage.getItem(key));
       }
   }
   ```

---

## 🔧 PRÓXIMOS PASOS

1. ✅ Bloqueo explícito agregado en `refreshMtrBalance`
2. ⏳ **Usuario debe probar hard refresh múltiples veces**
3. ⏳ Si persiste, revisar `loadBalance` y otras fuentes
4. ⏳ Si persiste, agregar más logging para identificar origen

---

**Estado:** ✅ Solución implementada, pendiente verificación del usuario
