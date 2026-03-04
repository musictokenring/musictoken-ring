# Guía: Desplegar Backend en Render

## Problema Actual

El backend en `https://musictoken-backend.onrender.com` está devolviendo **404 Not Found**, lo que significa que:
- El servicio no está corriendo en Render, O
- El servicio está corriendo pero no tiene los endpoints configurados

## Solución: Desplegar Backend en Render

### Opción 1: Si Ya Tienes un Servicio en Render

1. **Ve a Render Dashboard**: https://dashboard.render.com
2. **Busca el servicio** llamado "musictoken-backend" o similar
3. **Verifica el estado**:
   - Si está "Stopped" → Haz clic en "Manual Deploy" → "Deploy latest commit"
   - Si está "Live" pero devuelve 404 → Revisa los logs para ver errores
4. **Revisa los logs**:
   - Ve a la pestaña "Logs"
   - Busca errores de inicio
   - Verifica que el servidor esté escuchando en el puerto correcto

### Opción 2: Crear Nuevo Servicio en Render

Si no tienes un servicio en Render, créalo:

1. **Ve a Render Dashboard**: https://dashboard.render.com
2. **Clic en "New +"** → **"Web Service"**
3. **Conecta tu repositorio de GitHub**:
   - Selecciona el repositorio `musictokenring/musictoken-ring`
   - O conecta manualmente

4. **Configuración del servicio**:
   - **Name**: `musictoken-backend`
   - **Region**: Elige la más cercana (US East, US West, etc.)
   - **Branch**: `main`
   - **Root Directory**: `backend` (IMPORTANTE)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server-auto.js`
   - **Instance Type**: Free tier está bien para empezar

5. **Variables de Entorno** (IMPORTANTE):
   Agrega estas variables en la sección "Environment":
   ```
   SUPABASE_URL=https://bscmgcnynbxalcuwdqlm.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui
   ADMIN_WALLET_ADDRESS=0x...
   ADMIN_WALLET_PRIVATE_KEY=0x...
   BASE_RPC_URL=https://mainnet.base.org
   USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
   PORT=3001
   ```

6. **Clic en "Create Web Service"**

### Opción 3: Verificar Configuración Existente

Si ya tienes un servicio pero no funciona:

1. **Verifica Root Directory**:
   - Debe ser `backend` (no raíz del proyecto)
   - Render necesita saber dónde está el código del backend

2. **Verifica Start Command**:
   - Debe ser: `node server-auto.js`
   - O: `npm start` (si tienes script en package.json)

3. **Verifica Variables de Entorno**:
   - Todas las variables requeridas deben estar configuradas
   - Especialmente `SUPABASE_SERVICE_ROLE_KEY` y `ADMIN_WALLET_PRIVATE_KEY`

4. **Revisa los Logs**:
   - Busca errores como "Cannot find module"
   - Busca errores de conexión a Supabase
   - Verifica que el servidor inicie correctamente

## Verificar que el Backend Funciona

Después del deployment, prueba estos endpoints:

### 1. Endpoint Raíz:
```
https://musictoken-backend.onrender.com/
```
**Debería devolver**: JSON con información del API

### 2. Health Check:
```
https://musictoken-backend.onrender.com/api/health
```
**Debería devolver**:
```json
{
  "status": "ok",
  "services": {
    "depositListener": false,
    "priceUpdater": true,
    "claimService": true,
    "vaultService": true
  },
  "cors": "enabled"
}
```

### 3. Vault Balance:
```
https://musictoken-backend.onrender.com/api/vault/balance
```
**Debería devolver**: JSON con balance del vault (puede ser 0 si no hay datos)

## Problemas Comunes

### Error: "Cannot find module"
**Causa**: Root Directory incorrecto o falta `package.json`
**Solución**: 
- Verifica que Root Directory sea `backend`
- Asegúrate de que `backend/package.json` existe

### Error: "Port already in use"
**Causa**: Conflicto de puerto
**Solución**: 
- Render asigna el puerto automáticamente
- Usa `process.env.PORT || 3001` en el código (ya está así)

### Error: "CORS still not working"
**Causa**: El código no se actualizó en Render
**Solución**:
- Haz "Manual Deploy" → "Deploy latest commit"
- Espera a que termine el deployment
- Verifica que los cambios estén en los logs

### Error: "404 Not Found"
**Causa**: El servicio no está corriendo o la URL es incorrecta
**Solución**:
- Verifica que el servicio esté "Live" en Render
- Verifica la URL del servicio (puede ser diferente a `musictoken-backend.onrender.com`)
- Revisa los logs para ver si el servidor inició correctamente

## Estructura de Archivos Requerida

Render necesita esta estructura:
```
backend/
  ├── server-auto.js
  ├── vault-service.js
  ├── deposit-listener.js
  ├── claim-service.js
  ├── price-updater.js
  ├── package.json
  └── ...
```

## Próximos Pasos

1. ✅ Verifica que el servicio exista en Render
2. ⏳ Si existe pero está detenido → Inícialo
3. ⏳ Si no existe → Créalo siguiendo Opción 2
4. ⏳ Verifica que todas las variables de entorno estén configuradas
5. ⏳ Haz deploy del último commit
6. ⏳ Espera 2-5 minutos para que termine el deployment
7. ⏳ Prueba los endpoints para verificar que funcionen
8. ⏳ Verifica que CORS funcione desde el frontend

## Nota Importante

- **Vercel** despliega el **frontend** (ya actualizado ✅)
- **Render** despliega el **backend** (necesita actualización ⏳)
- Son servicios separados, necesitas actualizar ambos
