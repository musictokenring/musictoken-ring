# 🚀 GUÍA: Desplegar Cambios a Producción

## ✅ ESTADO ACTUAL

**Cambios pusheados a GitHub:**
- ✅ `a8800e5` - Actualizar updateCreditsDisplay para mostrar saldos en móvil
- ✅ `49991ff` - Fix problemas móvil: saldos visibles, ocultar login cuando autenticado, mejor responsive
- ✅ `422fb5c` - Ajustar endpoint credits para móviles exclusivamente
- ✅ `323efbe` - Ajustar solución para que solo aplique en móviles, PC sin cambios

**Repositorio:** `https://github.com/musictokenring/musictoken-ring.git`
**Rama:** `main`

---

## 🔄 OPCIÓN 1: Deploy Automático (Si está configurado)

Si Render tiene **auto-deploy** configurado desde GitHub:

1. **Los cambios se desplegarán automáticamente** en 1-3 minutos después del push
2. **Verifica el estado en Render Dashboard:**
   - Ve a: https://dashboard.render.com
   - Selecciona tu servicio `musictoken-backend`
   - Ve a la pestaña **"Events"** o **"Logs"**
   - Busca el evento más reciente que diga "Deploy started" o "Deploy succeeded"

---

## 🔧 OPCIÓN 2: Deploy Manual (Si auto-deploy no está activo)

### Paso 1: Verificar en Render Dashboard

1. Ve a: https://dashboard.render.com
2. Inicia sesión con tu cuenta
3. Selecciona tu servicio: **musictoken-backend**

### Paso 2: Forzar Deploy Manual

1. En la página del servicio, busca el botón **"Manual Deploy"** o **"Deploy latest commit"**
2. Haz clic en **"Deploy latest commit"**
3. Selecciona la rama: **main**
4. Haz clic en **"Deploy"**

### Paso 3: Monitorear el Deploy

1. Ve a la pestaña **"Logs"** en Render
2. Verás el progreso del deploy:
   ```
   Cloning repository...
   Installing dependencies...
   Building...
   Starting service...
   ```
3. Espera hasta ver: **"Deploy succeeded"** o **"Service is live"**

---

## 📋 VERIFICACIÓN POST-DEPLOY

### 1. Verificar que el Servidor Está Activo

```bash
# Verifica que el servidor responde
curl https://musictoken-ring.onrender.com/health
# O visita en navegador:
# https://musictoken-ring.onrender.com
```

### 2. Verificar Logs en Render

En Render Dashboard → Logs, busca:
- ✅ `[server] ✅ All services initialized`
- ✅ `[server] ✅ Wallet Link Service initialized`
- ✅ `[server] Server running on port 3001`

### 3. Probar en Móvil

1. Abre la plataforma en Chrome móvil
2. Loguea con Google
3. Conecta wallet
4. **Verifica:**
   - ✅ Saldos se muestran en formato compacto (ej: "5.00 $5.00")
   - ✅ Botón "Iniciar Sesión" desaparece cuando estás autenticado
   - ✅ No hay overflow horizontal (no necesitas hacer scroll lateral)
   - ✅ Abre desde navegador interno de wallet → Funciona sin sesión Google

---

## 🆘 SI HAY PROBLEMAS

### Error: "Build failed"

**Solución:**
1. Ve a Logs en Render
2. Busca el error específico
3. Verifica que todas las dependencias estén en `package.json`
4. Verifica que las variables de entorno estén configuradas

### Error: "Service failed to start"

**Solución:**
1. Verifica logs para ver el error específico
2. Verifica que `backend/server-auto.js` exista
3. Verifica que todas las variables de entorno estén configuradas
4. Verifica que el puerto esté correcto (3001)

### Los cambios no se reflejan

**Solución:**
1. Verifica que el commit esté en la rama `main`
2. Verifica que Render esté conectado a la rama correcta
3. Limpia caché del navegador (Ctrl+Shift+R)
4. Espera 2-3 minutos después del deploy

---

## 📝 RESUMEN DE CAMBIOS DESPLEGADOS

### Frontend (`index.html`):
- ✅ Header responsive mejorado para móvil
- ✅ Display móvil de saldos agregado (`creditsCombinedDisplayMobile`)
- ✅ Script `mobile-auth-check.js` incluido

### Backend (`src/credits-system.js`):
- ✅ `updateCreditsDisplay()` actualiza también display móvil
- ✅ Detección de móvil en `getUserId()` y `loadBalance()`

### Nuevo Archivo (`src/mobile-auth-check.js`):
- ✅ Verifica autenticación cada 5 segundos
- ✅ Oculta/muestra botón "Iniciar Sesión" según estado

---

## 🎯 PRÓXIMOS PASOS

1. ✅ **Esperar deploy automático** (1-3 minutos) O **forzar deploy manual**
2. ✅ **Verificar logs** en Render Dashboard
3. ✅ **Probar en móvil** con los pasos de verificación
4. ✅ **Reportar resultados** si hay algún problema

---

**¿Necesitas ayuda con algún paso específico del deploy?**
