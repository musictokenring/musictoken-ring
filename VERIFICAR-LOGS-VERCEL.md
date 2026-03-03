# 🔍 Cómo Verificar Logs en Vercel Correctamente

## 📋 Diferencia entre Build Logs y Runtime Logs

### Build Logs (Proceso de Construcción)
- Se muestran durante el **deployment**
- Contienen los warnings que viste
- Se ven en la pestaña **"Deployments"** → Click en el deployment → **"Build Logs"**

### Runtime Logs (Cuando la App Está Corriendo)
- Se muestran cuando la aplicación está **activa y recibiendo requests**
- Los que estás viendo ahora (están vacíos porque no hay requests aún)
- Se ven en la pestaña **"Logs"** (donde estás ahora)

## ✅ Pasos para Verificar el Deployment

### Paso 1: Verificar Estado del Deployment
1. Ve a **Deployments** (no Logs)
2. Busca el último deployment
3. Verifica que esté en estado **"Ready"** (verde) o **"Building"** (amarillo)
4. Si está en "Ready", el deployment fue exitoso ✅

### Paso 2: Ver Build Logs Completos
1. Haz clic en el último deployment
2. Busca la sección **"Build Logs"** o **"Build Output"**
3. Ahí verás todos los warnings y mensajes del build
4. Busca al final del log:
   - ✅ "Build Completed" = Éxito
   - ✅ "Ready" = Éxito
   - ❌ "Build Failed" = Error

### Paso 3: Verificar que el Sitio Funcione
1. Ve a **Deployments**
2. Haz clic en el deployment que está en "Ready"
3. Haz clic en el botón **"Visit"** o copia la URL
4. Abre el sitio en tu navegador
5. Verifica que cargue correctamente

### Paso 4: Generar Runtime Logs (Probar el Backend)
Para que aparezcan logs en la pestaña "Logs", necesitas hacer requests:

1. **Prueba el Health Check:**
   ```
   https://tu-dominio.vercel.app/api/health
   ```
   O si el backend está en Render:
   ```
   https://musictoken-backend.onrender.com/api/health
   ```

2. **Abre tu sitio y conecta la wallet:**
   - Esto generará requests al backend
   - Aparecerán logs en la pestaña "Logs"

3. **Prueba otros endpoints:**
   ```
   https://tu-dominio.vercel.app/api/price
   ```

## 🔍 Qué Buscar en los Logs

### En Build Logs (Deployment):
- ✅ "Build Completed" = Todo OK
- ✅ "Installing dependencies" = Normal
- ✅ "Compiling..." = Normal
- ⚠️ Warnings = No críticos (como los que viste)
- ❌ "Error" o "Failed" = Problema real

### En Runtime Logs (Logs tab):
- Deben aparecer cuando haces requests
- Si están vacíos, es porque aún no hay requests
- Prueba hacer un request para generar logs

## 🐛 Si No Aparecen Logs

### Posibles Razones:
1. **El backend no está recibiendo requests:**
   - Prueba hacer un request manual al endpoint `/api/health`
   - Abre el sitio y conecta la wallet

2. **El backend no está corriendo:**
   - Verifica que el deployment esté "Ready"
   - Verifica que las variables de entorno estén configuradas

3. **Los filtros están muy restrictivos:**
   - Haz clic en "Reset Filters" en la pestaña Logs
   - Quita los filtros de "Warning", "Error", "Fatal"
   - Selecciona "All" en Console Level

## ✅ Checklist de Verificación

- [ ] Deployment está en estado "Ready" (verde)
- [ ] Build Logs muestran "Build Completed"
- [ ] El sitio carga correctamente al hacer "Visit"
- [ ] Las variables de entorno están configuradas (11 variables)
- [ ] Prueba hacer un request al backend para generar logs
- [ ] El frontend carga sin errores en la consola del navegador
