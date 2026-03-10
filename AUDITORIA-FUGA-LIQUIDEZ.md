# 🔴 AUDITORÍA CRÍTICA: Fuga de Liquidez del Vault

## 📋 RESUMEN EJECUTIVO

**Fecha de Auditoría:** $(date)  
**Problema Reportado:** Transacción automática desde wallet de tesorería a dirección desconocida (www.foodam.xyz)  
**Impacto:** Pérdida de liquidez del vault y créditos USDC de usuarios  
**Severidad:** 🔴 CRÍTICA

---

## 🔍 HALLAZGOS DE LA AUDITORÍA

### 1. **Validación Insuficiente en Endpoint `/api/claim`**

**Ubicación:** `backend/server-auto.js` líneas 253-276

**Problema:**
```javascript
app.post('/api/claim', async (req, res) => {
    const { userId, credits, walletAddress } = req.body;
    
    if (!userId || !credits || !walletAddress) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // ⚠️ NO HAY VALIDACIÓN DE FORMATO DE walletAddress
    const result = await claimService.processClaim(userId, credits, walletAddress);
```

**Riesgo:** Un atacante podría enviar cualquier dirección como `walletAddress` y recibir fondos del vault.

**Validación Actual en `claim-service.js`:**
```javascript
if (!/^0x[a-fA-F0-9]{40}$/.test(recipientWallet)) {
    throw new Error('Invalid wallet address');
}
```

✅ Esta validación es correcta, pero **NO verifica que la dirección pertenezca al usuario**.

---

### 2. **Falta de Verificación de Propiedad de Wallet**

**Ubicación:** `backend/claim-service.js` línea 76

**Problema:** El sistema NO verifica que el `walletAddress` proporcionado pertenezca al `userId` que hace la solicitud.

**Código Actual:**
```javascript
async processClaim(userId, credits, recipientWallet) {
    // Valida formato pero NO propiedad
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipientWallet)) {
        throw new Error('Invalid wallet address');
    }
    
    // NO verifica que recipientWallet pertenezca a userId
    // Continúa directamente a procesar el claim
}
```

**Riesgo:** Un usuario podría reclamar créditos a cualquier dirección, incluyendo direcciones controladas por atacantes.

---

### 3. **Variables de Entorno No Validadas**

**Ubicación:** Múltiples archivos

**Problema:** Las variables de entorno críticas (`ADMIN_WALLET_PRIVATE_KEY`, `SWAP_WALLET_PRIVATE_KEY`, `VAULT_WALLET_ADDRESS`) se usan sin validar que sean correctas.

**Ejemplo en `mtr-swap-service.js`:**
```javascript
const SWAP_WALLET_PRIVATE_KEY = process.env.SWAP_WALLET_PRIVATE_KEY || process.env.ADMIN_WALLET_PRIVATE_KEY;
const MTR_POOL_WALLET = process.env.MTR_POOL_WALLET || PLATFORM_WALLET;
```

**Riesgo:** Si una variable de entorno está mal configurada, podría usar una wallet incorrecta.

---

### 4. **Falta de Logging de Transacciones Críticas**

**Ubicación:** `backend/vault-service.js` línea 310

**Problema:** Las transferencias desde el vault no registran suficiente información para auditoría.

**Código Actual:**
```javascript
async withdrawFromVault(amount, recipientAddress, reason = 'claim_payout') {
    // ... código de transferencia ...
    console.log(`[vault-service] Withdrawing ${amount} USDC from vault to ${recipientAddress}`);
    // ⚠️ No registra userId, no registra en base de datos para auditoría
}
```

**Riesgo:** Imposible rastrear quién hizo qué transacción y cuándo.

---

### 5. **Falta de Rate Limiting en Endpoints Críticos**

**Ubicación:** `backend/server-auto.js` endpoint `/api/claim`

**Problema:** No hay límite de frecuencia de requests al endpoint `/api/claim`.

**Riesgo:** Un atacante podría hacer múltiples requests rápidamente para drenar el vault.

---

## 🛡️ RECOMENDACIONES CRÍTICAS (PRIORIDAD ALTA)

### 1. **VALIDAR PROPIEDAD DE WALLET EN `/api/claim`** ⚠️ CRÍTICO

**Acción Inmediata:**

Modificar `backend/server-auto.js`:

