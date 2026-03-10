# 🔒 GUÍA PASO A PASO: Ejecutar Migraciones de Seguridad en Supabase

## 📋 RESUMEN

Necesitamos ejecutar **2 migraciones SQL** en Supabase para activar el sistema de auditoría y alertas de seguridad.

**Tiempo estimado:** 5-10 minutos  
**Dificultad:** Fácil (solo copiar y pegar)

---

## 🎯 PASO 1: Acceder a Supabase Dashboard

1. Ve a: https://supabase.com/dashboard
2. Inicia sesión con tu cuenta
3. Selecciona tu proyecto: `bscmgcnynbxalcuwdqlm` (o el nombre de tu proyecto)

---

## 🎯 PASO 2: Abrir SQL Editor

1. En el menú lateral izquierdo, busca **"SQL Editor"**
2. Haz clic en **"SQL Editor"**
3. Verás una pantalla con un editor de código SQL

---

## 🎯 PASO 3: Ejecutar Primera Migración (vault_transactions)

### 3.1. Copiar el código SQL

Copia TODO el siguiente código:

```sql
-- Migration: Create vault_transactions table for audit logging
-- This table logs all vault transactions (withdrawals, deposits, fees)
-- to enable security auditing and prevent fraud

CREATE TABLE IF NOT EXISTS vault_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_type VARCHAR(50) NOT NULL, -- 'withdrawal', 'deposit', 'fee'
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    wallet_address VARCHAR(42) NOT NULL, -- Recipient/sender wallet address
    amount_usdc DECIMAL(18, 6) NOT NULL, -- Amount in USDC (6 decimals)
    tx_hash VARCHAR(66), -- Blockchain transaction hash
    reason TEXT, -- Reason for transaction (e.g., 'claim_payout', 'deposit_fee')
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT,
    ip_address VARCHAR(45), -- IP address of requester
    user_agent TEXT, -- User agent of requester
    
    -- Indexes for fast queries
    CONSTRAINT valid_transaction_type CHECK (transaction_type IN ('withdrawal', 'deposit', 'fee')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'completed', 'failed')),
    CONSTRAINT valid_wallet_format CHECK (wallet_address ~ '^0x[a-fA-F0-9]{40}$')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vault_transactions_user_id ON vault_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_wallet_address ON vault_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_status ON vault_transactions(status);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_created_at ON vault_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_tx_hash ON vault_transactions(tx_hash);

-- Index for security queries (find suspicious transactions)
CREATE INDEX IF NOT EXISTS idx_vault_transactions_security ON vault_transactions(transaction_type, status, created_at DESC);

COMMENT ON TABLE vault_transactions IS 'Audit log of all vault transactions for security and compliance';
COMMENT ON COLUMN vault_transactions.transaction_type IS 'Type of transaction: withdrawal, deposit, or fee';
COMMENT ON COLUMN vault_transactions.wallet_address IS 'Wallet address involved in transaction (lowercase)';
COMMENT ON COLUMN vault_transactions.ip_address IS 'IP address of the request (for security tracking)';
COMMENT ON COLUMN vault_transactions.user_agent IS 'User agent of the request (for security tracking)';
```

### 3.2. Pegar en SQL Editor

1. Pega el código en el editor SQL
2. Verifica que se haya pegado completo (debe tener ~40 líneas)

### 3.3. Ejecutar

1. Haz clic en el botón **"Run"** (o presiona `Ctrl + Enter`)
2. Espera a que termine la ejecución (debe decir "Success" o mostrar "0 rows returned")

### 3.4. Verificar

Deberías ver un mensaje como:
- ✅ "Success. No rows returned"
- ✅ O un mensaje indicando que la tabla se creó

**Si ves un error:**
- Copia el mensaje de error completo
- Compártelo conmigo para ayudarte a resolverlo

---

## 🎯 PASO 4: Ejecutar Segunda Migración (security_alerts)

### 4.1. Limpiar el Editor

1. Selecciona todo el código anterior (`Ctrl + A`)
2. Bórralo (`Delete` o `Backspace`)
3. O crea una nueva query haciendo clic en **"New query"**

### 4.2. Copiar el código SQL

Copia TODO el siguiente código:

