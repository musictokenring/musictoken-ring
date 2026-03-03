# Instrucciones de Configuración del Vault de Liquidez

## Resumen de Implementación

Se ha implementado completamente el sistema de créditos estables con vault de liquidez. Todos los cambios están en el código y listos para deployment.

## Cambios Implementados ✅

### 1. Sistema de Créditos Estables
- ✅ 1 crédito = 1 USDC fijo siempre
- ✅ Depósitos: MTR/USDC → créditos usando precio USDC al momento del depósito
- ✅ Fee de depósito: 5% → vault
- ✅ Fee de apuesta: 2% del pozo → vault
- ✅ Fee de retiro: 5% → vault
- ✅ Retiros: créditos → USDC directo 1:1 (menos fee)

### 2. Vault de Liquidez
- ✅ Servicio completo (`backend/vault-service.js`)
- ✅ Tracking de balance en base de datos
- ✅ Acumulación automática de fees
- ✅ Verificación de balance antes de pagar retiros
- ✅ Endpoints API para consultar balance y estadísticas
- ✅ Display público del balance del vault

### 3. Base de Datos
- ✅ Migración SQL creada (`supabase/migrations/002_stable_credits_system.sql`)
- ✅ Tablas: `vault_fees`, `vault_balance`
- ✅ Funciones SQL: `update_vault_balance()`, `get_vault_balance()`
- ✅ Nuevos campos en `deposits` y `claims`

## Configuración Requerida

### Variables de Entorno del Backend

Agregar al archivo `.env` del backend (o variables de entorno en Render/Vercel):

```bash
# Vault Configuration (opcional - si no se configura, usa admin wallet)
VAULT_WALLET_ADDRESS=0x...  # Dirección del wallet del vault (opcional)
VAULT_WALLET_PRIVATE_KEY=0x...  # Private key del vault wallet (opcional)

# Si no se configuran, el sistema usa ADMIN_WALLET_ADDRESS como vault
ADMIN_WALLET_ADDRESS=0x...  # Requerido (wallet que paga retiros)
ADMIN_WALLET_PRIVATE_KEY=0x...  # Requerido

# Backend API URL (para deposit-listener)
BACKEND_API_URL=https://musictoken-backend.onrender.com
```

### Opciones de Configuración del Vault

**Opción A: Wallet Separado (Recomendado para Producción)**
- Crear un wallet separado solo para el vault
- Configurar `VAULT_WALLET_ADDRESS` y `VAULT_WALLET_PRIVATE_KEY`
- Transferir USDC inicial al vault wallet
- Los fees se transferirán automáticamente al vault wallet

**Opción B: Usar Admin Wallet (Más Simple)**
- No configurar `VAULT_WALLET_ADDRESS`
- El sistema usará `ADMIN_WALLET_ADDRESS` como vault
- Los fees se acumulan en el balance del admin wallet
- Funciona igual pero menos separación de fondos

## Pasos de Deployment

### 1. Ejecutar Migración SQL

Ejecutar en Supabase SQL Editor:

```sql
-- Ejecutar el contenido de supabase/migrations/002_stable_credits_system.sql
```

O ejecutar directamente:

```bash
# Si tienes Supabase CLI
supabase db push
```

### 2. Configurar Variables de Entorno

En tu plataforma de deployment (Render/Vercel):

1. Agregar `VAULT_WALLET_ADDRESS` (opcional)
2. Agregar `VAULT_WALLET_PRIVATE_KEY` (opcional)
3. Verificar que `ADMIN_WALLET_ADDRESS` y `ADMIN_WALLET_PRIVATE_KEY` estén configurados

### 3. Inicializar Balance del Vault

Si es la primera vez, inicializar el vault con USDC inicial:

```sql
-- En Supabase SQL Editor
INSERT INTO vault_balance (balance_usdc, last_updated, updated_by)
VALUES (0, NOW(), 'manual')
ON CONFLICT DO NOTHING;
```

O transferir USDC inicial al vault wallet manualmente.

### 4. Verificar Deployment

1. Verificar que el backend esté corriendo: `GET /api/health`
2. Verificar balance del vault: `GET /api/vault/balance`
3. Verificar que el frontend muestre el balance del vault

## Endpoints del Vault

