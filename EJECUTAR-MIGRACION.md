# 🔧 GUÍA PARA EJECUTAR LA MIGRACIÓN SQL

## Paso 1: Ejecutar la Migración en Supabase

La migración agrega la columna `network` a la tabla `deposits` para rastrear de qué red proviene cada depósito.

### Opción A: Usando Supabase Dashboard (Recomendado)

1. **Abre tu proyecto en Supabase:**
   - Ve a https://supabase.com/dashboard
   - Selecciona tu proyecto

2. **Abre el SQL Editor:**
   - En el menú lateral, haz clic en "SQL Editor"
   - O ve directamente a: `https://supabase.com/dashboard/project/[TU_PROJECT_ID]/sql`

3. **Copia y pega el siguiente SQL:**

```sql
-- Add network column to deposits table to track which network the deposit came from
-- This allows us to process deposits from multiple networks (Base, Ethereum, Polygon, etc.)

DO $$ 
BEGIN
    -- Add network column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'deposits' 
        AND column_name = 'network'
    ) THEN
        ALTER TABLE deposits 
        ADD COLUMN network TEXT DEFAULT 'base';
        
        -- Add comment
        COMMENT ON COLUMN deposits.network IS 'Network where the deposit was made (base, ethereum, polygon, optimism, arbitrum)';
        
        -- Create index for faster queries by network
        CREATE INDEX IF NOT EXISTS idx_deposits_network ON deposits(network);
        
        RAISE NOTICE 'Column network added to deposits table';
    ELSE
        RAISE NOTICE 'Column network already exists in deposits table';
    END IF;
END $$;
```

4. **Ejecuta el SQL:**
   - Haz clic en el botón "Run" o presiona `Ctrl+Enter` (Windows) / `Cmd+Enter` (Mac)
   - Deberías ver un mensaje de éxito

5. **Verifica que se aplicó:**
   - Ve a "Table Editor" → "deposits"
   - Deberías ver una nueva columna "network" con valor por defecto "base"

### Opción B: Usando Supabase CLI (Si lo tienes instalado)

```bash
supabase db push
```

O ejecuta directamente:

```bash
psql [TU_CONNECTION_STRING] -f supabase/migrations/006_add_network_column_deposits.sql
```

---

## Paso 2: Verificar Variables de Entorno

Asegúrate de que estas variables estén configuradas en tu servidor (Render, etc.):

```env
# Supabase (ya configurado)
SUPABASE_URL=https://bscmgcnynbxalcuwdqlm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=[TU_CLAVE_AQUI]

# Base (ya configurado)
BASE_RPC_URL=https://mainnet.base.org
PLATFORM_WALLET_ADDRESS=0x75376BC58830f27415402875D26B73A6BE8E2253
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

# Ethereum (nuevo - opcional pero recomendado)
ETHEREUM_RPC_URL=https://eth.llamarpc.com

# Polygon (nuevo - opcional)
POLYGON_RPC_URL=https://polygon-rpc.com

# Optimism (nuevo - opcional)
OPTIMISM_RPC_URL=https://mainnet.optimism.io

# Arbitrum (nuevo - opcional)
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
```

**Nota:** Los RPCs públicos pueden tener límites de rate. Para producción, considera usar servicios como:
- Alchemy (https://www.alchemy.com/)
- Infura (https://www.infura.io/)
- QuickNode (https://www.quicknode.com/)

---

## Paso 3: Verificar que el Sistema Funciona

Después de ejecutar la migración y reiniciar el servidor, deberías ver en los logs:

```
[multi-chain] ==========================================
[multi-chain] 🚀 Initializing multi-chain deposit listener...
[multi-chain] ==========================================
[multi-chain] 🌐 Starting listener for base...
[multi-chain] ✅ base connected - Current block: [número]
[multi-chain] ✅ 1 network(s) initialized successfully
[multi-chain] ✅ Multi-chain listener initialization complete
```

---

## ✅ Checklist de Verificación

- [ ] Migración SQL ejecutada en Supabase
- [ ] Columna `network` visible en la tabla `deposits`
- [ ] Variables de entorno configuradas en el servidor
- [ ] Servidor reiniciado después de los cambios
- [ ] Logs muestran inicialización exitosa del multi-chain listener
- [ ] Depósitos de todas las redes se detectan automáticamente

---

## 🆘 Si Algo Sale Mal

1. **Error al ejecutar SQL:**
   - Verifica que tengas permisos de administrador en Supabase
   - Asegúrate de estar en el proyecto correcto

2. **El sistema no detecta depósitos:**
   - Verifica los logs del servidor para ver qué redes están activas
   - Revisa que los RPCs estén funcionando
   - Verifica que la wallet de plataforma sea la correcta

3. **Error de conexión RPC:**
   - Algunos RPCs públicos pueden estar saturados
   - Considera usar un servicio de RPC premium para producción
