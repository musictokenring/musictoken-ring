# 🚀 EJECUTAR MIGRACIÓN SQL - PASO A PASO

## ⚠️ IMPORTANTE: Esta migración es necesaria para que funcione el sistema de vinculación wallet-usuario en móviles

---

## 📋 PASOS PARA EJECUTAR LA MIGRACIÓN

### 1. Abre Supabase Dashboard

1. Ve a [https://app.supabase.com](https://app.supabase.com)
2. Inicia sesión con tu cuenta
3. Selecciona tu proyecto **MusicTokenRing**

---

### 2. Abre el SQL Editor

1. En el menú lateral izquierdo, haz clic en **"SQL Editor"**
2. Haz clic en **"New query"** (Nueva consulta)

---

### 3. Copia y Pega la Migración SQL

Copia **TODO** el contenido del archivo:
```
backend/migrations/010_create_user_wallets_table.sql
```

**O copia directamente este SQL:**

```sql
-- ============================================================================
-- Migration 010: Create user_wallets table
-- Purpose: Allow users to link multiple wallets to their account
-- This enables wallet-based authentication in internal wallet browsers (MOBILE ONLY)
-- ============================================================================

-- Create user_wallets table
CREATE TABLE IF NOT EXISTS user_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(42) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    linked_at TIMESTAMP DEFAULT NOW(),
    linked_via VARCHAR(50), -- 'google', 'email', 'manual', 'auto'
    ip_address VARCHAR(45),
    user_agent TEXT,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_wallet_format CHECK (wallet_address ~ '^0x[a-fA-F0-9]{40}$'),
    CONSTRAINT valid_linked_via CHECK (linked_via IN ('google', 'email', 'manual', 'auto')),
    CONSTRAINT unique_wallet_address UNIQUE (wallet_address)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_wallet_address ON user_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_wallets_is_primary ON user_wallets(is_primary) WHERE is_primary = TRUE;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER trigger_update_user_wallets_updated_at
    BEFORE UPDATE ON user_wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_user_wallets_updated_at();

-- Create function to update last_used_at when wallet is used
CREATE OR REPLACE FUNCTION update_wallet_last_used()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE user_wallets
    SET last_used_at = NOW()
    WHERE wallet_address = LOWER(NEW.wallet_address);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on user_credits to update last_used_at
-- This will track when a wallet is used for operations
CREATE TRIGGER trigger_update_wallet_last_used_on_credits
    AFTER INSERT OR UPDATE ON user_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_wallet_last_used();

-- Add comment to table
COMMENT ON TABLE user_wallets IS 'Stores wallet addresses linked to user accounts. Enables wallet-based authentication in internal wallet browsers (MOBILE ONLY).';
COMMENT ON COLUMN user_wallets.is_primary IS 'Indicates if this is the primary wallet for the user';
COMMENT ON COLUMN user_wallets.linked_via IS 'Method used to link the wallet: google, email, manual, or auto';
COMMENT ON COLUMN user_wallets.last_used_at IS 'Last time this wallet was used for an operation';
```

---

### 4. Ejecuta la Consulta

1. Pega el SQL completo en el editor
2. Haz clic en **"Run"** (Ejecutar) o presiona `Ctrl+Enter` (Windows) / `Cmd+Enter` (Mac)
3. **Espera** a que termine la ejecución

---

### 5. Verifica que se Ejecutó Correctamente

Deberías ver un mensaje como:
```
Success. No rows returned
```

**O si hay resultados:**
```
Success. X rows returned
```

**Si hay ERROR:**
- Copia el mensaje de error completo
- Revísalo conmigo para solucionarlo

---

### 6. Verifica que la Tabla se Creó

Ejecuta esta consulta para verificar:

```sql
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'user_wallets'
ORDER BY ordinal_position;
```

**Deberías ver:**
- `id` (uuid)
- `user_id` (uuid)
- `wallet_address` (varchar)
- `is_primary` (boolean)
- `linked_at` (timestamp)
- `linked_via` (varchar)
- `ip_address` (varchar)
- `user_agent` (text)
- `last_used_at` (timestamp)
- `created_at` (timestamp)
- `updated_at` (timestamp)

---

## ✅ DESPUÉS DE EJECUTAR LA MIGRACIÓN

1. **Espera el deploy automático en Render** (si está configurado)
2. **O reinicia el servidor manualmente** en Render
3. **Prueba en móvil:**
   - Abre la plataforma en Chrome móvil
   - Loguea con Google
   - Conecta wallet
   - Verifica que se auto-vincula
   - Abre desde navegador interno de wallet
   - Verifica que funciona sin sesión Google

---

## 🎯 RESUMEN

**Lo que hace esta migración:**
- ✅ Crea tabla `user_wallets` para vincular wallets con usuarios
- ✅ Crea índices para mejor rendimiento
- ✅ Crea triggers para actualizar timestamps automáticamente
- ✅ Habilita wallet-based authentication en móviles

**Lo que NO afecta:**
- ✅ PC sigue funcionando exactamente como antes
- ✅ No cambia comportamiento existente
- ✅ Solo mejora experiencia en móviles

---

## 🆘 SI HAY PROBLEMAS

Si encuentras algún error al ejecutar la migración:

1. **Copia el mensaje de error completo**
2. **Dime qué paso falló**
3. **Te ayudo a solucionarlo**

---

**¿Listo para ejecutar la migración? ¡Avísame cuando la hayas ejecutado!** 🚀
