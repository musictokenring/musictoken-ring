# ✅ Pruebas Post-Deployment - Sistema de Automatización

## 🎉 Deployment Exitoso

Tu deployment está en estado **"Ready"** y es el **"Production Current"**. Todo está correcto.

## 📋 Checklist de Pruebas

### 1. Verificar Frontend ✅

**Pasos:**
1. Abre tu sitio en producción:
   - Haz clic en "Visit" en el deployment de Vercel
   - O ve a: `https://musictokenring.vercel.app`

2. Verifica que la página cargue:
   - ✅ La página debe cargar sin errores
   - ✅ No debe haber errores en la consola del navegador (F12)

3. Verifica que los scripts se carguen:
   - Abre la consola del navegador (F12)
   - Busca mensajes como:
     - `[credits-system] Module loaded`
     - `[deposit-ui] Module loaded`
     - `[claim-ui] Module loaded`
     - `[wallet-credits] Integration module loaded`

### 2. Verificar Conexión de Wallet ✅

**Pasos:**
1. Haz clic en "Conectar Wallet"
2. Conecta tu MetaMask
3. Verifica que aparezca:
   - ✅ Tu dirección de wallet (ej: `0x742d...bEb`)
   - ✅ Display de créditos (debe mostrar "0 créditos" inicialmente)
   - ✅ Equivalente en USDC (debe mostrar "≈ $0 USDC")

4. En la consola del navegador, busca:
   ```
   [credits-system] Initializing for wallet: 0x...
   [credits-system] Balance loaded: {credits: 0, usdcValue: 0}
   ```

### 3. Verificar Backend API ✅

**Prueba los endpoints:**

1. **Health Check:**
   ```
   https://tu-dominio.vercel.app/api/health
   ```
   O si el backend está en Render:
   ```
   https://musictoken-backend.onrender.com/api/health
   ```
   
   **Respuesta esperada:**
   ```json
   {
     "status": "ok",
     "services": {
       "depositListener": true,
       "priceUpdater": true,
       "claimService": true
     }
   }
   ```

2. **Price Endpoint:**
   ```
   https://tu-dominio.vercel.app/api/price
   ```
   
   **Respuesta esperada:**
   ```json
   {
     "mtrPrice": 0.001,
     "rate": 778,
     "timestamp": "2026-03-02T..."
   }
   ```

3. **Credits Endpoint (con tu wallet conectada):**
   ```
   https://tu-dominio.vercel.app/api/user/credits/0xTU_WALLET
   ```
   
   **Respuesta esperada:**
   ```json
   {
     "credits": 0,
     "usdcValue": 0,
     "mtrPrice": 0.001,
     "rate": 778
   }
   ```

### 4. Verificar Variables de Entorno ✅

**En Vercel Dashboard:**
1. Ve a **Settings** → **Environment Variables**
2. Verifica que tengas **11 variables**:
   - [ ] SUPABASE_URL
   - [ ] SUPABASE_SERVICE_ROLE_KEY
   - [ ] BASE_RPC_URL
   - [ ] MTR_TOKEN_ADDRESS
   - [ ] USDC_ADDRESS
   - [ ] PLATFORM_WALLET_ADDRESS
   - [ ] ADMIN_WALLET_ADDRESS
   - [ ] ADMIN_WALLET_PRIVATE_KEY
   - [ ] MTR_TO_CREDIT_RATE
   - [ ] PORT
   - [ ] NODE_ENV

3. Verifica que las variables sensibles solo estén en **Production**:
   - SUPABASE_SERVICE_ROLE_KEY → Solo Production ✅
   - ADMIN_WALLET_PRIVATE_KEY → Solo Production ✅
   - NODE_ENV → Solo Production ✅

### 5. Verificar Base de Datos (Supabase) ✅

**En Supabase Dashboard:**
1. Ve a **Table Editor**
2. Verifica que existan las tablas:
   - [ ] `users`
   - [ ] `user_credits`
   - [ ] `deposits`
   - [ ] `claims`
   - [ ] `platform_settings`
   - [ ] `rate_changes`
   - [ ] `match_wins`

3. Verifica `platform_settings`:
   - Debe tener `mtr_usdc_price`
   - Debe tener `mtr_to_credit_rate` = 778

### 6. Prueba Funcional: Depósito Automático 🧪

**Pasos:**
1. Con tu wallet conectada, ve a la sección de depósitos
2. Copia la dirección de la plataforma que se muestra
3. Desde MetaMask, envía una pequeña cantidad de MTR (ej: 1000 MTR) a esa dirección
4. Espera 1-2 minutos
5. Verifica que:
   - ✅ Los créditos se acrediten automáticamente
   - ✅ Aparezca una notificación de depósito detectado
   - ✅ El balance de créditos se actualice

**Cálculo esperado:**
- 1000 MTR ÷ 778 (rate) = ~1.29 créditos

### 7. Verificar UI de Créditos ✅

**En el frontend, verifica que aparezca:**
- ✅ Display de créditos en el header
- ✅ Equivalente en USDC
- ✅ Sección de depósitos con dirección de plataforma
- ✅ Sección de reclamación de premios

## 🐛 Solución de Problemas

### Problema: El sitio no carga
**Solución:**
- Verifica que el deployment esté "Ready"
- Revisa la consola del navegador para errores
- Verifica que las variables de entorno estén configuradas

### Problema: No aparecen créditos
**Solución:**
- Verifica que la wallet esté conectada
- Revisa la consola del navegador
- Verifica que el backend esté corriendo
- Verifica que `BACKEND_API` en `index.html` apunte a la URL correcta

### Problema: Backend no responde
**Solución:**
- Verifica que el backend esté corriendo (Render o Vercel)
- Revisa los logs del backend
- Verifica que las variables de entorno estén configuradas
- Prueba el endpoint `/api/health`

### Problema: Depósito no se detecta
**Solución:**
- Verifica que el `deposit-listener` esté corriendo
- Revisa los logs del backend
- Verifica que `PLATFORM_WALLET_ADDRESS` sea correcta
- Espera 1-2 minutos (el listener escanea cada cierto tiempo)

## ✅ Verificación Final

- [ ] Deployment en estado "Ready"
- [ ] Frontend carga correctamente
- [ ] Wallet se conecta correctamente
- [ ] Créditos se muestran (0 inicialmente)
- [ ] Backend API responde
- [ ] Variables de entorno configuradas (11 variables)
- [ ] Base de datos con tablas creadas
- [ ] Sin errores en consola del navegador
- [ ] Sin errores en logs del backend

## 🎉 Si Todo Está OK

¡Felicidades! El sistema de automatización está funcionando. Ahora puedes:
1. ✅ Recibir depósitos automáticamente
2. ✅ Hacer apuestas con créditos
3. ✅ Ganar créditos automáticamente
4. ✅ Reclamar créditos convertidos a USDC
