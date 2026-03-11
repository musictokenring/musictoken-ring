# 🔍 Script de Diagnóstico para Encontrar el Banner Exacto

## 📋 Script de Diagnóstico Completo

Ejecuta este script para encontrar **exactamente** dónde está el banner rojo:

```javascript
(function() {
    console.log('🔍 DIAGNÓSTICO COMPLETO DEL BANNER ROJO');
    console.log('==========================================');
    
    var found = [];
    
    // Buscar en todos los elementos
    document.querySelectorAll('*').forEach(function(el) {
        var text = (el.textContent || '').trim();
        var innerHTML = el.innerHTML || '';
        
        // Buscar por texto exacto
        if (text === 'La apuesta mínima para desafíos sociales es 100 créditos') {
            found.push({
                type: 'TEXTO_EXACTO',
                element: el,
                text: text,
                tagName: el.tagName,
                className: el.className,
                id: el.id,
                style: el.style.cssText,
                parent: el.parentElement?.tagName,
                computedStyle: window.getComputedStyle(el).backgroundColor
            });
        }
        // Buscar por variaciones
        else if (text.includes('apuesta mínima') && text.includes('desafíos sociales') && 
                 text.includes('100') && text.includes('créditos')) {
            found.push({
                type: 'VARIACION',
                element: el,
                text: text,
                tagName: el.tagName,
                className: el.className,
                id: el.id,
                style: el.style.cssText,
                parent: el.parentElement?.tagName
            });
        }
        // Buscar en innerHTML también
        else if (innerHTML.includes('100') && innerHTML.includes('créditos') && 
                 innerHTML.includes('desafíos')) {
            found.push({
                type: 'INNERHTML',
                element: el,
                innerHTML: innerHTML.substring(0, 200),
                tagName: el.tagName,
                className: el.className,
                id: el.id
            });
        }
    });
    
    // Buscar elementos con clases rojas
    document.querySelectorAll('[class*="red"], [class*="bg-red"]').forEach(function(el) {
        var text = (el.textContent || '').trim();
        if (text.includes('100') || text.includes('créditos')) {
            found.push({
                type: 'CLASE_ROJA',
                element: el,
                text: text.substring(0, 100),
                tagName: el.tagName,
                className: el.className,
                id: el.id
            });
        }
    });
    
    // Mostrar resultados
    if (found.length > 0) {
        console.log('⚠️ ENCONTRADOS', found.length, 'ELEMENTO(S):');
        found.forEach(function(item, index) {
            console.log(`\n[${index + 1}] Tipo: ${item.type}`);
            console.log('   Elemento:', item.element);
            console.log('   Tag:', item.tagName);
            console.log('   Clase:', item.className);
            console.log('   ID:', item.id);
            console.log('   Texto:', item.text || item.innerHTML);
            console.log('   Padre:', item.parent);
            if (item.computedStyle) {
                console.log('   Background:', item.computedStyle);
            }
            
            // Resaltar en la página
            item.element.style.border = '5px solid yellow';
            item.element.style.boxShadow = '0 0 20px yellow';
        });
        
        console.log('\n✅ Elementos resaltados en amarillo en la página');
        console.log('📝 Ejecuta esto para eliminarlos:');
        console.log('found.forEach(item => item.element.remove());');
    } else {
        console.log('✅ NO se encontró ningún elemento con "100 créditos"');
        console.log('   Esto significa que:');
        console.log('   1. El banner ya fue eliminado');
        console.log('   2. El banner está en un iframe');
        console.log('   3. El banner está en un shadow DOM');
        console.log('   4. El banner se genera dinámicamente y desaparece rápido');
    }
    
    return found;
})();
```

## 🔧 Script para Eliminar los Elementos Encontrados

Si el diagnóstico encuentra elementos, ejecuta esto para eliminarlos:

```javascript
// Primero ejecuta el diagnóstico arriba, luego esto:
found.forEach(function(item) {
    console.log('Eliminando:', item.type, item.text);
    item.element.remove();
});
```

## 🔍 Verificar si el Script Automático Está Funcionando

Ejecuta esto para verificar si el script automático en el HTML está activo:

```javascript
// Verificar si hay intervalos activos
console.log('Intervalos activos:', window.bannerRemovalInterval ? 'SÍ' : 'NO');

// Verificar si el MutationObserver está activo
console.log('MutationObserver activo:', window.banner100Observer ? 'SÍ' : 'NO');

// Verificar elementos en songSelection
var songSelection = document.getElementById('songSelection');
if (songSelection) {
    console.log('songSelection encontrado');
    var banners = songSelection.querySelectorAll('[class*="red"], [class*="bg-red"]');
    console.log('Banners rojos en songSelection:', banners.length);
    banners.forEach(function(banner) {
        console.log('  -', banner.textContent.trim().substring(0, 50));
    });
} else {
    console.log('songSelection NO encontrado');
}
```

---

¿Qué muestra el diagnóstico cuando lo ejecutas?
