# 🔍 Script Mejorado para Diagnosticar Banner de "100 créditos"

## ✅ PROBLEMA CORREGIDO

El script anterior era demasiado amplio y eliminaba elementos incorrectos (como "MusicToken Ring", etc.). Ahora el código busca **específicamente** el mensaje exacto del error.

---

## 🔧 SCRIPT DE DIAGNÓSTICO MEJORADO

Ejecuta esto en la consola para buscar **SOLO** el banner específico:

```javascript
// Buscar SOLO el mensaje exacto del error
var allElements = document.querySelectorAll('*');
var found = false;
var exactMessage = 'La apuesta mínima para desafíos sociales es 100 créditos';

allElements.forEach(function(el) {
    var text = (el.textContent || el.innerText || '').trim();
    
    // Buscar mensaje exacto
    if (text === exactMessage) {
        console.log('⚠️ ENCONTRADO BANNER EXACTO:', el);
        console.log('   Texto:', text);
        console.log('   Elemento:', el);
        console.log('   Clases:', el.className);
        console.log('   Estilos:', el.style.cssText);
        console.log('   Padre:', el.parentElement);
        found = true;
    }
    
    // Buscar variaciones del mensaje
    if (text.includes('apuesta mínima') && text.includes('desafíos sociales') && text.includes('100') && text.includes('créditos')) {
        console.log('⚠️ ENCONTRADO VARIACIÓN DEL MENSAJE:', el);
        console.log('   Texto:', text);
        console.log('   Elemento:', el);
        found = true;
    }
});

if (!found) {
    console.log('✅ No se encontró ningún banner con "100 créditos"');
    console.log('   Esto significa que el banner puede estar siendo generado dinámicamente');
    console.log('   o que ya fue eliminado por el MutationObserver');
}

// Verificar estado del input
var betAmountInput = document.getElementById('betAmount');
if (betAmountInput) {
    console.log('📝 Estado del input betAmount:');
    console.log('   min:', betAmountInput.getAttribute('min'));
    console.log('   value:', betAmountInput.value);
    console.log('   validationMessage:', betAmountInput.validationMessage);
}

// Verificar elemento minBet
var minBetEl = document.getElementById('minBet');
if (minBetEl) {
    console.log('📝 Estado del elemento minBet:');
    console.log('   textContent:', minBetEl.textContent);
}

// Verificar modo actual
console.log('📝 Modo actual:', window.currentMode);
```

---

## 🔧 SCRIPT DE ELIMINACIÓN MEJORADO

Si encuentras el banner, ejecuta esto para eliminarlo:

```javascript
// Eliminar SOLO el banner específico
var exactMessage = 'La apuesta mínima para desafíos sociales es 100 créditos';
var allElements = document.querySelectorAll('*');
var removed = 0;

allElements.forEach(function(el) {
    var text = (el.textContent || el.innerText || '').trim();
    
    // Eliminar mensaje exacto
    if (text === exactMessage) {
        console.log('🗑️ Eliminando banner exacto:', text);
        el.remove();
        removed++;
    }
    
    // Eliminar variaciones
    if (text.includes('apuesta mínima') && text.includes('desafíos sociales') && text.includes('100') && text.includes('créditos')) {
        console.log('🗑️ Eliminando variación:', text);
        el.remove();
        removed++;
    }
});

if (removed > 0) {
    console.log('✅ Se eliminaron', removed, 'banner(es)');
} else {
    console.log('ℹ️ No se encontraron banners para eliminar');
}

// Forzar corrección del input
var betAmountInput = document.getElementById('betAmount');
if (betAmountInput) {
    betAmountInput.setAttribute('min', '5');
    betAmountInput.setCustomValidity('');
    console.log('✅ Input corregido: min="5"');
}

var minBetEl = document.getElementById('minBet');
if (minBetEl) {
    minBetEl.textContent = '5';
    console.log('✅ minBet corregido: 5');
}
```

---

## 🎯 VERIFICACIÓN FINAL

Después de ejecutar los scripts, verifica:

1. ✅ No debe aparecer ningún banner con "100 créditos"
2. ✅ El input debe tener `min="5"`
3. ✅ El elemento `minBet` debe mostrar "5"
4. ✅ El modo actual debe ser `'social'`

---

## 📋 PRÓXIMOS PASOS

1. Ejecuta el script de diagnóstico primero
2. Si encuentra el banner, ejecuta el script de eliminación
3. Recarga la página con Ctrl+Shift+R
4. Ve a modo "Desafío Social"
5. Verifica que NO aparezca el banner

---

¿Qué muestra el script de diagnóstico?