```javascript
app.post('/api/claim', async (req, res) => {
    try {
        const { userId, credits, walletAddress } = req.body;

        if (!userId || !credits || !walletAddress) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // ✅ NUEVO: Validar formato de wallet
        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            return res.status(400).json({ error: 'Invalid wallet address format' });
        }

        // ✅ NUEVO: Verificar que la wallet pertenece al usuario
        const { data: user } = await supabase
            .from('users')
            .select('wallet_address')
            .eq('id', userId)
            .single();

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // ✅ NUEVO: Verificar que la wallet del claim coincide con la wallet del usuario
        if (user.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
            console.error(`[SECURITY] Claim attempt with mismatched wallet. User ${userId} tried to claim to ${walletAddress}, but their wallet is ${user.wallet_address}`);
            return res.status(403).json({ 
                error: 'Wallet address does not match user account',
                security_alert: true 
            });
        }

        const MIN_CLAIM_AMOUNT = 5;
        if (credits < MIN_CLAIM_AMOUNT) {
            return res.status(400).json({ error: `Minimum claim: ${MIN_CLAIM_AMOUNT} credits` });
        }

        const result = await claimService.processClaim(userId, credits, walletAddress);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('[server] Error processing claim:', error);
        res.status(500).json({ error: error.message });
    }
});
```

---

### 2. **AGREGAR LOGGING DE AUDITORÍA** ⚠️ CRÍTICO

**Crear tabla de auditoría:**

```sql
CREATE TABLE IF NOT EXISTS vault_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_type VARCHAR(50) NOT NULL, -- 'withdrawal', 'deposit', 'fee'
    user_id UUID REFERENCES users(id),
    wallet_address VARCHAR(42) NOT NULL,
    amount_usdc DECIMAL(18, 6) NOT NULL,
    tx_hash VARCHAR(66),
    reason TEXT,
    status VARCHAR(20) NOT NULL, -- 'pending', 'completed', 'failed'
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT
);
```

**Modificar `vault-service.js`:**

```javascript
async withdrawFromVault(amount, recipientAddress, reason = 'claim_payout', userId = null, requestInfo = {}) {
    // ... código existente ...
    
    // ✅ NUEVO: Registrar en auditoría ANTES de transferir
    const { error: auditError } = await supabase
        .from('vault_transactions')
        .insert([{
            transaction_type: 'withdrawal',
            user_id: userId,
            wallet_address: recipientAddress.toLowerCase(),
            amount_usdc: amount,
            reason: reason,
            status: 'pending',
            ip_address: requestInfo.ip,
            user_agent: requestInfo.userAgent
        }]);
    
    if (auditError) {
        console.error('[vault-service] Error logging transaction:', auditError);
        throw new Error('Failed to log transaction for audit');
    }
    
    // ... continuar con transferencia ...
    
    // ✅ NUEVO: Actualizar registro de auditoría después de transferir
    await supabase
        .from('vault_transactions')
        .update({
            status: 'completed',
            tx_hash: txHash,
            completed_at: new Date().toISOString()
        })
        .eq('wallet_address', recipientAddress.toLowerCase())
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);
}
```

---

### 3. **AGREGAR RATE LIMITING** ⚠️ CRÍTICO

**Instalar dependencia:**
```bash
npm install express-rate-limit
```

**Agregar a `server-auto.js`:**
```javascript
const rateLimit = require('express-rate-limit');

const claimRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máximo 5 requests por ventana
    message: 'Too many claim requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

app.post('/api/claim', claimRateLimiter, async (req, res) => {
    // ... código existente ...
});
```

---

### 4. **VALIDAR VARIABLES DE ENTORNO AL INICIAR** ⚠️ CRÍTICO

**Crear función de validación:**

```javascript
function validateEnvironmentVariables() {
    const required = [
        'ADMIN_WALLET_PRIVATE_KEY',
        'PLATFORM_WALLET_ADDRESS',
        'SUPABASE_SERVICE_ROLE_KEY'
    ];
    
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    // Validar formato de direcciones
    const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS;
    if (!/^0x[a-fA-F0-9]{40}$/.test(PLATFORM_WALLET)) {
        throw new Error(`Invalid PLATFORM_WALLET_ADDRESS format: ${PLATFORM_WALLET}`);
    }
    
    // Validar que las wallets no sean la misma (si están configuradas)
    if (process.env.VAULT_WALLET_ADDRESS && 
        process.env.VAULT_WALLET_ADDRESS.toLowerCase() === PLATFORM_WALLET.toLowerCase()) {
        console.warn('[SECURITY] ⚠️ VAULT_WALLET_ADDRESS es igual a PLATFORM_WALLET_ADDRESS');
    }
    
    console.log('[server] ✅ Environment variables validated');
}

// Llamar al inicio del servidor
validateEnvironmentVariables();
```

