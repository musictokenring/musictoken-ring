# 🔍 DIAGNÓSTICO: Mensaje de "100 créditos" Persiste

## 🐛 PROBLEMA

A pesar de múltiples correcciones, el mensaje **"La apuesta mínima para desafíos sociales es 100 créditos"** sigue apareciendo.

---

## ✅ CORRECCIONES YA IMPLEMENTADAS

### 1. En `game-engine.js`:
- ✅ `createSocialChallenge()` usa `SOCIAL_CHALLENGE_MIN_BET = 5` hardcodeado
- ✅ No usa `this.minBet` ni `MIN_BET_AMOUNT`

### 2. En `index.html`:
- ✅ `createSocialChallenge()` usa `SOCIAL_CHALLENGE_MIN_BET = 5`
- ✅ `updateBetEligibility()` usa `SOCIAL_CHALLENGE_MIN_BET = 5`
- ✅ `updateActionButtons()` fuerza `minBet` a 5 cuando `mode === 'social'`
- ✅ `selectMode()` fuerza `minBet` a 5 cuando `mode === 'social'`
- ✅ `quickBet()` fuerza `minBet` a 5 cuando `currentMode === 'social'`

---

## 🔍 POSIBLES CAUSAS RESTANTES

### Causa 1: Caché del Navegador
El navegador puede estar usando código JavaScript antiguo en caché.

**Solución**:
1. Presiona `Ctrl + Shift + Delete` → Limpiar datos de navegación
2. O presiona `Ctrl + Shift + R` para recarga forzada
3. O abre DevTools (F12) → Network → Marca "Disable cache" → Recarga

### Causa 2: Código Ejecutándose Después
Algún código puede estar ejecutándose después de nuestras correcciones y sobrescribiendo el valor.

**Verificación**:
```javascript
// Ejecutar en consola del navegador
console.log('GameEngine.minBet:', typeof GameEngine !== 'undefined' ? GameEngine.minBet : 'N/A');
console.log('currentMode:', window.currentMode);
console.log('minBet element:', document.getElementById('minBet')?.textContent);
```

### Causa 3: Mensaje Viene de Otro Lugar
El mensaje puede estar siendo generado desde:
- Un toast que se muestra antes de `createSocialChallenge`
- Una validación en el HTML5 (`min` attribute)
- Un mensaje de error del navegador por validación HTML5

**Verificación**:
- Abre DevTools → Console
- Busca logs que contengan "100" o "mínima"
- Verifica si hay errores de validación HTML5

---

## 🔧 VERIFICACIÓN MANUAL EN CONSOLA

Ejecuta esto en la consola del navegador cuando estés en modo social:

```javascript
// 1. Verificar GameEngine.minBet
console.log('1. GameEngine.minBet:', typeof GameEngine !== 'undefined' ? GameEngine.minBet : 'N/A');

// 2. Verificar currentMode
console.log('2. currentMode:', window.currentMode);

// 3. Verificar elemento minBet
var minBetEl = document.getElementById('minBet');
console.log('3. minBet element:', minBetEl?.textContent);

// 4. Verificar input betAmount
var betAmountInput = document.getElementById('betAmount');
console.log('4. betAmount min attribute:', betAmountInput?.getAttribute('min'));
console.log('5. betAmount value:', betAmountInput?.value);

// 5. Forzar corrección manual
if (window.currentMode === 'social') {
    if (minBetEl) minBetEl.textContent = '5';
    if (betAmountInput) {
        betAmountInput.setAttribute('min', '5');
        if (!betAmountInput.value || parseFloat(betAmountInput.value) < 5) {
            betAmountInput.value = '5';
        }
    }
    console.log('6. ✅ Corrección manual aplicada');
}

// 7. Verificar si hay scripts que usen GameEngine.minBet
var scripts = document.querySelectorAll('script');
var foundMinBetUsage = false;
scripts.forEach(function(script, idx) {
    if (script.textContent && script.textContent.includes('GameEngine.minBet') && script.textContent.includes('100')) {
        console.warn(`⚠️ Script ${idx} contiene GameEngine.minBet y 100:`, script.textContent.substring(0, 200));
        foundMinBetUsage = true;
    }
});
if (!foundMinBetUsage) {
    console.log('✅ No se encontró código usando GameEngine.minBet con 100');
}
```

---

## 🎯 PRÓXIMOS PASOS

1. **Ejecuta el código de verificación** en la consola
2. **Comparte los resultados** para identificar dónde está el problema
3. **Si el mensaje sigue apareciendo**, puede ser:
   - Un problema de caché del navegador
   - Un código que se ejecuta después y sobrescribe
   - Un mensaje que viene de otro lugar (no del código que hemos revisado)

---

## 📝 NOTAS

- Todos los lugares donde se valida el mínimo para desafíos sociales ya usan `SOCIAL_CHALLENGE_MIN_BET = 5`
- El elemento `minBet` se fuerza a 5 en múltiples lugares cuando `mode === 'social'`
- El input `betAmount` tiene `min="5"` establecido cuando es modo social

---

¿Puedes ejecutar el código de verificación y compartir los resultados?
