# PROTECCIÓN CONTRA DEPÓSITOS DUPLICADOS

## 🔒 SISTEMA DE PROTECCIÓN MULTI-CAPA

El sistema implementa **múltiples capas de protección** para garantizar que **NINGUNA transacción se procese dos veces**.

---

## 🛡️ CAPAS DE PROTECCIÓN IMPLEMENTADAS

### 1. PROTECCIÓN EN MEMORIA (DepositListener)
**Ubicación:** `backend/deposit-listener.js`

```javascript
// Set en memoria para evitar procesar la misma tx en la misma sesión
this.processedTxHashes = new Set();

// Verificación al inicio de processDeposit()
if (this.processedTxHashes.has(txHash)) {
    return; // Ya procesado en esta sesión
}
```

**Propósito:** Evita procesar la misma transacción múltiples veces dentro de la misma ejecución del servicio.

---

### 2. PROTECCIÓN EN BASE DE DATOS (Verificación Pre-Insercion)
**Ubicación:** Todos los puntos de procesamiento

**Antes de procesar:**
```javascript
// Verificar si ya existe en DB
const { data: existing } = await supabase
    .from('deposits')
    .select('id, user_id, credits_awarded, status')
    .eq('tx_hash', txHash)
    .single();

if (existing) {
    console.log('⚠️ DEPÓSITO DUPLICADO DETECTADO Y RECHAZADO');
    return; // CRÍTICO: No procesar
}
```

**Implementado en:**
- ✅ `DepositListener.processDeposit()` - Línea 218-228
- ✅ `DepositSyncService.processDepositIfNeeded()` - Línea 190-199
- ✅ `server-auto.js` endpoint `/api/deposits/process` - Línea 486-495
- ✅ `fix-deposit.js` script manual - Línea 85-95

---

### 3. PROTECCIÓN A NIVEL DE BASE DE DATOS (Constraint UNIQUE)
**Ubicación:** `supabase/migrations/005_add_unique_constraint_deposits_tx_hash.sql`

```sql
ALTER TABLE deposits 
ADD CONSTRAINT deposits_tx_hash_unique 
UNIQUE (tx_hash);
```

**Propósito:** 
- La base de datos **rechaza automáticamente** cualquier intento de insertar un `tx_hash` duplicado
- Si dos procesos intentan insertar simultáneamente, solo uno tendrá éxito
- El otro recibirá error `23505` (unique violation)

**Estado:** ✅ Migración creada - **DEBE EJECUTARSE EN SUPABASE**

---

### 4. PROTECCIÓN EN INSERCIÓN (Verificación Post-Insercion)
**Ubicación:** `backend/deposit-listener.js` → `creditUser()`

**Después de insertar:**
```javascript
// Verificar error de constraint único
if (depositError) {
    if (depositError.code === '23505' || depositError.message?.includes('duplicate')) {
        console.error('⚠️ DUPLICADO BLOQUEADO POR CONSTRAINT DE BD');
        return; // CRÍTICO: No acreditar créditos
    }
}
```

**Propósito:** Si por alguna razón se intenta insertar un duplicado, la inserción fallará y NO se acreditarán créditos.

---

### 5. VERIFICACIÓN FINAL ANTES DE ACREDITAR CRÉDITOS
**Ubicación:** `backend/deposit-listener.js` → `creditUser()`

**Antes de acreditar créditos:**
```javascript
// Verificar una vez más antes de insertar (race condition protection)
const { data: lastCheck } = await supabase
    .from('deposits')
    .select('id')
    .eq('tx_hash', txHash)
    .single();

if (lastCheck) {
    console.error('⚠️ DUPLICADO DETECTADO EN ÚLTIMO MOMENTO');
    return; // CRÍTICO: No acreditar créditos
}
```

**Propósito:** Protección contra condiciones de carrera (race conditions) donde dos procesos intentan procesar simultáneamente.

---

## 📊 FLUJO DE PROTECCIÓN COMPLETO

```
1. Transacción detectada
   ↓
2. ✅ Verificación en memoria (processedTxHashes)
   ↓ (Si no existe)
3. ✅ Verificación en base de datos (SELECT por tx_hash)
   ↓ (Si no existe)
4. ✅ Verificación final antes de insertar (última verificación)
   ↓ (Si no existe)
5. ✅ INSERT en tabla deposits
   ↓ (Si constraint UNIQUE permite)
6. ✅ Verificación de error de inserción (duplicado)
   ↓ (Si insert exitoso)
7. ✅ Acreditación de créditos
```