```sql
-- Migration: Create security_alerts table for security incident logging
-- This table logs security events (wallet mismatches, suspicious activity, etc.)

CREATE TABLE IF NOT EXISTS security_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type VARCHAR(100) NOT NULL, -- Type of alert (e.g., 'WALLET_MISMATCH', 'RATE_LIMIT_EXCEEDED')
    severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    details JSONB, -- JSON object with alert details
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(255), -- Admin who resolved it
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_security_alerts_type ON security_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_security_alerts_severity ON security_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_security_alerts_resolved ON security_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON security_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_user_id ON security_alerts(user_id);

-- Index for finding unresolved critical alerts
CREATE INDEX IF NOT EXISTS idx_security_alerts_critical_unresolved ON security_alerts(severity, resolved) WHERE severity IN ('high', 'critical') AND resolved = FALSE;

COMMENT ON TABLE security_alerts IS 'Security alerts and incidents log for monitoring and response';
COMMENT ON COLUMN security_alerts.alert_type IS 'Type of security alert (e.g., WALLET_MISMATCH)';
COMMENT ON COLUMN security_alerts.details IS 'JSON object containing alert-specific details';
COMMENT ON COLUMN security_alerts.severity IS 'Severity level: low, medium, high, critical';
```

### 4.3. Ejecutar

1. Haz clic en **"Run"** (o `Ctrl + Enter`)
2. Espera a que termine la ejecución

### 4.4. Verificar

Deberías ver un mensaje de éxito similar al anterior.

---

## 🎯 PASO 5: Verificar que las Tablas se Crearon

### 5.1. Verificar tabla vault_transactions

Ejecuta esta query en el SQL Editor:

```sql
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vault_transactions'
ORDER BY ordinal_position;
```

**Deberías ver:** Una lista de columnas incluyendo:
- `id`
- `transaction_type`
- `user_id`
- `wallet_address`
- `amount_usdc`
- `tx_hash`
- `status`
- `created_at`
- etc.

### 5.2. Verificar tabla security_alerts

Ejecuta esta query:

```sql
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'security_alerts'
ORDER BY ordinal_position;
```

**Deberías ver:** Una lista de columnas incluyendo:
- `id`
- `alert_type`
- `severity`
- `details`
- `user_id`
- `resolved`
- `created_at`
- etc.

---

## ✅ VERIFICACIÓN FINAL

Ejecuta esta query para confirmar que ambas tablas existen:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('vault_transactions', 'security_alerts');
```

**Resultado esperado:** Deberías ver 2 filas:
- `vault_transactions`
- `security_alerts`

---

## 🚨 SOLUCIÓN DE PROBLEMAS

### Error: "relation already exists"

**Solución:** Esto significa que la tabla ya existe. Es seguro, puedes continuar. El `CREATE TABLE IF NOT EXISTS` evita errores.

### Error: "permission denied"

**Solución:** Asegúrate de estar usando el SQL Editor con permisos de administrador. Si usas un usuario limitado, contacta al administrador del proyecto.

### Error: "uuid_generate_v4() does not exist"

**Solución:** Ejecuta primero esta query:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

Luego vuelve a ejecutar las migraciones.

### Error: "column does not exist" o "table does not exist"

**Solución:** Verifica que:
1. Estás en el proyecto correcto de Supabase
2. Estás ejecutando las queries en el orden correcto
3. No hay errores de sintaxis (comas faltantes, etc.)

---

## 📝 PRÓXIMOS PASOS DESPUÉS DE LAS MIGRACIONES

Una vez que las migraciones estén ejecutadas:

1. ✅ **Deploy en Render:** El código ya está en GitHub, Render hará deploy automático
2. ✅ **Verificar logs:** Después del deploy, revisa los logs del servidor para confirmar que no hay errores
3. ✅ **Probar endpoint:** Intenta hacer un claim para verificar que funciona correctamente
4. ✅ **Monitorear alertas:** Revisa la tabla `security_alerts` periódicamente

---

## 🎉 ¡LISTO!

Una vez completados estos pasos, tu sistema de seguridad estará completamente activo y protegerá tu plataforma contra robos de fondos.

**¿Necesitas ayuda?** Comparte cualquier error que veas y te ayudo a resolverlo.
