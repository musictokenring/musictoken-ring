# Guía de Pruebas de Endpoints del Backend

## Endpoints para Probar Manualmente

### 1. Health Check
```
GET https://musictoken-ring.onrender.com/api/health
```
**Esperado:** JSON con status "ok" y todos los servicios en true

### 2. Vault Balance
```
GET https://musictoken-ring.onrender.com/api/vault/balance
```
**Esperado:** JSON con balance del vault (puede ser 0)

### 3. User Credits (Reemplaza con tu dirección)
```
GET https://musictoken-ring.onrender.com/api/user/credits/0xTU_DIRECCION_AQUI
```
**Esperado:** JSON con créditos del usuario

### 4. Vault Stats
```
GET https://musictoken-ring.onrender.com/api/vault/stats
```
**Esperado:** JSON con estadísticas del vault

---

## Cómo Probar desde el Navegador

1. Abre el navegador
2. Ve a la URL del endpoint
3. Deberías ver un JSON con la respuesta
4. Si ves un error, cópialo y compártelo

---

## Cómo Probar desde la Consola del Navegador

Abre la consola (F12) y ejecuta:

```javascript
// Health check
fetch('https://musictoken-ring.onrender.com/api/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);

// Vault balance
fetch('https://musictoken-ring.onrender.com/api/vault/balance')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);

// User credits (reemplaza con tu dirección)
fetch('https://musictoken-ring.onrender.com/api/user/credits/0xTU_DIRECCION')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);
```

---

## Verificar en el Frontend

1. Abre `https://www.musictokenring.xyz`
2. Abre la consola (F12)
3. Ve a la pestaña "Network"
4. Busca requests a `/api/vault/balance` o `/api/user/credits`
5. Verifica que responden con status 200 (no 404 o CORS errors)
