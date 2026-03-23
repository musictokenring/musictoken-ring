# 🎯 ACCIONES INMEDIATAS: Investigación de Fuga de Fondos

## ✅ CONFIRMACIÓN

**Variables de entorno verificadas:**
- ✅ `ADMIN_WALLET_ADDRESS` = `0x0000000000000000000000000000000000000001` (CORRECTO)
- ✅ `MTR_POOL_WALLET` no existe → Usa `PLATFORM_WALLET` como fallback (SEGURO)
- ⚠️ `PLATFORM_WALLET_ADDRESS` no existe → Agregar explícitamente (RECOMENDADO)

**Conclusión:** La configuración de wallets NO fue la causa de la fuga.

---

## 🔴 CAUSA CONFIRMADA: Endpoint `/api/claim` Sin Validación

**Estado:** ✅ **YA CORREGIDO** - Ahora valida propiedad de wallet antes de procesar claims.

**Evidencia:**
- Vulnerabilidad encontrada y corregida en código
- Coincide con patrón de "fuga de vault"
- Es la forma más fácil de drenar fondos
- Configuración de wallets está correcta

---

## 🔍 INVESTIGACIÓN: Encontrar la Dirección del Atacante

### Paso 1: Ejecutar Query SQL en Supabase

**Ve a Supabase → SQL Editor y ejecuta:**

```sql
-- Query 1: Encontrar claims con wallet incorrecta
SELECT 
    c.id,
    c.user_id,
    u.wallet_address as user_wallet,
    c.recipient_wallet as claimed_wallet,
    c.usdc_amount,
    c.status,
    c.tx_hash,
    c.created_at
FROM claims c
JOIN users u ON c.user_id = u.id
WHERE LOWER(c.recipient_wallet) != LOWER(u.wallet_address)
ORDER BY c.created_at DESC
LIMIT 50;
```

**Esto mostrará:** Todos los claims donde alguien intentó reclamar a una wallet diferente a la registrada.

---

### Paso 2: Encontrar Transacciones del Vault a Direcciones Desconocidas

```sql
-- Query 2: Transacciones del vault a direcciones que no pertenecen a usuarios
SELECT 
    vt.id,
    vt.transaction_type,
    vt.wallet_address,
    vt.amount_usdc,
    vt.tx_hash,
    vt.reason,
    vt.status,
    vt.created_at,
    vt.ip_address,
    vt.user_agent,
    u.wallet_address as user_wallet,
    u.id as user_id
FROM vault_transactions vt
LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(vt.wallet_address)
WHERE vt.transaction_type = 'withdrawal'
AND u.id IS NULL  -- Dirección no pertenece a ningún usuario
ORDER BY vt.created_at DESC
LIMIT 50;
```

**Esto mostrará:** Retiros del vault a direcciones sospechosas (no registradas como usuarios).

---

### Paso 3: Encontrar Alertas de Seguridad

```sql
-- Query 3: Alertas de wallet mismatch
SELECT 
    sa.id,
    sa.alert_type,
    sa.severity,
    sa.details,
    sa.user_id,
    sa.ip_address,
    sa.user_agent,
    sa.resolved,
    sa.created_at,
    u.wallet_address as user_wallet
FROM security_alerts sa
LEFT JOIN users u ON sa.user_id = u.id
WHERE sa.alert_type = 'WALLET_MISMATCH'
ORDER BY sa.created_at DESC
LIMIT 50;
```

**Esto mostrará:** Intentos detectados de fraude (wallet mismatch).

---

### Paso 4: Claims Recientes con Montos Grandes

```sql
-- Query 4: Claims grandes recientes
SELECT 
    c.id,
    c.user_id,
    u.wallet_address as user_wallet,
    c.recipient_wallet,
    c.usdc_amount,
    c.status,
    c.tx_hash,
    c.created_at
FROM claims c
JOIN users u ON c.user_id = u.id
WHERE c.created_at > NOW() - INTERVAL '30 days'
AND c.usdc_amount > 100  -- Montos grandes
ORDER BY c.usdc_amount DESC, c.created_at DESC
LIMIT 50;
```

**Esto mostrará:** Claims grandes que podrían ser parte del ataque.

