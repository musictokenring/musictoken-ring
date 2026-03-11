# 🔍 SCRIPT DE DIAGNÓSTICO PARA CONSOLA

## 📋 INSTRUCCIONES

1. **Abre la aplicación** en el navegador
2. **Navega a Desafío Social**
3. **Abre la consola** (F12 → Console)
4. **Copia y pega** este código completo:

```javascript
(function() {
    console.log('🔍 INICIANDO DIAGNÓSTICO DE MENSAJE "100 CRÉDITOS"');
    console.log('═══════════════════════════════════════════════════');
    
    // 1. Verificar GameEngine.minBet
    console.log('\n1️⃣ GameEngine.minBet:', typeof GameEngine !== 'undefined' ? GameEngine.minBet : 'N/A');
    
    // 2. Verificar currentMode
    console.log('2️⃣ currentMode:', window.currentMode);
    
    // 3. Verificar elemento minBet
    var minBetEl = document.getElementById('minBet');
    console.log('3️⃣ minBet element texto:', minBetEl?.textContent);
    console.log('3️⃣ minBet element existe:', !!minBetEl);
    
    // 4. Verificar input betAmount
    var betAmountInput = document.getElementById('betAmount');
    console.log('4️⃣ betAmount min attribute:', betAmountInput?.getAttribute('min'));
    console.log('4️⃣ betAmount value:', betAmountInput?.value);
    console.log('4️⃣ betAmount existe:', !!betAmountInput);
    
    // 5. Verificar si hay código usando GameEngine.minBet con 100
    console.log('\n5️⃣ Buscando código que use GameEngine.minBet con 100...');
    var scripts = document.querySelectorAll('script');
    var foundMinBetUsage = false;
    scripts.forEach(function(script, idx) {
        if (script.textContent && script.textContent.includes('GameEngine.minBet') && script.textContent.includes('100')) {
            console.warn(`⚠️ Script ${idx} contiene GameEngine.minBet y 100:`, script.textContent.substring(0, 300));
            foundMinBetUsage = true;
        }
    });
    if (!foundMinBetUsage) {
        console.log('✅ No se encontró código usando GameEngine.minBet con 100');
    }
    
    // 6. Verificar función createSocialChallenge
    console.log('\n6️⃣ Verificando función createSocialChallenge...');
    if (typeof createSocialChallenge === 'function') {
        var funcStr = createSocialChallenge.toString();
        if (funcStr.includes('100')) {
            console.error('❌ createSocialChallenge contiene "100"');
            console.log('Función:', funcStr.substring(0, 500));
        } else {
            console.log('✅ createSocialChallenge no contiene "100"');
        }
        if (funcStr.includes('SOCIAL_CHALLENGE_MIN_BET')) {
            console.log('✅ createSocialChallenge usa SOCIAL_CHALLENGE_MIN_BET');
        }
    } else {
        console.warn('⚠️ createSocialChallenge no es una función');
    }
    
    // 7. Verificar función updateBetEligibility
    console.log('\n7️⃣ Verificando función updateBetEligibility...');
    if (typeof updateBetEligibility === 'function') {
        var funcStr = updateBetEligibility.toString();
        if (funcStr.includes('100')) {
            console.error('❌ updateBetEligibility contiene "100"');
            console.log('Función:', funcStr.substring(0, 500));
        } else {
            console.log('✅ updateBetEligibility no contiene "100"');
        }
        if (funcStr.includes('SOCIAL_CHALLENGE_MIN_BET')) {
            console.log('✅ updateBetEligibility usa SOCIAL_CHALLENGE_MIN_BET');
        }
    } else {
        console.warn('⚠️ updateBetEligibility no es una función');
    }
    
    // 8. Forzar corrección manual
    console.log('\n8️⃣ Aplicando corrección manual...');
    if (window.currentMode === 'social') {
        if (minBetEl) {
            minBetEl.textContent = '5';
            console.log('✅ minBet actualizado a 5');
        }
        if (betAmountInput) {
            betAmountInput.setAttribute('min', '5');
            var currentVal = parseFloat(betAmountInput.value || '0');
            if (!currentVal || currentVal < 5) {
                betAmountInput.value = '5';
            }
            console.log('✅ betAmount actualizado - min: 5, value:', betAmountInput.value);
        }
    } else {
        console.log('⚠️ No estás en modo social, currentMode:', window.currentMode);
    }
    
    // 9. Verificar si hay listeners en betAmount que puedan estar causando el problema
    console.log('\n9️⃣ Verificando event listeners en betAmount...');
    if (betAmountInput) {
        // No hay forma directa de obtener listeners, pero podemos verificar el atributo min
        var minAttr = betAmountInput.getAttribute('min');
        console.log('min attribute:', minAttr);
        if (minAttr && minAttr !== '5' && window.currentMode === 'social') {
            console.error('❌ min attribute es', minAttr, 'debería ser 5');
        } else {
            console.log('✅ min attribute correcto:', minAttr);
        }
    }
    
    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ DIAGNÓSTICO COMPLETADO');
    console.log('\n📋 RESUMEN:');
    console.log('- GameEngine.minBet:', typeof GameEngine !== 'undefined' ? GameEngine.minBet : 'N/A');
    console.log('- currentMode:', window.currentMode);
    console.log('- minBet element:', minBetEl?.textContent);
    console.log('- betAmount min:', betAmountInput?.getAttribute('min'));
    console.log('- betAmount value:', betAmountInput?.value);
    
    if (window.currentMode === 'social' && minBetEl?.textContent !== '5') {
        console.error('\n❌ PROBLEMA DETECTADO: minBet no es 5 en modo social');
        console.log('Solución: Ejecuta la corrección manual (paso 8)');
    } else if (window.currentMode === 'social') {
        console.log('\n✅ Todo parece correcto. Si el mensaje persiste, puede ser caché del navegador.');
    }
})();
```

---

## 🎯 QUÉ BUSCAR EN LOS RESULTADOS

1. **Si `GameEngine.minBet` es 100**: El problema es que `game_config` tiene `min_bet = 100` en la base de datos
2. **Si `minBet element texto` es 100**: El elemento HTML está siendo actualizado con el valor incorrecto
3. **Si encuentra código con "GameEngine.minBet" y "100"**: Hay código que necesita ser corregido
4. **Si el mensaje sigue apareciendo después de corrección manual**: Hay código ejecutándose después que lo sobrescribe

---

## 🔧 SOLUCIÓN TEMPORAL (Si el problema persiste)

Si después de ejecutar el diagnóstico el mensaje sigue apareciendo, ejecuta esto:

```javascript
// Forzar corrección permanente mientras estás en modo social
if (window.currentMode === 'social') {
    setInterval(function() {
        var minBetEl = document.getElementById('minBet');
        if (minBetEl && minBetEl.textContent !== '5') {
            minBetEl.textContent = '5';
        }
        var betAmountInput = document.getElementById('betAmount');
        if (betAmountInput) {
            betAmountInput.setAttribute('min', '5');
        }
    }, 100);
    console.log('✅ Corrección automática activada (se ejecuta cada 100ms)');
}
```

---

**Ejecuta el script de diagnóstico y comparte los resultados para identificar exactamente dónde está el problema.**
