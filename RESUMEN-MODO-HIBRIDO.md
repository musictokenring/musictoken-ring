# Resumen del Modo Híbrido - Music Token Ring

## ✅ Confirmación de Funcionamiento

### 1. **Wallet sin Login (Wallet-Only Mode)**

**✅ SÍ FUNCIONA** - El sistema permite identificar usuarios **únicamente por su wallet**, sin necesidad de login con email/Google.

**Cómo funciona:**
- Cuando un usuario conecta su wallet por primera vez, el sistema:
  1. Verifica si existe un usuario con esa wallet en `users` table
  2. Si no existe, **crea automáticamente un usuario** (líneas 290-352 en `server-auto.js`)
  3. Crea registro en `user_credits` con 0 créditos iniciales
  4. Vincula la wallet en `user_wallets` table automáticamente (líneas 332-352)
  5. La wallet queda como identificador único del usuario

**Control absoluto:**
- ✅ Puedes acreditar créditos directamente a la wallet (depósitos on-chain, webhooks)
- ✅ El usuario puede jugar y apostar usando solo su wallet
- ✅ Los depósitos se procesan automáticamente y se acreditan créditos
- ✅ Los premios se otorgan correctamente
- ✅ Todo funciona sin necesidad de email/Google

**Archivos clave:**
- `backend/server-auto.js` - Endpoint `/api/user/credits/:walletAddress` (crea usuario automáticamente)
- `backend/deposit-listener.js` - Crea usuarios automáticamente al detectar depósitos
- `backend/multi-chain-deposit-listener.js` - Similar para múltiples cadenas

---

### 2. **Wallet + Login Posterior (Fusión de Identidades)**

**✅ SÍ FUNCIONA** - Si un usuario tiene wallet conectada y luego hace login con email/Google, **la wallet se vincula al usuario logueado sin duplicar identidad ni cuenta**.

**Cómo funciona:**
1. **Usuario opera con wallet-only primero:**
   - Se crea usuario automático con `wallet_address` en `users` table
   - Operaciones (depósitos, apuestas, premios) se registran bajo ese `user_id`

2. **Usuario hace login con email/Google después:**
   - Se crea/obtiene usuario autenticado con `email` en Supabase Auth
   - Al conectar wallet después del login, se ejecuta `sync-wallet-on-login.js`:
     - Detecta si existe usuario wallet-only con esa wallet
     - **Fusiona automáticamente:**
       - Transfiere créditos del usuario wallet-only al usuario autenticado
       - Transfiere depósitos (`deposits` table)
       - Transfiere reclamaciones (`claims` table)
       - Vincula wallet en `user_wallets` table
       - **Elimina el usuario wallet-only** (evita duplicados)
     - Si la wallet ya está vinculada al mismo usuario, solo confirma el link

**Prevención de duplicados:**
- `wallet-link-service.js` verifica si la wallet ya está vinculada a otro usuario (líneas 35-49)
- Si está vinculada a otro usuario, **rechaza el link** y retorna error
- Si ya está vinculada al mismo usuario, retorna éxito sin duplicar

**Archivos clave:**
- `backend/sync-wallet-on-login.js` - Fusiona usuarios wallet-only con usuarios autenticados
- `backend/wallet-link-service.js` - Previene duplicados al vincular wallets
- `backend/server-auto.js` - Endpoint `/api/user/link-wallet` ejecuta la sincronización

---

### 3. **Login sin Wallet (Email/Google Only)**

**✅ SÍ FUNCIONA** - Usuarios que primero hacen login (sin wallet) pueden comprar créditos y jugar con **control absoluto** sin necesidad de wallet conectada.

**Cómo funciona:**
- Usuario hace login con email/Google:
  1. Se crea usuario en Supabase Auth con `email`
  2. Se crea registro en `users` table con `saldo_fiat` (inicialmente 0)
  3. Usuario puede:
     - Depositar vía NOWPayments/MoonPay/Mercado Pago (webhooks acreditan a `saldo_fiat`)
     - Apostar usando `saldo_fiat` (no requiere wallet)
     - Recibir premios en `saldo_fiat` (automático)
     - Retirar vía fiat (Nequi/Daviplata) sin necesidad de wallet

**Control absoluto:**
- ✅ Créditos se almacenan en `saldo_fiat` (base de datos)
- ✅ Apuestas deducen de `saldo_fiat`
- ✅ Premios se acreditan a `saldo_fiat`
- ✅ Retiros fiat funcionan sin wallet
- ✅ Todo funciona completamente sin wallet conectada

**Balance unificado:**
- El sistema calcula balance total = `saldo_fiat + saldo_onchain + credits` (de `user_credits`)
- Función `get_user_unified_balance()` en Supabase consolida todo

**Archivos clave:**
- `src/credits-system.js` - `loadFiatBalance()` carga saldo fiat
- `backend/nowpayments-service.js` - Webhook acredita a `saldo_fiat` usando `userId` o `email`
- `backend/moonpay-service.js` - Similar para MoonPay
- `EJECUTAR-MIGRACION-SIMPLE.sql` - Crea columnas `saldo_fiat`, `saldo_onchain`

