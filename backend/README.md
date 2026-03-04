# MusicToken Ring Backend

Backend API para MusicToken Ring con sistema de créditos estables.

## Configuración en Render

### Root Directory
```
backend
```

### Build Command
```
npm install
```

### Start Command
```
node server-auto.js
```

### Variables de Entorno Requeridas

```
SUPABASE_URL=https://bscmgcnynbxalcuwdqlm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
ADMIN_WALLET_ADDRESS=0x...
ADMIN_WALLET_PRIVATE_KEY=0x...
BASE_RPC_URL=https://mainnet.base.org
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
PORT=3001
```

### Variables Opcionales

```
VAULT_WALLET_ADDRESS=0x... (opcional, usa ADMIN_WALLET si no se configura)
VAULT_WALLET_PRIVATE_KEY=0x... (opcional)
BACKEND_API_URL=https://musictoken-backend.onrender.com
```

## Endpoints Disponibles

- `GET /` - Información del API
- `GET /api/health` - Health check
- `GET /api/vault/balance` - Balance del vault
- `GET /api/user/credits/:walletAddress` - Créditos del usuario
- `GET /api/deposits/:walletAddress` - Historial de depósitos
- `GET /api/claims/:walletAddress` - Historial de retiros
- `POST /api/user/deduct-credits` - Descontar créditos
- `POST /api/user/add-credits` - Agregar créditos
- `POST /api/claim` - Procesar retiro
- `POST /api/vault/add-fee` - Agregar fee al vault

## CORS

El backend está configurado para permitir requests desde:
- `https://www.musictokenring.xyz`
- `https://musictokenring.xyz`
- `http://localhost:3000`
- `http://localhost:8080`