---

### 5. **AGREGAR ALERTAS DE SEGURIDAD** ⚠️ CRÍTICO

**Crear sistema de alertas:**

```javascript
async function sendSecurityAlert(alertType, details) {
    console.error(`[SECURITY ALERT] ${alertType}:`, details);
    
    // Registrar en base de datos
    await supabase
        .from('security_alerts')
        .insert([{
            alert_type: alertType,
            details: JSON.stringify(details),
            severity: 'high',
            created_at: new Date().toISOString()
        }]);
    
    // TODO: Enviar email/notificación al administrador
}
```

**Usar en validaciones críticas:**

```javascript
if (user.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
    await sendSecurityAlert('WALLET_MISMATCH', {
        userId,
        claimedWallet: walletAddress,
        userWallet: user.wallet_address,
        timestamp: new Date().toISOString()
    });
    
    return res.status(403).json({ error: 'Wallet address mismatch' });
}
```

---

## 📊 CHECKLIST DE IMPLEMENTACIÓN

- [ ] **CRÍTICO:** Validar propiedad de wallet en `/api/claim`
- [ ] **CRÍTICO:** Crear tabla de auditoría `vault_transactions`
- [ ] **CRÍTICO:** Agregar logging de todas las transacciones del vault
- [ ] **CRÍTICO:** Implementar rate limiting en endpoints críticos
- [ ] **CRÍTICO:** Validar variables de entorno al iniciar servidor
- [ ] **CRÍTICO:** Crear sistema de alertas de seguridad
- [ ] **ALTO:** Revisar logs históricos para identificar transacciones sospechosas
- [ ] **ALTO:** Verificar configuración actual de variables de entorno en Render
- [ ] **MEDIO:** Implementar 2FA para operaciones críticas del vault
- [ ] **MEDIO:** Agregar whitelist de direcciones permitidas (opcional)

---

## 🔎 INVESTIGACIÓN ADICIONAL REQUERIDA

1. **Revisar logs de transacciones en Basescan:**
   - Buscar todas las transacciones desde `PLATFORM_WALLET` en los últimos 7 días
   - Identificar transacciones a direcciones desconocidas
   - Verificar si hay patrones sospechosos

2. **Revisar logs del servidor:**
   - Buscar requests a `/api/claim` con `walletAddress` sospechoso
   - Verificar si hay múltiples requests desde la misma IP
   - Identificar usuarios que hayan hecho claims recientemente

3. **Verificar configuración en Render:**
   - Revisar todas las variables de entorno
   - Verificar que `ADMIN_WALLET_PRIVATE_KEY` sea correcta
   - Verificar que `PLATFORM_WALLET_ADDRESS` sea correcta
   - Verificar que no haya variables de entorno duplicadas o incorrectas

4. **Revisar base de datos:**
   - Buscar en tabla `claims` transacciones recientes
   - Verificar `recipient_wallet` en claims completados
   - Identificar si algún usuario tiene múltiples wallets asociadas

---

## ⚠️ ACCIONES INMEDIATAS

1. **DESHABILITAR endpoint `/api/claim` temporalmente** hasta implementar validaciones
2. **Revisar configuración de variables de entorno en Render**
3. **Revisar logs de transacciones en Basescan**
4. **Implementar validación de propiedad de wallet (prioridad #1)**
5. **Crear tabla de auditoría y comenzar a registrar todas las transacciones**

---

## 📝 NOTAS ADICIONALES

- No se encontró ninguna referencia a "foodam" en el código fuente
- No se encontraron direcciones hardcodeadas sospechosas
- El problema más probable es una **falta de validación de propiedad de wallet** en el endpoint `/api/claim`
- Es posible que un atacante haya explotado esta vulnerabilidad para drenar el vault

---

**Próximos Pasos:**
1. Implementar validación de propiedad de wallet (URGENTE)
2. Revisar logs históricos para identificar el ataque
3. Implementar sistema de auditoría completo
4. Agregar rate limiting y otras medidas de seguridad