---

## 🔒 Seguridad y Validaciones

### Prevención de Depósitos sin Autenticación
- ✅ Frontend bloquea acceso a widgets de pago si no hay sesión/wallet
- ✅ Backend webhooks **rechazan pagos** si no encuentran usuario válido
- ✅ No se crean depósitos "pending_user_link" - se rechazan directamente

### Prevención de Duplicados
- ✅ `user_wallets` table tiene constraint `UNIQUE(wallet_address)`
- ✅ `wallet-link-service.js` verifica duplicados antes de vincular
- ✅ `sync-wallet-on-login.js` fusiona usuarios en lugar de crear duplicados

---

## 📊 Flujos Completos

### Flujo 1: Wallet → Operaciones → Login → Fusión
```
1. Usuario conecta wallet (sin login)
   → Sistema crea usuario automático (wallet-only)
   → userId: abc-123 (wallet-only)

2. Usuario deposita 100 USDC
   → Se acreditan 95 créditos (5% fee)
   → Créditos en user_credits para userId: abc-123

3. Usuario apuesta y gana
   → Premios acreditados a userId: abc-123

4. Usuario hace login con Google
   → Se crea usuario autenticado
   → userId: xyz-789 (autenticado)

5. Usuario conecta wallet después del login
   → sync-wallet-on-login detecta usuario wallet-only (abc-123)
   → Fusiona créditos: abc-123 → xyz-789
   → Fusiona depósitos: abc-123 → xyz-789
   → Elimina usuario wallet-only (abc-123)
   → Vincula wallet a usuario autenticado (xyz-789)
   → RESULTADO: Un solo usuario (xyz-789) con toda la historia
```

### Flujo 2: Login → Depósitos → Operaciones → Wallet (Opcional)
```
1. Usuario hace login con email/Google
   → Usuario autenticado creado
   → userId: xyz-789

2. Usuario deposita 100 USDC vía NOWPayments
   → Webhook recibe pago con email del usuario
   → Encuentra usuario por email
   → Acredita 95 créditos a saldo_fiat de userId: xyz-789

3. Usuario apuesta y gana
   → Deduce de saldo_fiat
   → Acredita premios a saldo_fiat

4. Usuario conecta wallet (opcional)
   → Vincula wallet a userId: xyz-789
   → Ahora puede retirar on-chain si quiere
   → Balance sigue siendo unificado (fiat + onchain)
```

### Flujo 3: Wallet → Operaciones (Sin Login)
```
1. Usuario conecta wallet (sin login)
   → Sistema crea usuario automático
   → userId: abc-123

2. Usuario deposita, apuesta, gana
   → Todo funciona normalmente
   → Todo registrado bajo userId: abc-123

3. Usuario nunca hace login
   → Continúa operando solo con wallet
   → Sistema mantiene identidad por wallet
   → Todo funciona perfectamente
```

---

## ✅ Respuestas a tus Preguntas

### 1. ¿Podemos identificar usuarios por wallet sin login?
**✅ SÍ** - El sistema crea usuarios automáticamente cuando detecta una wallet nueva. La wallet es el identificador único.

### 2. ¿Tenemos control absoluto para acreditar créditos y permitir jugar?
**✅ SÍ** - Los depósitos on-chain se procesan automáticamente, los webhooks acreditan créditos, y el usuario puede jugar inmediatamente.

### 3. ¿Si usuario tiene wallet y luego hace login, se vincula sin duplicar?
**✅ SÍ** - El sistema fusiona automáticamente el usuario wallet-only con el usuario autenticado, transfiriendo toda la historia (créditos, depósitos, premios) y eliminando el usuario duplicado.

### 4. ¿Usuarios sin wallet pueden comprar créditos y jugar?
**✅ SÍ** - Los usuarios pueden hacer login con email/Google, depositar vía fiat (NOWPayments/MoonPay/Mercado Pago), y jugar usando `saldo_fiat` sin necesidad de wallet.

### 5. ¿Tenemos control absoluto de créditos/premios sin wallet?
**✅ SÍ** - Todo se maneja en base de datos (`saldo_fiat`), las apuestas deducen de ahí, los premios se acreditan ahí, y los retiros fiat funcionan sin wallet.

---

## 🎯 Conclusión

**El modo híbrido está completamente implementado y funcional:**

- ✅ **Wallet-only**: Funciona perfectamente, usuarios identificados solo por wallet
- ✅ **Wallet + Login**: Se fusionan automáticamente sin duplicados
- ✅ **Login sin wallet**: Funciona completamente con saldo fiat
- ✅ **Control absoluto**: En todos los escenarios, tienes control total de créditos y operaciones
- ✅ **Sin duplicados**: El sistema previene y fusiona identidades automáticamente

**El sistema es robusto y maneja todos los casos de uso híbridos correctamente.**
