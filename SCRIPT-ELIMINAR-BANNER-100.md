# 🔧 Script para Eliminar Banner de "100 créditos"

## 📋 INSTRUCCIONES

1. **Abre la consola del navegador** (F12 → Console)
2. **Copia y pega este código completo:**
3. **Presiona Enter**

---

## 🚀 SCRIPT COMPLETO

```javascript
(function() {
    console.log('🔍 Buscando y eliminando banners con "100 créditos"...');
    
    // Función para eliminar banners
    function eliminarBanners100() {
        var encontrados = 0;
        var allElements = document.querySelectorAll('*');
        
        allElements.forEach(function(el) {
            var text = (el.textContent || el.innerText || '').trim();
            if (text.includes('100') && text.includes('créditos') && (text.includes('desafíos') || text.includes('mínima'))) {
                console.log('⚠️ Encontrado:', el, 'Texto:', text);
                el.remove();
                encontrados++;
            }
        });
        
        return encontrados;
    }
    
    // Ejecutar inmediatamente
    var eliminados = eliminarBanners100();
    console.log('✅ Elementos eliminados:', eliminados);
    
    // Ejecutar después de un delay
    setTimeout(function() {
        var eliminados2 = eliminarBanners100();
        console.log('✅ Elementos eliminados (delay):', eliminados2);
    }, 500);
    
    // Forzar corrección de valores
    var betAmountInput = document.getElementById('betAmount');
    if (betAmountInput) {
        betAmountInput.setAttribute('min', '5');
        betAmountInput.setCustomValidity('');
        console.log('✅ Input min forzado a 5');
    }
    
    var minBetEl = document.getElementById('minBet');
    if (minBetEl) {
        minBetEl.textContent = '5';
        console.log('✅ minBet forzado a 5');
    }
    
    // Crear observer permanente
    if (!window.banner100Observer) {
        window.banner100Observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                        var text = (node.textContent || node.innerText || '').trim();
                        if (text.includes('100') && text.includes('créditos') && (text.includes('desafíos') || text.includes('mínima'))) {
                            console.log('⚠️ Banner detectado dinámicamente:', node);
                            node.remove();
                            console.log('✅ Banner eliminado');
                        }
                    }
                });
            });
        });
        
        var songSelection = document.getElementById('songSelection');
        if (songSelection) {
            window.banner100Observer.observe(songSelection, {
                childList: true,
                subtree: true
            });
            console.log('✅ Observer activado');
        }
    }
    
    console.log('✅ Script ejecutado. El banner debería desaparecer.');
})();
```

---

## ✅ DESPUÉS DE EJECUTAR

1. **Recarga la página** (Ctrl + Shift + R)
2. **Ve a modo "Desafío Social"**
3. **Verifica que el banner ya no aparezca**

---

## 🔍 SI AÚN APARECE

Ejecuta esto para ver exactamente dónde está:

```javascript
var allElements = document.querySelectorAll('*');
allElements.forEach(function(el) {
    var text = (el.textContent || '').trim();
    if (text.includes('100') && text.includes('créditos')) {
        console.log('📍 Ubicación:', el);
        console.log('📍 Texto completo:', text);
        console.log('📍 Clases:', el.className);
        console.log('📍 Estilos:', el.style.cssText);
        console.log('---');
    }
});
```

Esto te mostrará exactamente qué elemento está generando el banner.
