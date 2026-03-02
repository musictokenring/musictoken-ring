# Sistema de Automatización Completa - MusicTokenRing

Este documento describe el sistema de automatización implementado para eliminar toda intervención manual en la plataforma MusicTokenRing.

## 🎯 Objetivo

Automatizar completamente:
- ✅ Depósitos (detección automática de transferencias MTR/USDC)
- ✅ Conversión a créditos internos (off-chain)
- ✅ Apuestas en créditos (mínimo 100 créditos)
- ✅ Premios automáticos (créditos ganados)
- ✅ Reclamación de premios (créditos → USDC automático)
- ✅ Actualización de precios MTR/USDC (cada minuto)
- ✅ Ajuste automático de rate según cambios de precio

## 📁 Estructura de Archivos

### Backend

```
backend/
├── deposit-listener.js    # Escucha eventos de depósito MTR/USDC
├── price-updater.js       # Actualiza precios y ajusta rates automáticamente
├── claim-service.js        # Procesa reclamaciones y envía USDC
└── server-auto.js          # Servidor Express con todos los servicios
```

### Frontend

```
src/
├── credits-system.js           # Gestión de créditos en frontend
├── wallet-credits-integration.js  # Integración wallet ↔ créditos
├── deposit-ui.js              # UI para mostrar dirección de depósito
└── claim-ui.js                # UI para reclamar premios
```

### Base de Datos (Supabase)

```
supabase/migrations/
└── 001_credits_system.sql     # Migración SQL para tablas de créditos
```

## 🔧 Configuración

### Variables de Entorno (Backend)

```env
# Supabase
SUPABASE_URL=https://bscmgcnynbxalcuwdqlm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

# Blockchain
BASE_RPC_URL=https://mainnet.base.org
PLATFORM_WALLET_ADDRESS=0x75376BC58830f27415402875D26B73A6BE8E2253
MTR_TOKEN_ADDRESS=0x99cd1eb32846c9027ed9cb8710066fa08791c33b
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

# Admin Wallet (para enviar USDC en claims)
ADMIN_WALLET_PRIVATE_KEY=0x...
ADMIN_WALLET_ADDRESS=0x...

# Rate inicial
MTR_TO_CREDIT_RATE=778

# Aerodrome Pool (opcional, para precio)
AERODROME_POOL_ADDRESS=0x...
ZEROX_API_KEY=... (opcional, para fallback de precio)
```

### Variables de Entorno (Frontend)

En `index.html` o `CONFIG`:

```javascript
window.CONFIG = {
    BACKEND_API: 'https://musictoken-backend.onrender.com',
    PLATFORM_WALLET_ADDRESS: '0x75376BC58830f27415402875D26B73A6BE8E2253',
    MTR_TOKEN_ADDRESS: '0x99cd1eb32846c9027ed9cb8710066fa08791c33b'
};
```

## 🚀 Instalación

### 1. Instalar Dependencias Backend

```bash
cd backend
npm install express cors viem @supabase/supabase-js
```

### 2. Ejecutar Migración SQL

Ejecutar `supabase/migrations/001_credits_system.sql` en Supabase Dashboard → SQL Editor.

### 3. Iniciar Servidor Backend

```bash
node backend/server-auto.js
```

O con PM2:

```bash
pm2 start backend/server-auto.js --name mtr-automation
```

### 4. Cargar Scripts en Frontend

Los scripts ya están incluidos en `index.html`:

```html
<script src="./src/credits-system.js"></script>
<script src="./src/wallet-credits-integration.js"></script>
<script src="./src/deposit-ui.js"></script>
<script src="./src/claim-ui.js"></script>
```

## 📊 Flujo de Funcionamiento

### Depósitos Automáticos

1. Usuario envía MTR o USDC a `PLATFORM_WALLET_ADDRESS`
2. `deposit-listener.js` detecta el evento `Transfer` en blockchain
3. Calcula créditos según rate actual (ej: 778 MTR = 1 crédito)
4. Acredita créditos en Supabase (`user_credits` table)
5. Usuario ve créditos actualizados en UI automáticamente

### Apuestas

1. Usuario selecciona canción y monto (mínimo 100 créditos)
2. Sistema valida créditos disponibles
3. Deduce créditos al iniciar match
4. Al ganar, acredita créditos ganados automáticamente

