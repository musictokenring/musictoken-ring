# 🔧 Script Agresivo para Eliminar Banner Rojo

## 🎯 PROBLEMA

El banner rojo con "100 créditos" sigue apareciendo a pesar de las correcciones anteriores.

## ✅ SOLUCIÓN IMPLEMENTADA

He agregado un script que se ejecuta automáticamente cada 500ms para eliminar cualquier banner rojo que aparezca.

## 🔧 SCRIPT MANUAL (Ejecutar en Consola)

Si el banner sigue apareciendo, ejecuta este script más agresivo:

```javascript
(function removeRedBannerAggressive() {
    console.log('🔍 Buscando y eliminando banner rojo...');
    var removed = 0;
    
    // Buscar en todos los elementos
    var allElements = document.querySelectorAll('*');
    allElements.forEach(function(el) {
        var text = (el.textContent || '').trim();
        var hasRedClass = el.className && typeof el.className === 'string' && 
            (el.className.includes('red') || el.className.includes('bg-red') || 
             el.className.includes('text-red') || el.className.includes('border-red'));
        var hasRedStyle = el.style && (
            (el.style.backgroundColor && el.style.backgroundColor.includes('red')) ||
            (el.style.color && el.style.color.includes('red')) ||
            (el.style.borderColor && el.style.borderColor.includes('red'))
        );
        
        // Verificar por texto exacto
        if (text === 'La apuesta mínima para desafíos sociales es 100 créditos') {
            console.log('⚠️ Encontrado banner exacto:', text, el);
            el.remove();
            removed++;
        }
        // Verificar por variaciones del mensaje
        else if (text.includes('apuesta mínima') && text.includes('desafíos sociales') && 
                 text.includes('100') && text.includes('créditos')) {
            console.log('⚠️ Encontrado variación del mensaje:', text, el);
            el.remove();
            removed++;
        }
        // Verificar por clases/estilos rojos con "100 créditos"
        else if ((hasRedClass || hasRedStyle) && text.includes('100') && text.includes('créditos')) {
            console.log('⚠️ Encontrado elemento rojo con 100 créditos:', text, el);
            el.remove();
            removed++;
        }
    });
    
    console.log('✅ Eliminados', removed, 'banner(es)');
    
    // Si se eliminó algo, ejecutar nuevamente después de un delay
    if (removed > 0) {
        setTimeout(removeRedBannerAggressive, 100);
    }
})();
```

## 🔄 SCRIPT CONTINUO (Ejecutar en Consola)

Para mantener el banner eliminado continuamente:

```javascript
// Crear intervalo que elimine el banner cada 200ms
if (window.bannerRemovalInterval) {
    clearInterval(window.bannerRemovalInterval);
}

window.bannerRemovalInterval = setInterval(function() {
    var allElements = document.querySelectorAll('*');
    allElements.forEach(function(el) {
        var text = (el.textContent || '').trim();
        if ((text === 'La apuesta mínima para desafíos sociales es 100 créditos') || 
            (text.includes('apuesta mínima') && text.includes('desafíos sociales') && 
             text.includes('100') && text.includes('créditos'))) {
            el.remove();
        }
    });
}, 200);

console.log('✅ Script continuo activado - eliminando banner cada 200ms');
```

## 🛑 DETENER SCRIPT CONTINUO

Si quieres detener el script continuo:

```javascript
if (window.bannerRemovalInterval) {
    clearInterval(window.bannerRemovalInterval);
    delete window.bannerRemovalInterval;
    console.log('✅ Script continuo detenido');
}
```

---

¿El banner desaparece después de ejecutar estos scripts?
