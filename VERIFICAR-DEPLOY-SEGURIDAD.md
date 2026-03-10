# 🚀 VERIFICAR DEPLOY DE SEGURIDAD

## ✅ ESTADO ACTUAL

- ✅ **Código en GitHub:** Todos los cambios de seguridad están en `main`
- ✅ **Migraciones ejecutadas:** `vault_transactions` y `security_alerts` creadas
- ✅ **Dependencias:** `express-rate-limit` agregado al `package.json`

---

## 🔍 VERIFICAR SI RENDER HACE DEPLOY AUTOMÁTICO

### Opción 1: Render está conectado a GitHub (Automático)

Si Render está conectado a tu repositorio de GitHub, debería hacer deploy automático.

**Cómo verificar:**
1. Ve a: https://dashboard.render.com
2. Selecciona tu servicio del backend
3. Ve a la pestaña **"Events"** o **"Deploys"**
4. Deberías ver un deploy reciente o en progreso

**Si ves un deploy automático:**
- ✅ Espera a que termine (puede tardar 2-5 minutos)
- ✅ Revisa los logs para confirmar que no hay errores
- ✅ El sistema de seguridad estará activo automáticamente

---

### Opción 2: Deploy Manual (Si no es automático)

Si Render NO está haciendo deploy automático:

1. **Ve a Render Dashboard:**
   - https://dashboard.render.com
   - Selecciona tu servicio del backend

2. **Haz Deploy Manual:**
   - Busca el botón **"Manual Deploy"** o **"Deploy latest commit"**
   - Haz clic en **"Deploy latest commit"**
   - Espera a que termine

3. **Verifica los Logs:**
   - Ve a la pestaña **"Logs"**
   - Busca estos mensajes de éxito:
     ```
     ✅ Environment variables validated
     ✅ Platform Wallet: 0x75376BC58830f27415402875D26B73A6BE8E2253
     ✅ All services initialized
     ```

---

## 🔍 VERIFICAR QUE EL DEPLOY FUNCIONÓ

### 1. Verificar que el servidor inicia correctamente

En los logs de Render, deberías ver:

```
[server] 🔒 Validating environment variables...
[server] ✅ Environment variables validated
[server] 🔒 Platform Wallet: 0x75376BC58830f27415402875D26B73A6BE8E2253
[server] Initializing automated services...
[server] ✅ All services initialized
```

**Si ves errores sobre variables de entorno:**
- Verifica que `ADMIN_WALLET_PRIVATE_KEY`, `PLATFORM_WALLET_ADDRESS`, y `SUPABASE_SERVICE_ROLE_KEY` estén configuradas en Render

---

### 2. Probar el endpoint de seguridad

Una vez que el servidor esté corriendo, prueba hacer un claim con una wallet incorrecta para verificar que la validación funciona:

**Request de prueba (debe fallar con 403):**
```bash
curl -X POST https://tu-backend.onrender.com/api/claim \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "un-user-id-valido",
    "credits": 10,
    "walletAddress": "0x1111111111111111111111111111111111111111"
  }'
```

**Respuesta esperada:**
```json
{
  "error": "Wallet address does not match user account",
  "security_alert": true
}
```

Si recibes esta respuesta, ✅ **la seguridad está funcionando correctamente**.

---

### 3. Verificar que se crean alertas de seguridad

Después de intentar el claim con wallet incorrecta, verifica en Supabase:

```sql
SELECT * FROM security_alerts 
WHERE alert_type = 'WALLET_MISMATCH' 
ORDER BY created_at DESC 
LIMIT 5;
```

Deberías ver un registro de la alerta de seguridad.

---

## 🚨 SOLUCIÓN DE PROBLEMAS

### Error: "express-rate-limit not found"

**Solución:** Render debería instalar automáticamente. Si no, verifica que `package.json` tenga la dependencia (ya está agregada).

### Error: "Table vault_transactions does not exist"

**Solución:** Las migraciones no se ejecutaron. Vuelve a ejecutarlas en Supabase SQL Editor.

### Error: "Missing required environment variables"

**Solución:** Ve a Render → Environment → Verifica que estas variables estén configuradas:
- `ADMIN_WALLET_PRIVATE_KEY`
- `PLATFORM_WALLET_ADDRESS`
- `SUPABASE_SERVICE_ROLE_KEY`

### El servidor no inicia

**Solución:** Revisa los logs completos en Render y comparte el error específico.

---

## ✅ CHECKLIST POST-DEPLOY

- [ ] Servidor inicia sin errores
- [ ] Logs muestran "Environment variables validated"
- [ ] Endpoint `/api/claim` responde (aunque falle con wallet incorrecta)
- [ ] Rate limiting funciona (intentar más de 5 claims en 15 min → debe fallar)
- [ ] Alertas de seguridad se crean en Supabase cuando hay wallet mismatch
- [ ] Transacciones se registran en `vault_transactions` cuando se procesan claims

---

## 🎉 ¡LISTO!

Una vez que verifiques estos puntos, tu sistema de seguridad estará completamente activo y protegiendo tu plataforma.

**¿Necesitas ayuda con algún paso específico?** Comparte los logs o errores que veas y te ayudo a resolverlos.
