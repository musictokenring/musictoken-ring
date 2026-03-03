# 🔧 Guía Paso a Paso: Configurar Variables de Entorno en Vercel

## 📋 Paso 1: Acceder a Vercel Dashboard

1. Ve a [https://vercel.com](https://vercel.com)
2. Inicia sesión con tu cuenta
3. Selecciona el proyecto **musictoken-ring** (o el nombre de tu proyecto)

## 📋 Paso 2: Navegar a Configuración de Variables

1. En el dashboard del proyecto, haz clic en **Settings** (Configuración) en la barra superior
2. En el menú lateral izquierdo, busca y haz clic en **Environment Variables** (Variables de Entorno)

## 📋 Paso 3: Agregar Variables de Entorno

Para cada variable del archivo `.env.example`, sigue estos pasos:

### 3.1. Variables de Supabase

**Variable 1: SUPABASE_URL**
- **Key (Nombre)**: `SUPABASE_URL`
- **Value (Valor)**: `https://bscmgcnynbxalcuwdqlm.supabase.co`
- **Environment**: Selecciona todas las opciones (Production, Preview, Development)
- Haz clic en **Save**

**Variable 2: SUPABASE_SERVICE_ROLE_KEY**
- **Key**: `SUPABASE_SERVICE_ROLE_KEY`
- **Value**: Tu Service Role Key de Supabase (obtenerla desde Supabase Dashboard → Settings → API → service_role key)
- **Environment**: Selecciona todas las opciones
- Haz clic en **Save**

### 3.2. Variables de Blockchain (Base Network)

**Variable 3: BASE_RPC_URL**
- **Key**: `BASE_RPC_URL`
- **Value**: `https://mainnet.base.org`
- **Environment**: Todas
- Haz clic en **Save**

**Variable 4: MTR_TOKEN_ADDRESS**
- **Key**: `MTR_TOKEN_ADDRESS`
- **Value**: `0x99cd1eb32846c9027ed9cb8710066fa08791c33b`
- **Environment**: Todas
- Haz clic en **Save**

**Variable 5: USDC_ADDRESS**
- **Key**: `USDC_ADDRESS`
- **Value**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Environment**: Todas
- Haz clic en **Save**

### 3.3. Variables de Wallet de la Plataforma

**Variable 6: PLATFORM_WALLET_ADDRESS**
- **Key**: `PLATFORM_WALLET_ADDRESS`
- **Value**: `0x75376BC58830f27415402875D26B73A6BE8E2253`
- **Environment**: Todas
- Haz clic en **Save**

### 3.4. Variables de Admin Wallet (⚠️ IMPORTANTE - SENSIBLES)

**Variable 7: ADMIN_WALLET_PRIVATE_KEY**
- **Key**: `ADMIN_WALLET_PRIVATE_KEY`
- **Value**: Tu clave privada de la wallet admin (debe empezar con `0x`)
- **Environment**: Solo **Production** (por seguridad)
- ⚠️ **NO compartas esta clave con nadie**
- Haz clic en **Save**

**Variable 8: ADMIN_WALLET_ADDRESS**
- **Key**: `ADMIN_WALLET_ADDRESS`
- **Value**: La dirección pública de tu wallet admin (debe empezar con `0x`)
- **Environment**: Todas
- Haz clic en **Save**

### 3.5. Variables del Sistema de Créditos

**Variable 9: MTR_TO_CREDIT_RATE**
- **Key**: `MTR_TO_CREDIT_RATE`
- **Value**: `778`
- **Environment**: Todas
- Haz clic en **Save**

### 3.6. Variables del Servidor (Opcionales)

**Variable 10: PORT**
- **Key**: `PORT`
- **Value**: `3001`
- **Environment**: Todas
- Haz clic en **Save**

**Variable 11: NODE_ENV**
- **Key**: `NODE_ENV`
- **Value**: `production`
- **Environment**: Solo **Production**
- Haz clic en **Save**

### 3.7. Variables Opcionales (Price Updater)

**Variable 12: AERODROME_POOL_ADDRESS** (Opcional)
- **Key**: `AERODROME_POOL_ADDRESS`
- **Value**: Dejar vacío o agregar dirección del pool si la tienes
- **Environment**: Todas
- Haz clic en **Save**

**Variable 13: ZEROX_API_KEY** (Opcional)
- **Key**: `ZEROX_API_KEY`
- **Value**: Tu API key de 0x si la tienes (para fallback de precios)
- **Environment**: Todas
- Haz clic en **Save**

## 📋 Paso 4: Verificar Variables Configuradas

1. Desplázate hacia abajo en la página de Environment Variables
2. Verifica que todas las variables estén listadas
3. Asegúrate de que las variables sensibles (`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_WALLET_PRIVATE_KEY`) solo estén en **Production**

## 📋 Paso 5: Redesplegar la Aplicación

1. Ve a la pestaña **Deployments** en la barra superior
2. Encuentra el último deployment
3. Haz clic en los **3 puntos** (⋯) al lado del deployment
4. Selecciona **Redeploy**
5. Confirma el redeploy

**O simplemente:**
- Haz un pequeño cambio en cualquier archivo y haz push a `main`
- Vercel automáticamente redesplegará con las nuevas variables

## ✅ Checklist de Verificación

Marca cada variable cuando la hayas configurado:

- [ ] SUPABASE_URL
- [ ] SUPABASE_SERVICE_ROLE_KEY
- [ ] BASE_RPC_URL
- [ ] MTR_TOKEN_ADDRESS
- [ ] USDC_ADDRESS
- [ ] PLATFORM_WALLET_ADDRESS
- [ ] ADMIN_WALLET_PRIVATE_KEY
- [ ] ADMIN_WALLET_ADDRESS
- [ ] MTR_TO_CREDIT_RATE
- [ ] PORT
- [ ] NODE_ENV
- [ ] AERODROME_POOL_ADDRESS (opcional)
- [ ] ZEROX_API_KEY (opcional)

## 🔒 Seguridad

⚠️ **IMPORTANTE:**
- Nunca compartas `SUPABASE_SERVICE_ROLE_KEY` o `ADMIN_WALLET_PRIVATE_KEY`
- Estas variables solo deben estar en **Production** environment
- No las agregues a Preview o Development a menos que sea absolutamente necesario
- Vercel encripta estas variables automáticamente

## 🆘 Solución de Problemas

### Problema: No veo la opción "Environment Variables"
- Asegúrate de estar en la página de **Settings** del proyecto
- Verifica que tengas permisos de administrador en el proyecto

### Problema: Las variables no se aplican después del redeploy
- Espera unos minutos y verifica los logs del deployment
- Asegúrate de que las variables estén configuradas para el environment correcto (Production)

### Problema: Error al obtener SUPABASE_SERVICE_ROLE_KEY
- Ve a Supabase Dashboard → Settings → API
- Copia la clave que dice "service_role" (no la "anon" key)
- Asegúrate de copiar la clave completa

## 📞 Próximos Pasos

Una vez configuradas todas las variables:

1. ✅ Verifica que el deployment se haya completado exitosamente
2. ✅ Revisa los logs del servidor en Vercel para asegurarte de que no hay errores
3. ✅ Prueba el sistema de depósitos automáticos
4. ✅ Verifica que el sistema de créditos funcione correctamente
