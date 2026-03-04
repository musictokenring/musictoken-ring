# Diagnóstico: Error al Cargar Balance del Vault

## Posibles Causas del Error

El error "Error al cargar" en el balance del vault puede deberse a varias razones:

### 1. **Migración SQL No Ejecutada** ⚠️ (MÁS PROBABLE)

**Síntoma:** El backend devuelve error 500 o la tabla `vault_balance` no existe.

**Solución:**
1. Ve a Supabase Dashboard → SQL Editor
2. Ejecuta el archivo: `supabase/migrations/002_stable_credits_system.sql`
3. Verifica que las tablas se crearon:
   ```sql
   SELECT * FROM vault_balance;
   SELECT * FROM vault_fees;
   ```

### 2. **Backend No Disponible o No Responde**

**Síntoma:** Error de red "Failed to fetch" o "Backend no disponible"

**Verificación:**
- Abre la consola del navegador (F12)
- Busca errores de red en la pestaña "Network"
- Verifica que el backend esté corriendo: `https://musictoken-backend.onrender.com/api/health`

**Solución:**
- Verifica que el backend esté desplegado y corriendo
- Revisa los logs del backend en Render/Vercel

### 3. **Servicio del Vault No Inicializado**

**Síntoma:** Error 503 "Vault service not initialized"

**Causa:** El `VaultService` no se inicializó correctamente en el backend.

**Solución:**
- Verifica que el backend tenga las variables de entorno configuradas:
  - `ADMIN_WALLET_PRIVATE_KEY` (requerido)
  - `VAULT_WALLET_PRIVATE_KEY` (opcional)
- Reinicia el backend después de configurar las variables

### 4. **Error de CORS**

**Síntoma:** Error en consola sobre CORS policy

**Solución:**
- Verifica que el backend tenga CORS habilitado para tu dominio
- Revisa `backend/server-auto.js` - debe tener `app.use(cors())`

### 5. **Error en Base de Datos**

**Síntoma:** Error 500 con mensaje sobre base de datos

**Verificación:**
```sql
-- Verificar que las tablas existen
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('vault_fees', 'vault_balance');

-- Verificar que hay un registro inicial
SELECT * FROM vault_balance;
```

**Solución:**
- Si no existe, ejecuta:
  ```sql
  INSERT INTO vault_balance (balance_usdc, last_updated, updated_by)
  VALUES (0, NOW(), 'manual');
  ```

## Cómo Diagnosticar el Problema

### Paso 1: Abrir Consola del Navegador
1. Presiona `F12` en el navegador
2. Ve a la pestaña "Console"
3. Busca mensajes que empiecen con `[vault]`

### Paso 2: Verificar Request al Backend
1. En la consola, ve a la pestaña "Network"
2. Busca la request a `/api/vault/balance`
3. Haz clic en ella y revisa:
   - **Status Code**: ¿200, 500, 503, o error de red?
   - **Response**: ¿Qué mensaje de error muestra?

### Paso 3: Verificar Backend Directamente
Abre en el navegador:
```
https://musictoken-backend.onrender.com/api/vault/balance
```

Deberías ver un JSON con el balance o un mensaje de error.

### Paso 4: Verificar Health del Backend
```
https://musictoken-backend.onrender.com/api/health
```

Debería mostrar:
```json
{
  "status": "ok",
  "services": {
    "vaultService": true
  }
}
```

## Soluciones por Tipo de Error

### Error: "Vault service not initialized"
```bash
# En el backend, verifica variables de entorno:
echo $ADMIN_WALLET_PRIVATE_KEY
echo $VAULT_WALLET_PRIVATE_KEY

# Si faltan, agrégalas y reinicia el backend
```

### Error: "Table vault_balance does not exist"
```sql
-- Ejecuta en Supabase SQL Editor:
-- Copia todo el contenido de supabase/migrations/002_stable_credits_system.sql
```

### Error: "Failed to fetch" o "NetworkError"
- El backend no está disponible
- Verifica que esté desplegado y corriendo
- Revisa logs del backend en Render/Vercel

### Error: 500 Internal Server Error
- Revisa los logs del backend
- Verifica que la migración SQL se ejecutó
- Verifica que las variables de entorno estén configuradas

## Código Mejorado para Debugging

El código ahora muestra mensajes más descriptivos:
- "Backend no disponible" - Si hay error de red
- "Error: [mensaje]" - Si hay un error específico
- "No disponible" - Si el backend responde pero con error

Revisa la consola del navegador para ver los logs detallados con prefijo `[vault]`.

## Próximos Pasos

1. **Ejecuta la migración SQL** (si no lo has hecho)
2. **Verifica que el backend esté corriendo**
3. **Revisa la consola del navegador** para ver el error específico
4. **Comparte el error específico** si necesitas más ayuda
