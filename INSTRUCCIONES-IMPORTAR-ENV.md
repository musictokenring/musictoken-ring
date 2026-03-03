# 📥 Cómo Importar el Archivo .env en Vercel

## Método 1: Importar Archivo .env (RECOMENDADO)

### Paso 1: Descargar el archivo
1. Descarga el archivo `vercel.env` que está en tu proyecto
2. Ábrelo con un editor de texto (Notepad, VS Code, etc.)

### Paso 2: Completar las variables faltantes
En el archivo `vercel.env`, reemplaza estas líneas:

```
SUPABASE_SERVICE_ROLE_KEY=[COMPLETAR: Obtener desde Supabase Dashboard → Settings → API → service_role key]
ADMIN_WALLET_ADDRESS=[COMPLETAR: Tu dirección de wallet admin desde MetaMask]
ADMIN_WALLET_PRIVATE_KEY=[COMPLETAR: Tu clave privada de wallet admin desde MetaMask]
```

Con tus valores reales:

```
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (tu key completa)
ADMIN_WALLET_ADDRESS=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb (tu dirección)
ADMIN_WALLET_PRIVATE_KEY=0x1234567890abcdef... (tu clave privada)
```

### Paso 3: Guardar el archivo
1. Guarda el archivo con los valores completados
2. Asegúrate de que el archivo se llama `vercel.env` o `.env`

### Paso 4: Importar en Vercel
1. En la pantalla de "Add Environment Variable" en Vercel
2. Haz clic en el botón **"Import .env"** (abajo a la izquierda)
3. Selecciona el archivo `vercel.env` que acabas de editar
4. Vercel automáticamente importará todas las variables

### Paso 5: Configurar Environments
Después de importar:
1. Para cada variable, verifica que el **Environment** esté configurado correctamente:
   - **SUPABASE_SERVICE_ROLE_KEY**: Solo **Production**
   - **ADMIN_WALLET_PRIVATE_KEY**: Solo **Production**
   - **NODE_ENV**: Solo **Production**
   - **Todas las demás**: **Production, Preview, Development**

2. Haz clic en **Save** para guardar todas las variables

## Método 2: Pegar Contenido Directamente

Si prefieres pegar el contenido:

1. Abre el archivo `vercel.env` y copia TODO su contenido
2. En Vercel, en el campo **Key**, pega todo el contenido del archivo
3. Vercel automáticamente parseará las variables
4. Haz clic en **Save**

## ⚠️ IMPORTANTE - Variables Sensibles

Después de importar, asegúrate de:

1. **Marcar como Sensitive** las siguientes variables:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_WALLET_PRIVATE_KEY`

2. **Verificar que solo estén en Production**:
   - Ve a cada variable sensible
   - Asegúrate de que solo tenga marcado "Production"
   - Desmarca "Preview" y "Development"

## ✅ Verificación Final

Después de importar, verifica que tengas estas 11 variables:

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

## 🚀 Siguiente Paso

Después de importar todas las variables:
1. Ve a la pestaña **Deployments**
2. Haz clic en los 3 puntos (⋯) del último deployment
3. Selecciona **Redeploy**
4. Espera a que termine el deployment
