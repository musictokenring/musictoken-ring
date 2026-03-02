## 🔧 Configuración Automática de Variables de Entorno

Este PR agrega la infraestructura para configurar automáticamente las variables de entorno necesarias para el sistema de automatización.

### ✨ Características

- ✅ Archivo `.env.example` con todas las variables documentadas
- ✅ Scripts para configurar variables en Vercel y Render
- ✅ GitHub Actions workflow para validar configuración
- ✅ Archivos de configuración para Vercel (`vercel.json`) y Render (`render.yaml`)
- ✅ Comentarios automáticos en PRs con instrucciones

### 📁 Archivos Nuevos

- `.env.example` - Template de variables de entorno
- `scripts/setup-env-vars.sh` - Script bash para Linux/Mac
- `scripts/setup-env-vars.ps1` - Script PowerShell para Windows
- `.github/workflows/setup-env.yml` - GitHub Actions workflow
- `vercel.json` - Configuración de Vercel
- `render.yaml` - Configuración de Render

### 🚀 Uso

#### Configuración Manual (Recomendado para producción)

1. **Vercel Dashboard**:
   - Ve a Project Settings → Environment Variables
   - Agrega todas las variables desde `.env.example`

2. **Render Dashboard**:
   - Ve a tu servicio → Environment
   - Agrega todas las variables desde `.env.example`

#### Configuración Automática (Desarrollo)

```bash
# Linux/Mac
export SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export ADMIN_WALLET_PRIVATE_KEY="..."
export ADMIN_WALLET_ADDRESS="..."
./scripts/setup-env-vars.sh vercel

# Windows PowerShell
$env:SUPABASE_URL = "..."
$env:SUPABASE_SERVICE_ROLE_KEY = "..."
$env:ADMIN_WALLET_PRIVATE_KEY = "..."
$env:ADMIN_WALLET_ADDRESS = "..."
.\scripts\setup-env-vars.ps1 vercel
```

### ⚠️ Variables Sensibles

Las siguientes variables contienen información sensible y **NO** deben commitearse al repositorio:

- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_WALLET_PRIVATE_KEY`

Estas deben configurarse manualmente en cada plataforma de despliegue.

### ✅ Checklist

- [ ] Revisar `.env.example` y completar valores faltantes
- [ ] Configurar variables en Vercel Dashboard
- [ ] Configurar variables en Render Dashboard (si aplica)
- [ ] Verificar que el workflow de GitHub Actions pase
- [ ] Probar el script de configuración localmente

### 📝 Notas

- El archivo `.env.example` está diseñado para ser seguro de commitear (sin valores sensibles)
- Los scripts de configuración requieren credenciales de API (Vercel CLI token, Render API key)
- El workflow de GitHub Actions valida la configuración pero no expone valores sensibles
