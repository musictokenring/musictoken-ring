# ⚡ RESUMEN RÁPIDO: Ejecutar Migraciones

## 🎯 PASOS RÁPIDOS (5 minutos)

### 1️⃣ Ir a Supabase
👉 https://supabase.com/dashboard  
👉 Selecciona tu proyecto  
👉 Click en **"SQL Editor"** (menú lateral)

---

### 2️⃣ Primera Migración: vault_transactions

**Copia y pega esto en el SQL Editor:**

```sql
CREATE TABLE IF NOT EXISTS vault_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_type VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    wallet_address VARCHAR(42) NOT NULL,
    amount_usdc DECIMAL(18, 6) NOT NULL,
    tx_hash VARCHAR(66),
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    CONSTRAINT valid_transaction_type CHECK (transaction_type IN ('withdrawal', 'deposit', 'fee')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'completed', 'failed')),
    CONSTRAINT valid_wallet_format CHECK (wallet_address ~ '^0x[a-fA-F0-9]{40}$')
);

CREATE INDEX IF NOT EXISTS idx_vault_transactions_user_id ON vault_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_wallet_address ON vault_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_status ON vault_transactions(status);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_created_at ON vault_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_tx_hash ON vault_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_security ON vault_transactions(transaction_type, status, created_at DESC);
```

👉 Click **"Run"** (o `Ctrl + Enter`)

---

### 3️⃣ Segunda Migración: security_alerts

**Borra el código anterior y pega esto:**

```sql
CREATE TABLE IF NOT EXISTS security_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    details JSONB,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(255),
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_security_alerts_type ON security_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_security_alerts_severity ON security_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_security_alerts_resolved ON security_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON security_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_user_id ON security_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_security_alerts_critical_unresolved ON security_alerts(severity, resolved) WHERE severity IN ('high', 'critical') AND resolved = FALSE;
```

👉 Click **"Run"** (o `Ctrl + Enter`)

---

### 4️⃣ Verificar

**Ejecuta esto para confirmar:**

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('vault_transactions', 'security_alerts');
```

**✅ Deberías ver 2 filas:** `vault_transactions` y `security_alerts`

---

## ✅ ¡LISTO!

Las migraciones están completas. El sistema de seguridad está activo.

**¿Problemas?** Lee `GUIA-EJECUTAR-MIGRACIONES-SEGURIDAD.md` para ayuda detallada.