### `GET /api/vault/balance`
Obtiene el balance actual del vault y estadísticas.

**Response:**
```json
{
  "balance": 1000.50,
  "stats": {
    "balance": 1000.50,
    "totalFees": {
      "deposit": 50.25,
      "bet": 20.10,
      "withdrawal": 5.00
    },
    "pendingFees": 0,
    "lastUpdated": "2026-03-03T..."
  },
  "vaultAddress": "0x...",
  "baseScanUrl": "https://basescan.org/address/0x..."
}
```

### `POST /api/vault/add-fee`
Registra un fee en el vault.

**Body:**
```json
{
  "feeType": "deposit" | "bet" | "withdrawal",
  "amount": 10.50,
  "matchId": "uuid-optional",
  "source": "optional-description"
}
```

### `GET /api/vault/stats`
Obtiene estadísticas detalladas del vault.

## Flujo Completo

### Depósito
1. Usuario envía MTR/USDC → plataforma wallet
2. `deposit-listener` detecta transferencia
3. Calcula valor en USDC al momento del depósito
4. Calcula fee (5% del valor USDC)
5. Otorga créditos: (valor USDC - fee)
6. Registra fee en vault → `vault_fees` table
7. Actualiza `vault_balance` en DB
8. Si vault wallet configurado → transfiere fee al vault wallet

### Apuesta
1. Usuario apuesta X créditos
2. Se descuentan créditos del usuario
3. Al finalizar batalla:
   - Se calcula fee (2% del pozo total)
   - Ganador recibe: (pozo total - fee) créditos
   - Fee se registra en vault

### Retiro
1. Usuario solicita retirar X créditos
2. Sistema verifica balance del vault
3. Si hay suficiente balance:
   - Calcula fee (5% de créditos)
   - Usuario recibe: (créditos - fee) USDC
   - Fee se registra en vault
   - Se actualiza balance del vault
4. Si no hay suficiente balance:
   - Error: "Vault en recarga, espera X min"

## Testing

### Test 1: Depósito MTR
1. Enviar 1000 MTR a plataforma wallet
2. Verificar que se otorguen créditos correctos (valor USDC - 5%)
3. Verificar que fee se registre en vault

### Test 2: Depósito USDC
1. Enviar 100 USDC a plataforma wallet
2. Verificar que se otorguen 95 créditos (100 - 5% fee)
3. Verificar que fee se registre en vault

### Test 3: Apuesta con Fee
1. Dos usuarios apuestan 100 créditos cada uno
2. Pozo total: 200 créditos
3. Fee (2%): 4 créditos → vault
4. Ganador recibe: 196 créditos

### Test 4: Retiro
1. Usuario tiene 100 créditos
2. Solicita retirar 100 créditos
3. Fee (5%): 5 créditos → vault
4. Usuario recibe: 95 USDC
5. Verificar que balance del vault aumente en 5 USDC

## Monitoreo

### Dashboard Público
- Balance del vault visible en `/api/vault/balance`
- Link a BaseScan para verificar on-chain
- Actualización automática cada 60 segundos

### Logs del Backend
- `[vault-service]` - Logs del servicio del vault
- `[deposit-listener]` - Logs de fees de depósito
- `[claim-service]` - Logs de fees de retiro
- `[game-engine]` - Logs de fees de apuestas

## Seguridad

1. **Vault Wallet Separado**: Usar wallet separado para el vault (recomendado)
2. **Verificación de Balance**: Siempre verificar balance antes de pagar
3. **Tracking Completo**: Todos los fees se registran en `vault_fees`
4. **Transparencia**: Balance público visible en dashboard

## Próximos Pasos Opcionales

1. **Contrato Inteligente del Vault**: Crear contrato en Solidity para mayor seguridad
2. **Multi-sig Wallet**: Usar wallet multi-firma para el vault
3. **Alertas**: Configurar alertas cuando balance del vault esté bajo
4. **Auto-recharge**: Sistema automático para recargar vault cuando balance esté bajo

## Notas Importantes

- El sistema funciona con admin wallet si no se configura vault wallet
- Los fees se acumulan automáticamente en la base de datos
- El balance del vault se sincroniza con on-chain cuando está disponible
- Si el vault no tiene suficiente balance, los retiros fallarán con mensaje claro
