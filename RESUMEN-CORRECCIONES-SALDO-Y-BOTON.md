# 🔧 CORRECCIONES: Saldo Duplicado y Botón createSocialBtn

**Fecha:** 2026-03-11  
**Problemas:** Saldo multiplicado (~8x) y botón createSocialBtn no encontrado

---

## 🚨 PROBLEMA 1: Saldo Multiplicado

### Síntoma:
- **On-chain:** 98.024.480 MTR
- **Créditos jugables:** 784.195.820,00 (≈8x el on-chain)
- Se incrementa cada hard refresh

### Causa:
El saldo en Supabase está inflado. Aunque el código tiene validaciones, el valor ya está incorrecto en la base de datos.

### Soluciones Implementadas:

1. **Bloqueo explícito en `refreshMtrBalance`:**
   - Agregado `return` inmediato después del comentario
   - Garantiza que NO se ejecute conversión automática

2. **Validación mejorada en `credits-system.js`:**
   - Si `rawCredits > MAX_REASONABLE_CREDITS` (10 millones)
   - Usa saldo on-chain como límite máximo
   - Si Supabase también está mal, usa on-chain o 0

3. **Script SQL para corrección:**
   - Creado `CORREGIR-SALDO-INFLADO.sql`
   - Corrige saldos que exceden el balance on-chain

---

## 🔧 PROBLEMA 2: Botón createSocialBtn No Encontrado

### Síntoma:
```
[DIAG] ❌ Botón createSocialBtn NO encontrado por ningún método
[DIAG] window.__createSocialBtn: undefined
```

### Causa:
El botón se crea dinámicamente en `updateActionButtons`, pero el código lo busca antes de que se cree.

### Solución Implementada:

1. **Función `findCreateSocialBtn()`:**
   - Busca por ID primero
   - Si no existe, busca por texto ("Crear Desafío", "Desafiar", "Aceptar e Iniciar")
   - Asigna el ID si lo encuentra por texto

2. **Búsqueda periódica:**
   - Busca el botón cada 500ms si no existe
   - Solo en modo social
   - Se detiene después de 30 segundos

3. **Actualización en `updateBetEligibility`:**
   - Usa `findCreateSocialBtn()` como fallback
   - Mejora la detección del botón

---

## 📝 ACCIONES REQUERIDAS

### 1. Corregir Saldo en Supabase:

**Ejecutar SQL:**
```sql
-- Ver saldo actual
SELECT u.wallet_address, uc.credits 
FROM users u
LEFT JOIN user_credits uc ON u.id = uc.user_id
WHERE u.wallet_address ILIKE '0x7537%2253';

-- Corregir saldo (ajustar según saldo on-chain REAL)
UPDATE user_credits
SET credits = LEAST(credits, 98024480), -- Máximo: saldo on-chain
    updated_at = NOW()
WHERE user_id IN (
    SELECT u.id FROM users u 
    WHERE u.wallet_address ILIKE '0x7537%2253'
)
AND credits > 98024480;
```

### 2. Verificar Correcciones:

1. **Hard refresh múltiples veces:**
   - Ctrl+Shift+R (Windows/Linux)
   - Cmd+Shift+R (Mac)
   - Verificar que el saldo NO se incremente

2. **Verificar botón createSocialBtn:**
   - Cambiar a modo social
   - Verificar que el botón aparece
   - Verificar que funciona al hacer click

---

## ✅ CAMBIOS IMPLEMENTADOS

### Archivos Modificados:

1. **`index.html`:**
   - Bloqueo explícito en `refreshMtrBalance` (línea ~4778)
   - Función `findCreateSocialBtn()` agregada
   - Búsqueda periódica del botón
   - Actualización en `updateBetEligibility`

2. **`src/credits-system.js`:**
   - Validación mejorada para usar on-chain como límite máximo
   - Mejor manejo de valores sospechosos

3. **`CORREGIR-SALDO-INFLADO.sql` (NUEVO):**
   - Script SQL para corregir saldos inflados

---

## 🧪 TESTING

### Checklist:

- [ ] Ejecutar SQL para corregir saldo
- [ ] Hard refresh múltiples veces (verificar que NO se incrementa)
- [ ] Verificar que el saldo muestra valor correcto
- [ ] Cambiar a modo social
- [ ] Verificar que `createSocialBtn` aparece
- [ ] Verificar que el botón funciona correctamente

---

**Estado:** ✅ Correcciones implementadas, pendiente ejecución SQL y verificación
