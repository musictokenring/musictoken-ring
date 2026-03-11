# 🚨 HALLAZGOS SOSPECHOSOS EN BASESCAN

## ⚠️ TRANSACCIONES ENCONTRADAS

### 🔴 HALLAZGO CRÍTICO #1: Transferencia de USDC Saliente

**Fecha:** 7 de marzo de 2026, 4:47:03 AM
**Block:** 43034738
**Hash:** `0x7a6d08b534aad1dd7f2c7efe2d9b1034ad2ef98c81babe20a52768d545f44305`
**Método:** Aggregate
**Monto:** 5.286988 USDC ($5.29)
**Dirección de Destino:** `0x2dcdea8a708f1fdeca5e2e59d4cb70bd2e9bdec8`
**Tipo:** OUT (Saliente)

**⚠️ ESTO ES SOSPECHOSO:**
- Es una transferencia saliente de USDC desde la wallet de la plataforma
- El método "Aggregate" puede indicar una transacción compleja
- Necesitamos verificar si esta dirección está relacionada con usuarios registrados

---

### 🔴 HALLAZGO CRÍTICO #2: Token FOODAM (FD) - Relacionado con foodam.xyz

**Fecha:** 6 de marzo de 2026, 7:22:47 PM
**Block:** 43017810
**Hash:** `0xa696e0de90a1a398fa4be7dc084299138f51250df4040363b34ee54f2daf0926`
**Token:** FOODAM (FD)
**Dirección del Token:** `0x12ecf16aa8b268d996586a28a338acd440fa8070`
**Tipo:** Airdrop (IN - Entrante)
**Monto:** 9 FD tokens

**⚠️ ESTO ES MUY SOSPECHOSO:**
- El token se llama "FOODAM" que coincide con el dominio mencionado: `foodam.xyz`
- Es un airdrop recibido en la wallet de la plataforma
- Esto puede indicar una conexión con el atacante

---

### 📊 OTRAS TRANSACCIONES RELEVANTES

#### Transferencia de USDC Entrante (Depósito)
**Fecha:** 6 de marzo de 2026, 1:30:39 AM
**Block:** 42985646
**Hash:** `0x75382d90ac8381b1168cfedacc824adf6308d017537d7e0b1362287e2619aba3`
**Monto:** 5.286988 USDC ($5.29)
**Tipo:** IN (Entrante)

**Nota:** Este depósito ocurre ANTES de la transferencia saliente sospechosa. Puede ser un depósito legítimo de un usuario.

---

## 🔍 DIRECCIONES A INVESTIGAR

### 1. Dirección de Destino de USDC: `0x2dcdea8a708f1fdeca5e2e59d4cb70bd2e9bdec8`

**Qué verificar:**
- ¿Esta dirección pertenece a un usuario registrado?
- ¿Tiene relación con foodam.xyz?
- ¿Qué otras transacciones tiene esta dirección?

**URL para investigar:**
```
https://basescan.org/address/0x2dcdea8a708f1fdeca5e2e59d4cb70bd2e9bdec8
```

---

### 2. Dirección del Token FOODAM: `0x12ecf16aa8b268d996586a28a338acd440fa8070`

**Qué verificar:**
- ¿Quién creó este token?
- ¿Qué relación tiene con foodam.xyz?
- ¿Quién tiene tokens FOODAM?

**URL para investigar:**
```
https://basescan.org/token/0x12ecf16aa8b268d996586a28a338acd440fa8070
```

---

## 📋 ACCIONES INMEDIATAS

### 1. Verificar en Supabase

**Ejecuta esta query para verificar si la transacción está registrada:**

```sql
SELECT * FROM vault_transactions 
WHERE tx_hash = '0x7a6d08b534aad1dd7f2c7efe2d9b1034ad2ef98c81babe20a52768d545f44305';
```

**Si no está registrada:**
- Confirma que la fuga ocurrió ANTES de implementar la auditoría
- La tabla `vault_transactions` fue creada después de esta transacción

---

### 2. Verificar Dirección de Destino

**Ejecuta esta query para verificar si la dirección pertenece a un usuario:**

```sql
SELECT * FROM users 
WHERE LOWER(wallet_address) = LOWER('0x2dcdea8a708f1fdeca5e2e59d4cb70bd2e9bdec8');
```

**Si no pertenece a ningún usuario:**
- ✅ Confirma que es una transacción sospechosa
- Esta dirección recibió USDC sin ser usuario registrado

---

### 3. Revisar Logs del Servidor

**En Render → Logs, busca:**
- Hash: `0x7a6d08b534aad1dd7f2c7efe2d9b1034ad2ef98c81babe20a52768d545f44305`
- Requests a `/api/claim` alrededor del 7 de marzo de 2026
- Cualquier referencia a `0x2dcdea8a708f1fdeca5e2e59d4cb70bd2e9bdec8`

---

## 🎯 CONCLUSIÓN PRELIMINAR

### Evidencia Encontrada:

1. ✅ **Transferencia sospechosa de USDC:** 5.286988 USDC enviados a dirección desconocida
2. ✅ **Conexión con FOODAM:** Token FOODAM recibido en la wallet (relacionado con foodam.xyz)
3. ✅ **Timing sospechoso:** La transferencia ocurre después de recibir el token FOODAM

### Próximos Pasos:

1. **Verificar en Supabase** si la transacción está registrada
2. **Investigar la dirección de destino** `0x2dcdea8a708f1fdeca5e2e59d4cb70bd2e9bdec8`
3. **Investigar el token FOODAM** y su relación con foodam.xyz
4. **Revisar logs del servidor** para encontrar el patrón del ataque

---

## 📊 RESUMEN DE HALLAZGOS

| Tipo | Fecha | Monto | Dirección | Estado |
|------|-------|-------|-----------|--------|
| USDC OUT | 7 mar 2026 | 5.29 USDC | 0x2dcdea8a... | 🔴 SOSPECHOSO |
| FOODAM IN | 6 mar 2026 | 9 FD | 0x12ecf16a... | 🔴 RELACIONADO |
| USDC IN | 6 mar 2026 | 5.29 USDC | - | ✅ DEPÓSITO |

---

**¿Quieres que investigue más sobre estas direcciones o que verifiquemos en Supabase si están registradas?**
