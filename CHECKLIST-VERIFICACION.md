# ✅ Checklist de Verificación Post-Deployment

## 🔍 Verificaciones Inmediatas

### 1. Variables de Entorno en Vercel ✅
- [ ] Ve a Vercel Dashboard → Settings → Environment Variables
- [ ] Verifica que tengas **11 variables** configuradas:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - BASE_RPC_URL
  - MTR_TOKEN_ADDRESS
  - USDC_ADDRESS
  - PLATFORM_WALLET_ADDRESS
  - ADMIN_WALLET_ADDRESS
  - ADMIN_WALLET_PRIVATE_KEY
  - MTR_TO_CREDIT_RATE
  - PORT
  - NODE_ENV
- [ ] Verifica que las variables sensibles solo estén en **Production**:
  - SUPABASE_SERVICE_ROLE_KEY → Solo Production
  - ADMIN_WALLET_PRIVATE_KEY → Solo Production
  - NODE_ENV → Solo Production

### 2. Estado del Deployment en Vercel ✅
- [ ] Ve a Vercel Dashboard → Deployments
- [ ] Verifica que el último deployment esté en estado **"Ready"** (verde)
- [ ] Haz clic en el deployment y revisa los **Logs**
- [ ] Busca errores relacionados con:
  - Variables de entorno faltantes
  - Errores de conexión a Supabase
  - Errores de inicialización de servicios

### 3. Backend API (Importante) ⚠️

**El backend debe estar corriendo en Render o Vercel:**

#### Opción A: Si el backend está en Render
- [ ] Ve a Render Dashboard → Tu servicio
- [ ] Verifica que el servicio esté **Running**
- [ ] Revisa los logs del servicio
- [ ] Prueba el endpoint: `https://musictoken-backend.onrender.com/api/health`

#### Opción B: Si el backend está en Vercel
- [ ] Verifica que `vercel.json` esté configurado correctamente
- [ ] El backend debe estar en la ruta `/api/*`
- [ ] Prueba: `https://tu-dominio.vercel.app/api/health`

### 4. Frontend en Producción ✅
- [ ] Abre tu sitio en producción (ej: `https://musictokenring.vercel.app`)
- [ ] Verifica que la página cargue correctamente
- [ ] Abre la consola del navegador (F12)
- [ ] Busca errores en la consola
- [ ] Verifica que los scripts se carguen:
  - `credits-system.js`
  - `deposit-ui.js`
  - `claim-ui.js`
  - `wallet-credits-integration.js`

### 5. Conexión de Wallet ✅
- [ ] Haz clic en "Conectar Wallet"
- [ ] Conecta tu MetaMask
- [ ] Verifica que se muestre tu dirección de wallet
- [ ] Verifica que aparezca el display de créditos (debe mostrar "0 créditos" inicialmente)

### 6. Sistema de Créditos ✅
- [ ] Con la wallet conectada, verifica en la consola:
  - Debe aparecer: `[credits-system] Initializing for wallet: 0x...`
  - Debe aparecer: `[credits-system] Balance loaded: {credits: 0, usdcValue: 0}`
- [ ] Verifica que se muestre en la UI:
  - "0 créditos" o similar
  - "≈ $0 USDC"

### 7. Base de Datos (Supabase) ✅
- [ ] Ve a Supabase Dashboard → Table Editor
- [ ] Verifica que existan las tablas:
  - `users`
  - `user_credits`
  - `deposits`
  - `claims`
  - `platform_settings`
- [ ] Verifica que la tabla `platform_settings` tenga los valores iniciales:
  - `mtr_usdc_price`
  - `mtr_to_credit_rate` = 778

## 🐛 Solución de Problemas Comunes

### Error: "Backend API no disponible"
**Solución:**
- El backend debe estar corriendo en Render o Vercel
- Si está en Render, verifica que el servicio esté activo
- Si está en Vercel, verifica que las rutas `/api/*` estén configuradas en `vercel.json`

### Error: "Variables de entorno no encontradas"
**Solución:**
- Verifica que todas las variables estén en Vercel Dashboard
- Asegúrate de hacer **Redeploy** después de agregar variables
- Verifica que las variables estén en el environment correcto (Production)

### Error: "No se pueden cargar créditos"
**Solución:**
- Verifica que el backend esté corriendo
- Verifica que `BACKEND_API` en `index.html` apunte a la URL correcta
- Revisa la consola del navegador para ver errores específicos

### Error: "Supabase connection failed"
**Solución:**
- Verifica que `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` estén correctos
- Verifica que la migración SQL se haya ejecutado correctamente
- Revisa los logs del backend para errores de conexión

## ✅ Pruebas Funcionales

### Prueba 1: Depósito Automático
1. Conecta tu wallet
2. Copia la dirección de la plataforma desde la UI
3. Envía una pequeña cantidad de MTR a esa dirección desde MetaMask
4. Espera 1-2 minutos
5. Verifica que los créditos se acrediten automáticamente

### Prueba 2: Visualización de Créditos
1. Con wallet conectada
2. Verifica que se muestre el balance de créditos
3. Verifica que se muestre el equivalente en USDC

### Prueba 3: Sistema de Precios
1. Verifica que el precio MTR/USDC se actualice (puede tardar 1 minuto)
2. Revisa los logs del backend para confirmar que el price updater está funcionando

## 📊 Verificación Final

- [ ] Todas las variables de entorno configuradas
- [ ] Deployment exitoso en Vercel
- [ ] Backend API funcionando
- [ ] Frontend cargando correctamente
- [ ] Wallet conectándose correctamente
- [ ] Sistema de créditos mostrando balance
- [ ] Base de datos con tablas creadas
- [ ] Sin errores en consola del navegador
- [ ] Sin errores en logs del backend

## 🎉 Si Todo Está OK

¡Felicidades! El sistema de automatización está funcionando. Ahora puedes:
1. Probar hacer un depósito
2. Probar hacer una apuesta
3. Probar reclamar créditos ganados
