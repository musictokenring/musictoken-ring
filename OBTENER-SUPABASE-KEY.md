# 🔑 Cómo Obtener SUPABASE_SERVICE_ROLE_KEY

## Paso a Paso para Obtener la Service Role Key

### Paso 1: Acceder a Supabase Dashboard

1. Ve a [https://supabase.com](https://supabase.com)
2. Inicia sesión con tu cuenta
3. Selecciona tu proyecto: **bscmgcnynbxalcuwdqlm** (o el nombre de tu proyecto)

### Paso 2: Navegar a Settings → API

1. En el menú lateral izquierdo, haz clic en **Settings** (⚙️)
2. Dentro de Settings, haz clic en **API** en el submenú

### Paso 3: Encontrar la Service Role Key

En la página de API verás varias secciones:

1. **Project URL**: `https://bscmgcnynbxalcuwdqlm.supabase.co`
2. **anon public key**: Esta NO es la que necesitas
3. **service_role key**: Esta ES la que necesitas ⭐

### Paso 4: Copiar la Service Role Key

1. Busca la sección que dice **service_role** (puede estar oculta por defecto)
2. Haz clic en el botón **Reveal** o **Show** para revelar la clave
3. Copia toda la clave (es una cadena larga que empieza con `eyJ...`)

⚠️ **IMPORTANTE:**
- Esta clave tiene permisos completos en tu base de datos
- NO la compartas públicamente
- Solo úsala en el backend (nunca en el frontend)
- Es la clave que usarás en `SUPABASE_SERVICE_ROLE_KEY` en Vercel

### Paso 5: Usar la Key en Vercel

1. Ve a Vercel → Settings → Environment Variables
2. Agrega una nueva variable:
   - **Key**: `SUPABASE_SERVICE_ROLE_KEY`
   - **Value**: Pega la clave que copiaste
   - **Environment**: Solo **Production** (por seguridad)

## 🔒 Seguridad

- La **anon key** es pública y se puede usar en el frontend
- La **service_role key** es privada y solo debe usarse en el backend
- Nunca commitees la service_role key al repositorio
- Siempre usa variables de entorno para almacenarla
