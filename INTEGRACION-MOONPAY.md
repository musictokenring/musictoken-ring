# 🌙 INTEGRACIÓN MOONPAY - On-Ramp Fiat → USDC

**Fecha:** 2026-03-11  
**Estado:** ✅ Implementado

---

## 📋 RESUMEN

MoonPay On-Ramp ha sido integrado para permitir depósitos fiat → USDC directamente en Base. Los usuarios pueden comprar USDC con tarjeta, PSE, Nequi y otros métodos de pago fiat.

---

## 🎨 DISEÑO

### Botón Minimalista
- **Estilo:** Similar a PayPal pero con colores cyan/azul de la página
- **Texto:** "Comprar con Fiat"
- **Icono:** 💳
- **Colores:** Gradiente cyan/indigo (`from-cyan-500/20 to-indigo-500/20`)
- **Bordes:** Redondeados (`rounded-full`)
- **Efectos:** Hover con sombras cyan

### Widget Overlay
- **Variant:** `overlay` (modal flotante)
- **Theme:** `dark` (tema oscuro)
- **Tamaño:** Responsive y centrado

---

## 🔧 CONFIGURACIÓN

### Variables de Entorno (Render)

```bash
# MoonPay API
MOONPAY_API_KEY=pk_test_ABC123DEF456GHI789JKL0MNOPQRSTUV  # ⚠️ Reemplazar con la real
MOONPAY_SECRET_KEY=<SECRET_KEY>  # Para verificar webhooks (opcional en sandbox)

# Wallet Configuration
VAULT_WALLET_ADDRESS=0x0000000000000000000000000000000000000001
TRADING_FUND_WALLET=<WALLET_ADDRESS>  # Opcional
```

### Configuración en MoonPay Dashboard

1. **API Keys:**
   - Obtener `pk_test_...` para sandbox
   - Obtener `pk_live_...` para producción
   - Agregar a `MOONPAY_API_KEY` en Render

2. **Webhook URL:**
   - URL: `https://musictoken-ring.onrender.com/webhook/moonpay`
   - Configurar en MoonPay Dashboard > Webhooks

---

## 💻 CÓDIGO IMPLEMENTADO

### Frontend (index.html)

```javascript
// Botón que abre el widget
<button onclick="initMoonPay()" class="moonpay-btn-minimal">
    💳 Comprar con Fiat
</button>

// Función de inicialización
async function initMoonPay() {
    // Carga SDK dinámicamente
    // Configura widget con parámetros
    // Muestra overlay modal
}
```

### Backend (moonpay-service.js)

- Servicio completo para procesar webhooks
- Verificación de firma HMAC-SHA256
- Procesamiento de depósitos
- Distribución de fees (75% vault / 25% trading fund)

### Webhook Endpoint

```
POST /webhook/moonpay
```

---

## 🔔 WEBHOOK

### Endpoint
```
POST /webhook/moonpay
```

### Seguridad
- ✅ Verificación HMAC-SHA256 con Secret Key (opcional en sandbox)
- ✅ Header requerido: `x-moonpay-signature`
- ✅ Validación de firma antes de procesar

### Flujo de Procesamiento

1. **Recibe notificación** de MoonPay
2. **Verifica firma** HMAC-SHA256 (si está configurada)
3. **Valida estado** (`status === 'completed'`)
4. **Verifica idempotencia** (previene duplicados)
5. **Calcula créditos** (95% del monto USDC)
6. **Distribuye fees**:
   - 75% → Vault
   - 25% → Trading Fund
7. **Acredita créditos** al usuario
8. **Registra depósito** en base de datos
9. **Retorna 200 OK** rápidamente

---

## 📊 DISTRIBUCIÓN DE FEES

### Depósitos MoonPay (5%)
- **75%** → Vault (`VAULT_WALLET_ADDRESS`)
- **25%** → Trading Fund (`TRADING_FUND_WALLET`)

---

## 🗄️ BASE DE DATOS

### Tabla: `deposits`
```sql
- tx_hash (transaction_id de MoonPay)
- wallet_address
- user_id
- amount (USDC recibido)
- credits_awarded (95% del monto)
- fee_amount (5%)
- vault_fee (75% del fee)
- trading_fund_fee (25% del fee)
- status ('processed', 'pending_user_link')
- payment_id (transaction_id)
- payment_data (JSON completo de MoonPay)
```

---

## 🧪 PRUEBAS

### Test en Sandbox

1. **Abrir página de depósitos**
2. **Hacer clic en "Comprar con Fiat"**
3. **Widget MoonPay se abre** (overlay modal)
4. **Completar transacción de prueba** en sandbox
5. **Verificar webhook** recibe notificación
6. **Verificar créditos** acreditados (95%)
7. **Verificar fees** distribuidos correctamente

### Verificar Logs

```
[moonpay-webhook] Received transaction notification: { transaction_id, status, amount }
[moonpay] Processing deposit: { transaction_id, status, amount }
[moonpay] ✅ Deposit processed successfully: { transaction_id, userId, creditsAwarded, fee }
```

---

## ⚙️ PARÁMETROS DEL WIDGET

```javascript
{
    flow: 'partnerTopup',        // Flow para comprar crypto
    environment: 'sandbox',      // 'sandbox' o 'production'
    variant: 'overlay',          // Modal overlay
    params: {
        apiKey: 'pk_test_...',  // API key de MoonPay
        walletAddress: '0x...', // Wallet del usuario (opcional)
        currencyCode: 'usdc_base', // USDC en Base
        baseCurrencyCode: 'usd',   // Fiat base (USD o COP)
        baseCurrencyAmount: '10',  // Monto sugerido
        theme: 'dark'             // Tema oscuro
    }
}
```

---

## 🔄 ACTUALIZAR A PRODUCCIÓN

Cuando llegue la API key real:

1. **Reemplazar en `index.html`:**
   ```javascript
   apiKey: 'pk_live_...' // Tu API key real
   ```

2. **Cambiar environment:**
   ```javascript
   environment: 'production' // Cambiar de 'sandbox'
   ```

3. **Agregar en Render:**
   ```bash
   MOONPAY_API_KEY=pk_live_...
   MOONPAY_SECRET_KEY=...  # Si está disponible
   ```

4. **Configurar webhook en MoonPay Dashboard:**
   - URL: `https://musictoken-ring.onrender.com/webhook/moonpay`
   - Eventos: `transaction.completed`

---

## ✅ CHECKLIST

- [x] Botón minimalista creado
- [x] SDK MoonPay integrado
- [x] Widget configurado (overlay, dark theme)
- [x] Webhook endpoint creado
- [x] Servicio de procesamiento implementado
- [x] Distribución de fees configurada
- [x] Idempotencia implementada
- [ ] API key real configurada (pendiente)
- [ ] Environment cambiado a 'production' (pendiente)
- [ ] Webhook configurado en MoonPay Dashboard (pendiente)

---

**Estado:** ✅ Integración completa, listo para pruebas en sandbox