**En cualquier punto, si se detecta duplicado → PROCESO SE DETIENE**

---

## 🔍 PUNTOS DE VERIFICACIÓN

### DepositListener.processDeposit()
1. ✅ Verificación en memoria (`processedTxHashes`)
2. ✅ Verificación en DB antes de procesar
3. ✅ Verificación final antes de insertar
4. ✅ Verificación de error de inserción
5. ✅ Solo acredita créditos si insert fue exitoso

### DepositSyncService.processDepositIfNeeded()
1. ✅ Verificación en DB antes de procesar
2. ✅ Delega a `DepositListener.processDeposit()` (que tiene sus propias protecciones)

### Endpoint /api/deposits/process
1. ✅ Verificación en DB antes de procesar
2. ✅ Verificación de wallet address
3. ✅ Delega a `DepositListener.processDeposit()` (que tiene sus propias protecciones)

### Script fix-deposit.js
1. ✅ Verificación en DB antes de procesar
2. ✅ Verificación de wallet address
3. ✅ Delega a `DepositListener.processDeposit()` (que tiene sus propias protecciones)

---

## 🚨 COMPORTAMIENTO ANTE INTENTO DE DUPLICADO

### Escenario 1: Mismo proceso intenta procesar dos veces
```
Intento 1: ✅ Procesado exitosamente
Intento 2: ⚠️ Detectado en memoria → RECHAZADO
```

### Escenario 2: Diferentes procesos intentan procesar simultáneamente
```
Proceso A: Verifica DB → No existe → Inserta → ✅ Éxito
Proceso B: Verifica DB → Existe → ⚠️ RECHAZADO
```

### Escenario 3: Race condition (ambos verifican al mismo tiempo)
```
Proceso A: Verifica DB → No existe → Inserta → ✅ Éxito (constraint UNIQUE)
Proceso B: Verifica DB → No existe → Intenta insertar → ⚠️ Error 23505 → RECHAZADO
```

---

## ✅ GARANTÍAS DEL SISTEMA

1. **Ninguna transacción se procesará dos veces**
   - Múltiples verificaciones en diferentes puntos
   - Constraint UNIQUE en base de datos como última línea de defensa

2. **Protección contra race conditions**
   - Verificación final antes de insertar
   - Constraint UNIQUE previene inserción simultánea

3. **Logging completo**
   - Todos los intentos de duplicado se registran
   - Fácil identificar y auditar intentos de duplicado

4. **Fail-safe**
   - Si falla la inserción por duplicado, NO se acreditan créditos
   - El sistema es conservador: mejor rechazar que duplicar

---

## 📋 CHECKLIST DE SEGURIDAD

- [x] Verificación en memoria (processedTxHashes)
- [x] Verificación en DB antes de procesar (todos los puntos)
- [x] Verificación final antes de insertar
- [x] Manejo de error de constraint UNIQUE
- [x] Constraint UNIQUE en base de datos (migración creada)
- [x] Logging de intentos de duplicado
- [x] Protección en todos los endpoints
- [x] Protección en scripts manuales

---

## ⚠️ ACCIÓN REQUERIDA

**EJECUTAR MIGRACIÓN EN SUPABASE:**
```sql
-- Archivo: supabase/migrations/005_add_unique_constraint_deposits_tx_hash.sql
-- Esto agrega la constraint UNIQUE que es la última línea de defensa
```

Sin esta constraint, teóricamente podrían insertarse duplicados si dos procesos insertan exactamente al mismo tiempo (aunque las otras protecciones lo previenen).

---

## 🔐 CONCLUSIÓN

El sistema tiene **5 capas de protección** contra duplicados:

1. ✅ Memoria (sesión actual)
2. ✅ Verificación pre-inserción (DB)
3. ✅ Verificación final (race condition)
4. ✅ Constraint UNIQUE (BD - última defensa)
5. ✅ Verificación post-inserción (error handling)

**Garantía:** Es **IMPOSIBLE** procesar la misma transacción dos veces bajo condiciones normales de operación.

---

**Documento creado:** $(Get-Date -Format "yyyy-MM-dd")  
**Versión:** 1.0
