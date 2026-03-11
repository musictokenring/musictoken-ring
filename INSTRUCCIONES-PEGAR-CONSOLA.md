# 📋 Instrucciones para Pegar en la Consola del Navegador

## 🔍 PROBLEMA

La consola del navegador no permite pegar texto directamente.

## ✅ SOLUCIONES

### Opción 1: Habilitar Pegado en Chrome DevTools

1. Abre Chrome DevTools (F12 o clic derecho → Inspeccionar)
2. Haz clic en el ícono de **Settings** (⚙️) en la esquina superior derecha de DevTools
3. Busca la opción **"Allow pasting"** o **"Permitir pegar"**
4. Actívala marcando la casilla
5. Cierra Settings
6. Ahora deberías poder pegar en la consola

### Opción 2: Usar el Campo de Entrada Manualmente

Si no puedes habilitar el pegado, puedes escribir el código manualmente. Te proporciono versiones más cortas:

#### Script Corto para Corregir Tooltip:

```javascript
var b=document.getElementById('createSocialBtn');if(b){b.title=b.title.replace(/100/g,'5');b.setAttribute('title',b.title);console.log('OK:',b.title);}
```

#### Script para Verificar:

```javascript
var b=document.getElementById('createSocialBtn');console.log('Title:',b?.title,'Disabled:',b?.disabled);
```

### Opción 3: Usar Bookmarklet

1. Crea un nuevo bookmark (marcador) en Chrome
2. Edita el bookmark y pega este código en la URL:

```javascript
javascript:(function(){var b=document.getElementById('createSocialBtn');if(b){b.title=b.title.replace(/100/g,'5');b.setAttribute('title',b.title);alert('Tooltip corregido');}})();
```

3. Guarda el bookmark
4. Cuando estés en la página, haz clic en el bookmark para ejecutar el script

### Opción 4: Usar la Pestaña Sources

1. Abre DevTools (F12)
2. Ve a la pestaña **"Sources"** (Fuentes)
3. Haz clic en **">>"** (Snippets) en el panel izquierdo
4. Crea un nuevo snippet
5. Pega el código allí
6. Haz clic derecho → **"Run"** (Ejecutar)

---

## 🎯 RECOMENDACIÓN

**La Opción 1 es la más fácil**: Simplemente habilita "Allow pasting" en Settings de DevTools y podrás pegar normalmente.

---

¿Pudiste habilitar el pegado en la consola?
