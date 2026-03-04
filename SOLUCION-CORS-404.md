# Solución: Errores CORS y 404 en Backend

## Problemas Identificados

1. **CORS Policy Error**: El backend no permite requests desde `https://www.musictokenring.xyz`
2. **404 Not Found**: Los endpoints devuelven 404, indicando que el backend no está corriendo o no tiene los endpoints configurados

## Solución Implementada

### 1. Configuración CORS Mejorada

Se actualizó `backend/server-auto.js` para permitir explícitamente los dominios necesarios:

```javascript
const corsOptions = {
    origin: [
        'https://www.musictokenring.xyz',
        'https://musictokenring.xyz',
        'http://localhost:3000',
        'http://localhost:8080',
        'http://127.0.0.1:5500',
        'http://127.0.0.1:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
```

### 2. Endpoint Root Agregado

Se agregó un endpoint `/` que muestra información del API y ayuda a verificar que el servidor está corriendo.

### 3. Manejo de 404 Mejorado

Se agregó un handler para rutas API no encontradas que devuelve un mensaje más claro.

## Pasos para Aplicar la Solución

### Paso 1: Verificar que el Backend Esté Corriendo

1. Ve a Render Dashboard (o donde tengas desplegado el backend)
2. Verifica que el servicio esté activo
3. Revisa los logs para ver si hay errores

### Paso 2: Verificar URL del Backend

Abre en el navegador:
```
https://musictoken-backend.onrender.com/
```

Deberías ver un JSON con información del API. Si ves un error, el backend no está corriendo.

### Paso 3: Verificar Health Endpoint

```
https://musictoken-backend.onrender.com/api/health
```

Debería devolver:
```json
{
  "status": "ok",
  "services": {...},
  "cors": "enabled"
}
```

### Paso 4: Desplegar Cambios

1. **Commit y Push los cambios:**
   ```bash
   git add backend/server-auto.js
   git commit -m "Fix CORS configuration for musictokenring.xyz domain"
   git push
   ```

2. **Si usas Render:**
   - Render debería detectar el push automáticamente
   - Espera a que termine el deployment
   - Verifica los logs del deployment

3. **Si usas otro servicio:**
   - Despliega manualmente los cambios
   - Reinicia el servicio si es necesario

### Paso 5: Verificar CORS

Después del deployment, prueba desde la consola del navegador:

```javascript
fetch('https://musictoken-backend.onrender.com/api/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);
```

Si funciona, deberías ver el JSON de respuesta sin errores de CORS.

## Verificación de Endpoints

Después del deployment, verifica estos endpoints:

1. **Health Check:**
   ```
   GET https://musictoken-backend.onrender.com/api/health
   ```

2. **Vault Balance:**
   ```
   GET https://musictoken-backend.onrender.com/api/vault/balance
   ```

3. **User Credits:**
   ```
   GET https://musictoken-backend.onrender.com/api/user/credits/0x...
   ```

## Si el Backend No Está Corriendo

Si el backend devuelve 404 o no responde:

1. **Verifica el deployment en Render/Vercel:**
   - Ve al dashboard
   - Revisa el estado del servicio
   - Revisa los logs para errores

2. **Verifica variables de entorno:**
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_WALLET_PRIVATE_KEY`
   - `BASE_RPC_URL`

3. **Revisa los logs del backend:**
   - Busca errores de inicialización
   - Verifica que los servicios se inicialicen correctamente

## Notas Importantes

- El backend debe estar corriendo para que el frontend funcione
- CORS solo funciona si el backend está activo y respondiendo
- Los errores 404 indican que el backend no está corriendo o la URL es incorrecta
- Después de hacer cambios, siempre despliega y verifica

## Próximos Pasos

1. ✅ Commit y push de los cambios de CORS
2. ⏳ Esperar deployment en Render
3. ⏳ Verificar que los endpoints respondan
4. ⏳ Probar desde el frontend
