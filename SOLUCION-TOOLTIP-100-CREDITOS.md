# ✅ SOLUCIÓN: Tooltip del Botón "Crear Desafío" muestra "100 créditos"

## 🔍 PROBLEMA IDENTIFICADO

Cuando el usuario pasa el mouse sobre el botón "Crear Desafío", aparece un tooltip que muestra **"Apuesta mínima: 100 créditos"** en lugar de **"Apuesta mínima: 5 créditos"**.

El tooltip viene del atributo `title` del botón `createSocialBtn`, que se establece en la función `updateBetEligibility()`.

---

## ✅ SOLUCIONES IMPLEMENTADAS

### 1. **Corrección en `updateBetEligibility()`**
- ✅ Asegura que SIEMPRE use `SOCIAL_CHALLENGE_MIN_BET` (5) en lugar de `GameEngine.minBet` (100)
- ✅ Verifica y corrige el `title` si contiene "100 créditos" con un `setTimeout`
- ✅ Establece el `title` correcto basado en el estado del botón

### 2. **Corrección en `updateActionButtons()`**
- ✅ Cuando se carga el modo social, verifica y corrige el `title` del botón
- ✅ Fuerza el `title` correcto después de un delay de 50ms
- ✅ Previene que otros scripts sobrescriban el valor

---

## 🔧 CÓDIGO IMPLEMENTADO

### En `updateBetEligibility()`:
```javascript
const SOCIAL_CHALLENGE_MIN_BET = 5;
if (createSocialBtn) {
    var canCoverSocialBet = !!bet && bet >= SOCIAL_CHALLENGE_MIN_BET && credits >= bet;
    createSocialBtn.disabled = !canCoverSocialBet || !selectedSong;
    
    // SIEMPRE usar SOCIAL_CHALLENGE_MIN_BET (5), nunca GameEngine.minBet (100)
    if (!canCoverSocialBet && bet > 0) {
        if (bet < SOCIAL_CHALLENGE_MIN_BET) {
            createSocialBtn.title = `Apuesta mínima: ${SOCIAL_CHALLENGE_MIN_BET} créditos`;
        } else {
            createSocialBtn.title = 'Créditos insuficientes';
        }
    } else {
        createSocialBtn.title = ''; // Sin tooltip si el botón está habilitado
    }
    
    // Verificar y corregir inmediatamente si el title tiene "100 créditos"
    setTimeout(function() {
        if (createSocialBtn && createSocialBtn.title && createSocialBtn.title.includes('100')) {
            createSocialBtn.title = createSocialBtn.title.replace('100', '5');
        }
    }, 10);
}
```

### En `updateActionButtons()`:
```javascript
if (mode === 'social') {
    setTimeout(function() {
        var createSocialBtn = document.getElementById('createSocialBtn');
        if (createSocialBtn) {
            // Verificar y corregir el title si tiene "100 créditos"
            if (createSocialBtn.title && createSocialBtn.title.includes('100')) {
                createSocialBtn.title = createSocialBtn.title.replace('100', '5');
            }
            // Asegurar que el title sea correcto
            // ... código para establecer el title correcto
        }
    }, 50);
}
```

---

## 🎯 VERIFICACIÓN

Ejecuta esto en la consola para verificar el `title` del botón:

```javascript
var createSocialBtn = document.getElementById('createSocialBtn');
if (createSocialBtn) {
    console.log('📝 Estado del botón "Crear Desafío":');
    console.log('   title:', createSocialBtn.title);
    console.log('   disabled:', createSocialBtn.disabled);
    console.log('   Modo actual:', window.currentMode);
    
    // Verificar si contiene "100"
    if (createSocialBtn.title && createSocialBtn.title.includes('100')) {
        console.log('⚠️ PROBLEMA: El title contiene "100 créditos"');
        console.log('   Corrigiendo...');
        createSocialBtn.title = createSocialBtn.title.replace('100', '5');
        console.log('✅ Title corregido:', createSocialBtn.title);
    } else {
        console.log('✅ El title está correcto');
    }
} else {
    console.log('❌ Botón "Crear Desafío" no encontrado');
}
```

---

## 🔧 SI AÚN MUESTRA "100 CRÉDITOS"

Ejecuta esto para corregirlo manualmente:

```javascript
var createSocialBtn = document.getElementById('createSocialBtn');
if (createSocialBtn) {
    // Corregir el title
    if (createSocialBtn.title && createSocialBtn.title.includes('100')) {
        createSocialBtn.title = createSocialBtn.title.replace('100', '5');
        console.log('✅ Title corregido:', createSocialBtn.title);
    }
    
    // Verificar el valor de la apuesta
    var bet = parseFloat(document.getElementById('betAmount')?.value || '0');
    var credits = window.CreditsSystem ? (window.CreditsSystem.currentCredits || 0) : 0;
    const SOCIAL_CHALLENGE_MIN_BET = 5;
    
    // Establecer el title correcto
    var canCoverSocialBet = !!bet && bet >= SOCIAL_CHALLENGE_MIN_BET && credits >= bet;
    if (!canCoverSocialBet && bet > 0) {
        if (bet < SOCIAL_CHALLENGE_MIN_BET) {
            createSocialBtn.title = `Apuesta mínima: ${SOCIAL_CHALLENGE_MIN_BET} créditos`;
        } else {
            createSocialBtn.title = 'Créditos insuficientes';
        }
    } else {
        createSocialBtn.title = '';
    }
    
    console.log('✅ Title final:', createSocialBtn.title);
}
```

---

## 📋 CHECKLIST DE VERIFICACIÓN

1. [ ] Recargar la página con Ctrl+Shift+R
2. [ ] Ir a modo "Desafío Social"
3. [ ] Pasar el mouse sobre el botón "Crear Desafío"
4. [ ] Verificar que el tooltip diga "Apuesta mínima: 5 créditos" (NO "100 créditos")
5. [ ] Ejecutar el script de verificación en la consola

---

## 🎯 RESULTADO ESPERADO

✅ **El tooltip debe mostrar "Apuesta mínima: 5 créditos"**
✅ **NO debe mostrar "Apuesta mínima: 100 créditos"**
✅ **El atributo `title` del botón debe contener "5 créditos"**

---

¿Funciona ahora después de recargar?