### Reclamación de Premios

1. Usuario ingresa cantidad de créditos a reclamar (mínimo 100)
2. Backend calcula equivalente USDC usando precio actual MTR/USDC
3. Backend envía USDC desde `ADMIN_WALLET` a wallet del usuario
4. Deduce créditos del balance del usuario
5. Muestra confirmación con hash de transacción

### Actualización de Precios

1. `price-updater.js` consulta precio MTR/USDC cada minuto
2. Actualiza `platform_settings.mtr_usdc_price`
3. Si precio cambia >5%, ajusta `mtr_to_credit_rate` automáticamente
4. Nuevos depósitos usan nuevo rate

## 🔐 Seguridad

- ✅ Private keys solo en variables de entorno (nunca en código)
- ✅ Validación de direcciones de wallet
- ✅ Prevención de double-spending con transacciones atómicas en Supabase
- ✅ Rate limiting en endpoints API (implementar según necesidad)
- ✅ Validación de montos mínimos (100 créditos)

## 📝 API Endpoints

### GET `/api/user/credits/:walletAddress`
Obtiene balance de créditos y equivalente USDC.

**Response:**
```json
{
  "credits": 1500.5,
  "usdcValue": 1.93,
  "mtrPrice": 0.001,
  "rate": 778,
  "userId": "uuid"
}
```

### POST `/api/user/deduct-credits`
Deduce créditos (para apuestas).

**Body:**
```json
{
  "userId": "uuid",
  "credits": 100
}
```

### POST `/api/claim`
Reclama créditos convirtiéndolos a USDC.

**Body:**
```json
{
  "userId": "uuid",
  "credits": 500,
  "walletAddress": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "txHash": "0x...",
  "usdcAmount": 0.64,
  "creditsUsed": 500
}
```

### GET `/api/price`
Obtiene precio actual MTR/USDC y rate.

### GET `/api/deposits/:walletAddress`
Historial de depósitos del usuario.

### GET `/api/claims/:walletAddress`
Historial de reclamaciones del usuario.

## 🧪 Testing

### Probar Depósito

1. Conectar wallet en frontend
2. Copiar dirección de plataforma desde UI
3. Enviar MTR desde MetaMask a esa dirección
4. Esperar ~1 minuto (o menos si listener está activo)
5. Verificar créditos acreditados en UI

### Probar Apuesta

1. Asegurar tener >100 créditos
2. Seleccionar modo de juego
3. Seleccionar canción y monto
4. Verificar deducción de créditos
5. Al ganar, verificar créditos ganados acreditados

### Probar Reclamación

1. Tener créditos ganados
2. Ir a sección "Reclamar Premios"
3. Ingresar cantidad (mínimo 100)
4. Click en "Reclamar USDC"
5. Verificar transacción en BaseScan
6. Verificar USDC recibido en wallet

## 🐛 Troubleshooting

### Depósitos no se detectan

- Verificar que `deposit-listener.js` está corriendo
- Verificar logs del servidor
- Verificar que `PLATFORM_WALLET_ADDRESS` es correcta
- Verificar conexión RPC a Base

### Precios no se actualizan

- Verificar que `price-updater.js` está corriendo
- Verificar logs del servidor
- Verificar que `AERODROME_POOL_ADDRESS` es correcta (o usar fallback)

### Claims fallan

- Verificar que `ADMIN_WALLET` tiene suficiente USDC
- Verificar que `ADMIN_WALLET_PRIVATE_KEY` es correcta
- Verificar logs del servidor para errores específicos

### Créditos no aparecen en UI

- Verificar que `CreditsSystem` está inicializado
- Verificar consola del navegador para errores
- Verificar que wallet está conectada
- Verificar que backend está accesible

## 📈 Próximos Pasos

- [ ] Implementar rate limiting en endpoints
- [ ] Agregar notificaciones push para depósitos/claims
- [ ] Dashboard admin para monitorear depósitos/claims
- [ ] Historial completo de transacciones en UI
- [ ] Soporte para múltiples tokens (además de MTR/USDC)

## 📞 Soporte

Para problemas o preguntas, revisar logs del servidor y consola del navegador.
