# BASE_RPC_URL — RPC oficial Base

## Paso único

1. En tu panel de despliegue (Render, etc.), define:

   **`BASE_RPC_URL`** = `https://mainnet.base.org`

2. Guarda y redeploy si es necesario.

## Verificación

- En logs del backend deberías ver peticiones a Base sin errores de conexión RPC.
- El código usa `process.env.BASE_RPC_URL || 'https://mainnet.base.org'` en servicios Node.
