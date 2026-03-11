# 📋 Scripts Manuales (Sin Necesidad de Pegar)

## 🔧 PROBLEMA: No Puedes Pegar en la Consola

Si no puedes pegar texto en la consola, aquí tienes scripts **MUY CORTOS** que puedes escribir manualmente:

---

## ✅ Script 1: Corregir Tooltip (MUY CORTO)

Escribe esto línea por línea en la consola:

```javascript
var b=document.getElementById('createSocialBtn');
if(b){b.title='';b.removeAttribute('title');console.log('OK');}
```

O aún más corto (una sola línea):

```javascript
var b=document.getElementById('createSocialBtn');if(b){b.title='';b.removeAttribute('title');console.log('OK');}
```

---

## ✅ Script 2: Verificar Estado Completo

```javascript
var b=document.getElementById('createSocialBtn');console.log('Title:',b?.title,'Disabled:',b?.disabled,'Onclick:',!!b?.onclick,'Modo:',window.currentMode);
```

---

## ✅ Script 3: Forzar Corrección Continua del Tooltip

```javascript
setInterval(function(){var b=document.getElementById('createSocialBtn');if(b&&b.title&&b.title.includes('100')){b.title=b.title.replace(/100/g,'5');b.setAttribute('title',b.title);}},25);
```

---

## ✅ Script 4: Verificar Banner Verde

```javascript
var c=document.getElementById('selectedSongCard');console.log('Card:',c,'HTML:',c?.innerHTML.substring(0,100),'Clases:',c?.className);
```

---

## ✅ Script 5: Detener Todos los Audios Manualmente

```javascript
document.querySelectorAll('audio').forEach(function(a){a.pause();a.currentTime=0;});console.log('Audios detenidos');
```

---

## ✅ Script 6: Forzar Funcionamiento del Botón

```javascript
var b=document.getElementById('createSocialBtn');if(b){b.onclick=function(){console.log('CLIC');if(typeof createSocialChallenge==='function'){createSocialChallenge();}else{console.error('No existe');}};console.log('Onclick configurado');}
```

---

## 🎯 RECOMENDACIÓN

**Ejecuta estos scripts en orden**:
1. Script 3 (corrección continua del tooltip)
2. Script 6 (forzar funcionamiento del botón)
3. Script 5 (detener audios)

Luego prueba:
- Seleccionar una canción
- Ver si aparece el banner verde
- Ver si el preview se detiene
- Pasar el mouse sobre el botón
- Hacer clic en el botón

---

¿Puedes ejecutar estos scripts manualmente?
