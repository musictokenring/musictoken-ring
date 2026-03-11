# 🔧 Script de Corrección Completa para Tooltip

## 📋 Script Completo de Verificación y Corrección

Ejecuta este script completo en la consola para verificar y corregir todo:

```javascript
(function() {
    console.log('🔍 Iniciando verificación completa del tooltip...');
    
    var createSocialBtn = document.getElementById('createSocialBtn');
    if (!createSocialBtn) {
        console.log('❌ Botón "Crear Desafío" no encontrado');
        return;
    }
    
    console.log('📝 Estado actual del botón:');
    console.log('   title:', createSocialBtn.title);
    console.log('   disabled:', createSocialBtn.disabled);
    console.log('   Modo actual:', window.currentMode);
    
    // Obtener valores actuales
    var betAmountInput = document.getElementById('betAmount');
    var bet = betAmountInput ? parseFloat(betAmountInput.value || '0') : 0;
    var credits = window.CreditsSystem ? (window.CreditsSystem.currentCredits || 0) : 0;
    const SOCIAL_CHALLENGE_MIN_BET = 5;
    
    console.log('📊 Valores actuales:');
    console.log('   Apuesta:', bet);
    console.log('   Créditos:', credits);
    console.log('   Mínimo requerido:', SOCIAL_CHALLENGE_MIN_BET);
    
    // Verificar si el title contiene "100"
    if (createSocialBtn.title && createSocialBtn.title.includes('100')) {
        console.log('⚠️ PROBLEMA DETECTADO: El title contiene "100 créditos"');
        console.log('   Title actual:', createSocialBtn.title);
        
        // Corregir el title
        createSocialBtn.title = createSocialBtn.title.replace('100', '5');
        console.log('✅ Title corregido:', createSocialBtn.title);
    }
    
    // Calcular el estado correcto del botón
    var canCoverSocialBet = !!bet && bet >= SOCIAL_CHALLENGE_MIN_BET && credits >= bet;
    var selectedSong = window.selectedSong || null;
    var shouldBeDisabled = !canCoverSocialBet || !selectedSong;
    
    console.log('📊 Estado calculado:');
    console.log('   Can cover bet:', canCoverSocialBet);
    console.log('   Selected song:', !!selectedSong);
    console.log('   Should be disabled:', shouldBeDisabled);
    
    // Establecer el title correcto
    if (!canCoverSocialBet && bet > 0) {
        if (bet < SOCIAL_CHALLENGE_MIN_BET) {
            createSocialBtn.title = `Apuesta mínima: ${SOCIAL_CHALLENGE_MIN_BET} créditos`;
        } else {
            createSocialBtn.title = 'Créditos insuficientes';
        }
    } else {
        createSocialBtn.title = ''; // Sin tooltip si el botón está habilitado
    }
    
    console.log('✅ Title final establecido:', createSocialBtn.title);
    
    // Verificar que no tenga "100" en ningún lugar
    if (createSocialBtn.title && createSocialBtn.title.includes('100')) {
        console.log('⚠️ ADVERTENCIA: El title aún contiene "100" después de la corrección');
        createSocialBtn.title = createSocialBtn.title.replace(/100/g, '5');
        console.log('✅ Title corregido nuevamente:', createSocialBtn.title);
    }
    
    // Crear un MutationObserver para prevenir cambios futuros
    if (!window.tooltipObserver) {
        window.tooltipObserver = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'title') {
                    var currentTitle = createSocialBtn.title || '';
                    if (currentTitle.includes('100')) {
                        console.log('[tooltipObserver] ⚠️ Title con "100" detectado:', currentTitle);
                        createSocialBtn.title = currentTitle.replace(/100/g, '5');
                        console.log('[tooltipObserver] ✅ Title corregido:', createSocialBtn.title);
                    }
                }
            });
        });
        
        window.tooltipObserver.observe(createSocialBtn, {
            attributes: true,
            attributeFilter: ['title']
        });
        
        console.log('✅ MutationObserver activado para prevenir cambios futuros');
    }
    
    console.log('✅ Verificación completa finalizada');
    console.log('📝 Para probar: Pasa el mouse sobre el botón "Crear Desafío"');
})();
```

---

## 🎯 Script Rápido de Corrección

Si solo quieres corregir rápidamente:

```javascript
var btn = document.getElementById('createSocialBtn');
if (btn && btn.title && btn.title.includes('100')) {
    btn.title = btn.title.replace(/100/g, '5');
    console.log('✅ Corregido:', btn.title);
}
```

---

## 🔍 Script de Diagnóstico

Para ver qué está pasando:

```javascript
var btn = document.getElementById('createSocialBtn');
console.log('Title:', btn?.title);
console.log('Modo:', window.currentMode);
console.log('Apuesta:', document.getElementById('betAmount')?.value);
console.log('Créditos:', window.CreditsSystem?.currentCredits);
```

---

¿Qué resultado obtuviste al ejecutar el script?
