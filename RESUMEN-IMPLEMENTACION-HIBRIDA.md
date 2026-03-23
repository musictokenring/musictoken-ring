# Resumen: Implementación de Autenticación Híbrida (Wallet Opcional + Email)

## ✅ Cambios Completados

### 1. Base de Datos (Migración SQL)
- **Archivo**: `supabase/migrations/013_hybrid_auth_fiat_balance.sql`
- **Cambios**:
  - `wallet_address` ahora es nullable (usuarios pueden existir sin wallet)
  - Agregadas columnas: `email`, `saldo_fiat`, `saldo_onchain`, `auth_provider`, `phone_number`, `verification_status`
  - Funciones SQL creadas:
    - `get_user_unified_balance(userId)` - Balance unificado (fiat + onchain)
    - `increment_user_fiat_balance(userId, amount)` - Incrementar saldo fiat
    - `decrement_user_fiat_balance(userId, amount)` - Decrementar saldo fiat
  - RLS policies actualizadas para permitir acceso por email

### 2. Frontend - Onboarding Mejorado
- **Archivo**: `index.html`
- **Cambios**:
  - Login wall actualizado con dos opciones:
    - "Conectar Wallet" (crypto instantáneo)
    - "Entrar con Email/Google" (sin wallet)
  - Detección móvil: muestra recomendación de usar email en móvil
  - Preview de contenido siempre visible (rankings, modos de juego)
  - Event listener agregado para botón de conectar wallet en onboarding

### 3. Sistema de Créditos - Soporte Fiat
- **Archivo**: `src/credits-system.js`
- **Cambios**:
  - `loadBalance()` ahora acepta `userId` como parámetro opcional
  - Nueva función `loadFiatBalance(userId)` para cargar saldo fiat sin wallet
  - Soporte para cargar balance unificado (fiat + onchain)
  - Fallback automático a saldo fiat si no hay wallet conectada

### 4. Backend - Endpoints Nuevos
- **Archivo**: `backend/server-auto.js`
- **Endpoints agregados**:
  - `GET /api/user/balance/:userId` - Balance unificado (fiat + onchain)
  - `POST /api/deposit/mercadopago/create` - Crear checkout Mercado Pago
  - `POST /webhook/mercadopago` - Webhook para procesar pagos Mercado Pago

### 5. Servicio Mercado Pago
- **Archivo**: `backend/mercadopago-service.js` (NUEVO)
- **Funcionalidades**:
  - `createCheckoutPreference()` - Crear preferencia de pago
  - `processDeposit()` - Procesar webhook y acreditar saldo fiat
  - Fee distribution: 5% total (75% vault, 25% trading fund)
  - Idempotency checks para prevenir procesamiento duplicado

### 6. UI de Depósitos
- **Archivo**: `index.html`
- **Cambios**:
  - Nueva sección "Depositar sin Wallet (Fiat)" con Mercado Pago
  - Formulario de depósito con input de monto (COP)
  - Función `initMercadoPagoDeposit()` para crear checkout
  - Sección fiat se muestra/oculta según autenticación (email sin wallet)

## 🔄 Cambios Pendientes

### 1. Actualizar `game-engine.js` para Saldo Fiat
- **Estado**: Parcialmente completo
- **Nota**: El sistema actual ya usa `CreditsSystem.currentCredits` que ahora incluye saldo fiat. Las deducciones se hacen vía Supabase RPC que debería funcionar con ambos tipos de saldo.
- **Acción requerida**: Verificar que `decrement_user_credits` también deduzca de `saldo_fiat` si `saldo_onchain` es insuficiente.

### 2. Endpoint de Retiros Fiat (Nuvei)
- **Estado**: Pendiente
- **Archivo**: `backend/server-auto.js`
- **Endpoint requerido**: `POST /api/user/request_payout_fiat`
- **Funcionalidad**:
  - Validar saldo fiat del usuario
  - Aplicar fee 5% (75% vault, 25% trading fund)
  - Preparar para integración con Nuvei API (`addUPOAPM` + `payout`)
  - Input: teléfono (Nequi/Daviplata), monto
  - Por ahora: log/manual, preparar estructura para Nuvei

### 3. Actualizar `showLoginWall()` para Mostrar/Ocultar Sección Fiat
- **Estado**: Completo
- **Nota**: Ya implementado en `index.html` línea ~2624

### 4. Migración SQL - Ejecutar en Producción
- **Archivo**: `supabase/migrations/013_hybrid_auth_fiat_balance.sql`
- **Acción**: Ejecutar migración en Supabase Dashboard o vía CLI

### 5. Variables de Entorno
- **Backend** (Render):
  - `MERCADOPAGO_ACCESS_TOKEN` - Token de acceso Mercado Pago
  - `MERCADOPAGO_PUBLIC_KEY` - Clave pública Mercado Pago
  - `MERCADOPAGO_WEBHOOK_SECRET` - Secret para verificar webhooks (opcional)
  - `FRONTEND_URL` - URL del frontend (para redirects)
  - `BACKEND_URL` - URL del backend (para webhooks)

## 🧪 Pruebas Recomendadas

### Flujo 1: Usuario Email Sin Wallet
1. Abrir sitio sin wallet conectada
2. Clic en "Entrar con Email/Google"
3. Iniciar sesión con Google/Email
4. Verificar que se muestra sección "Depositar sin Wallet"
5. Hacer depósito con Mercado Pago (monto mínimo: $10,000 COP)
6. Verificar que webhook procesa correctamente
7. Verificar que saldo fiat se actualiza en DB
8. Crear apuesta en modo Rápido/Social
9. Verificar que se deduce del saldo fiat
10. Ganar batalla y verificar que premio se acredita a saldo fiat

### Flujo 2: Usuario Wallet Tradicional
1. Conectar wallet
2. Verificar que funciona como antes
3. Depósito USDC vía NOWPayments
4. Apuestas y retiros funcionan normalmente

### Flujo 3: Usuario Híbrido (Email + Wallet después)
1. Iniciar sesión con email
2. Depositar fiat vía Mercado Pago
3. Conectar wallet después
4. Verificar que saldo unificado muestra fiat + onchain
5. Apuestas pueden usar ambos saldos

## 📝 Notas Importantes

1. **Compatibilidad hacia atrás**: Los usuarios existentes con wallet seguirán funcionando normalmente. El sistema detecta automáticamente si hay wallet o email.

2. **Modo Práctica**: Siempre disponible sin wallet (ya implementado).

3. **Mercado Pago**: Actualmente configurado para COP (pesos colombianos). La conversión a USD es aproximada (1 USD = 4000 COP). **TODO**: Implementar API de cambio de divisas en tiempo real.

4. **Retiros Fiat**: Por ahora solo preparado para Nuvei. La implementación completa requiere:
   - Credenciales Nuvei
   - Configurar `addUPOAPM` para Nequi/Daviplata
   - Implementar `payout` API

5. **Anti-fraude**: Campo `verification_status` agregado pero no implementado aún. Para <$50 USD auto, >$50 requiere verificación.

## 🚀 Próximos Pasos

1. Ejecutar migración SQL en producción
2. Configurar variables de entorno de Mercado Pago
3. Probar flujo completo de depósito fiat
4. Implementar endpoint de retiros fiat (Nuvei)
5. Agregar validación anti-fraude para retiros >$50
6. Implementar API de cambio de divisas para conversión COP→USD precisa
