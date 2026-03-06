# 🔍 Guía de Verificación de Migraciones SQL

Este documento explica cómo verificar que todas las migraciones SQL necesarias estén aplicadas en Supabase.

## 📋 Requisitos Previos

1. **Service Role Key de Supabase**: Necesitas la clave de servicio de Supabase para ejecutar las verificaciones.
   - Obténla desde: Supabase Dashboard → Project Settings → API → `service_role` key
   - ⚠️ **IMPORTANTE**: Esta clave tiene permisos completos. Úsala solo para scripts de administración.

## 🚀 Ejecutar Verificación

### Opción 1: Con Variable de Entorno (Recomendado)

**Windows PowerShell:**
```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="tu_service_role_key_aqui"
node backend/verify-migrations.js
```

**Linux/Mac:**
```bash
export SUPABASE_SERVICE_ROLE_KEY="tu_service_role_key_aqui"
node backend/verify-migrations.js
```

### Opción 2: Con Archivo .env

1. Crea un archivo `.env` en la raíz del proyecto:
```env
SUPABASE_URL=https://bscmgcnynbxalcuwdqlm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui
```

2. Instala `dotenv` si no está instalado:
```bash
npm install dotenv
```

3. Modifica `backend/verify-migrations.js` para cargar `.env`:
```javascript
require('dotenv').config();
```

## 📊 Qué Verifica el Script

El script verifica las siguientes migraciones:

### ✅ Migración 001: Sistema de Créditos Base
- Tablas: `users`, `user_credits`, `deposits`, `claims`, `platform_settings`, `rate_changes`, `match_wins`
- Funciones: `increment_user_credits`, `decrement_user_credits`
- Índices: `idx_deposits_user_id`, `idx_deposits_tx_hash`, `idx_users_wallet`

### ✅ Migración 002: Sistema de Créditos Estables
- Columnas: `deposits.usdc_value_at_deposit`, `deposits.deposit_fee`, `claims.withdrawal_fee`
- Tablas: `vault_fees`, `vault_balance`
- Funciones: `update_vault_balance`, `get_vault_balance`
- Índices: `idx_vault_fees_type`, `idx_vault_fees_status`

### ✅ Migración 003: Actualización Mínimo de Apuesta a 5
- Constraint CHECK en `social_challenges.bet_amount >= 5`

### ✅ Migración 004: Habilitar Seguridad RLS
- RLS habilitado en todas las tablas públicas
- Políticas RLS creadas

### ✅ Migración 005: Constraint Único en tx_hash
- Constraint UNIQUE en `deposits.tx_hash`

### ✅ Migración 006: Columna Network en Deposits
- Columna `deposits.network`
- Índice `idx_deposits_network`

### ✅ Tabla Social Challenges
- Tabla `social_challenges`
- RLS habilitado
- Índices necesarios

## 📝 Interpretar los Resultados

### ✅ Verificaciones Exitosas
Si todas las verificaciones pasan, verás:
```
✅ ¡TODAS LAS MIGRACIONES ESTÁN APLICADAS CORRECTAMENTE!
```

### ❌ Verificaciones Fallidas
Si hay migraciones faltantes, verás:
```
❌ HAY MIGRACIONES PENDIENTES DE APLICAR
```

El script listará específicamente qué elementos faltan.

### ⚠️ Advertencias
Algunas verificaciones pueden mostrar advertencias si no se pueden verificar directamente (como constraints únicos), pero esto no significa que falten.

## 🔧 Aplicar Migraciones Faltantes

Si el script detecta migraciones faltantes:

1. **Abre Supabase SQL Editor**:
   - Ve a tu proyecto en Supabase Dashboard
   - Navega a SQL Editor

2. **Ejecuta la migración correspondiente**:
   - Los archivos de migración están en `supabase/migrations/`
   - Copia el contenido del archivo SQL necesario
   - Pégalo en el SQL Editor
   - Ejecuta la consulta

3. **Vuelve a ejecutar el script de verificación**:
   ```bash
   node backend/verify-migrations.js
   ```

## 📁 Archivos de Migración

- `supabase/migrations/001_credits_system.sql`
- `supabase/migrations/002_stable_credits_system.sql`
- `supabase/migrations/003_update_min_bet_to_5.sql`
- `supabase/migrations/004_enable_rls_security.sql`
- `supabase/migrations/005_add_unique_constraint_deposits_tx_hash.sql`
- `supabase/migrations/006_add_network_column_deposits.sql`
- `create-social-challenges-table.sql`

## 🆘 Solución de Problemas

### Error: "SUPABASE_SERVICE_ROLE_KEY no está configurada"
- Asegúrate de haber configurado la variable de entorno antes de ejecutar el script
- Verifica que la clave sea correcta

### Error: "Cannot find module '@supabase/supabase-js'"
- Ejecuta `npm install` en la raíz del proyecto

### Error: "Connection refused" o "Timeout"
- Verifica que la URL de Supabase sea correcta
- Asegúrate de tener conexión a internet
- Verifica que el proyecto de Supabase esté activo

### Algunas verificaciones fallan pero las tablas existen
- Algunas verificaciones pueden ser indirectas (como constraints únicos)
- Si las tablas existen y funcionan, probablemente las migraciones están aplicadas
- Revisa manualmente en Supabase Dashboard → Table Editor

## 📞 Soporte

Si encuentras problemas que no se resuelven con esta guía:
1. Revisa los logs del script para más detalles
2. Verifica manualmente en Supabase Dashboard
3. Consulta la documentación de Supabase