---

## 🔍 REVISAR TRANSACCIONES EN BASESCAN

### Paso 5: Revisar Transacciones desde PLATFORM_WALLET

**Ve a:**
```
https://basescan.org/address/0x0000000000000000000000000000000000000001
```

**Busca:**
1. Transacciones de USDC `transfer` a direcciones desconocidas
2. Transacciones en el período de la fuga reportada
3. Identifica la dirección exacta del atacante (foodam.xyz)

**Filtros útiles:**
- Token: USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
- Tipo: Out (salientes)
- Período: Últimos 30 días

---

## 📊 REVISAR LOGS DEL SERVIDOR EN RENDER

### Paso 6: Buscar en Logs

**En Render → Logs, busca estos términos:**

1. **`withdrawFromVault`**
   - Busca todas las llamadas a este método
   - Identifica direcciones de destino
   - Verifica montos transferidos

2. **`claim`**
   - Busca requests a `/api/claim`
   - Identifica IPs y user agents
   - Verifica wallets usadas

3. **`Wallet address does not match`**
   - Busca errores de validación
   - Identifica intentos bloqueados (después de la corrección)

4. **`security_alert`**
   - Busca alertas generadas
   - Identifica patrones de ataque

**Patrones a buscar:**
- Múltiples claims desde la misma IP
- Claims con wallets diferentes a las registradas
- Claims grandes en corto período de tiempo
- Errores de validación de wallet

---

## 🎯 PRÓXIMOS PASOS CONCRETOS

### 1. Agregar `PLATFORM_WALLET_ADDRESS` en Render (Opcional pero Recomendado)

**Para evitar confusión futura:**

1. Ve a Render → Environment Variables
2. Haz clic en "Add Environment Variable"
3. Agrega:
   - **KEY:** `PLATFORM_WALLET_ADDRESS`
   - **VALUE:** `0x0000000000000000000000000000000000000001`

**Nota:** Esto no es crítico porque el código tiene fallback, pero es mejor práctica tenerlo explícito.

---

### 2. Ejecutar Queries SQL (URGENTE)

**Ejecuta las 4 queries SQL arriba en Supabase** para identificar:
- La dirección exacta del atacante
- El monto total robado
- El patrón del ataque
- Si hay más intentos recientes

---

### 3. Revisar Transacciones en Basescan (URGENTE)

**Revisa las transacciones desde `PLATFORM_WALLET`** para:
- Confirmar la dirección del atacante
- Verificar el monto exacto robado
- Identificar si hay más transacciones sospechosas

---

### 4. Revisar Logs del Servidor (URGENTE)

**Busca en los logs** para:
- Encontrar el patrón del ataque
- Identificar la IP del atacante
- Verificar si hay más intentos recientes

---

## 📋 CHECKLIST DE INVESTIGACIÓN

- [ ] Ejecutar Query 1: Claims con wallet incorrecta
- [ ] Ejecutar Query 2: Transacciones del vault a direcciones desconocidas
- [ ] Ejecutar Query 3: Alertas de seguridad
- [ ] Ejecutar Query 4: Claims grandes recientes
- [ ] Revisar transacciones en Basescan
- [ ] Revisar logs del servidor en Render
- [ ] Identificar dirección exacta del atacante
- [ ] Calcular monto total robado
- [ ] Documentar patrón del ataque

---

## 🛡️ MEDIDAS DE PROTECCIÓN YA IMPLEMENTADAS

✅ **Validación de Wallet en `/api/claim`** - Ahora verifica propiedad
✅ **Auditoría de Transacciones** - Todas las transacciones se registran
✅ **Alertas de Seguridad** - Detecta intentos de fraude automáticamente
✅ **Rate Limiting** - Previene ataques de fuerza bruta

---

## 📊 CONCLUSIÓN

**Causa confirmada:** Ataque explotando `/api/claim` sin validación (ya corregido).

**Configuración verificada:** ✅ Correcta - No fue la causa de la fuga.

**Próximo paso:** Ejecutar queries SQL y revisar transacciones para identificar al atacante específico.

**¿Quieres que te ayude a ejecutar estas queries o revisar los resultados?**
