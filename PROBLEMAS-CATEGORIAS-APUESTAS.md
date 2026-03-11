# ⚠️ PROBLEMAS DETECTADOS EN CATEGORÍAS DE APUESTAS

## 🔍 ANÁLISIS DEL CÓDIGO

### ✅ Funcionan Correctamente (Usan Créditos):

1. **Modo Rápido** (`joinQuickMatch`):
   - ✅ Usa `hasSufficientCredits()`
   - ✅ Usa `updateBalance(-betAmount, 'bet')`
   - ✅ Funciona con sistema de créditos

2. **Desafío Social** (`createSocialChallenge`):
   - ✅ Usa `hasSufficientCredits()`
   - ✅ Usa `updateBalance(-betAmount, 'bet')`
   - ✅ Funciona con sistema de créditos

3. **Modo Práctica** (`startPracticeMatch`):
   - ✅ Usa balance demo (localStorage)
   - ✅ Funciona independientemente
   - ✅ No requiere créditos reales

---

### ❌ PROBLEMAS DETECTADOS (NO Usan Créditos):

1. **Sala Privada** (`createPrivateRoom`):
   - ❌ Usa `hasSufficientBalance()` (balance on-chain)
   - ❌ NO verifica créditos
   - ❌ NO descuenta créditos al crear sala
   - ⚠️ **PROBLEMA**: Inconsistente con otras categorías

2. **Sala Privada** (`joinPrivateRoom`):
   - ⚠️ Necesito verificar si también tiene problema

3. **Torneo** (`joinTournament`):
   - ❌ Usa `hasSufficientBalance()` (balance on-chain)
   - ❌ NO verifica créditos antes de unirse
   - ✅ SÍ descuenta créditos con `updateBalance()` (pero después de verificar balance)
   - ⚠️ **PROBLEMA**: Verifica balance on-chain en lugar de créditos

---

## 🛠️ CORRECCIONES NECESARIAS

### Corrección 1: Sala Privada - Crear Sala

**Archivo**: `game-engine.js` línea 821-831

**Problema**:
```javascript
if (!this.hasSufficientBalance(normalizedBet)) {
    return;
}
```

**Debe ser**:
```javascript
if (!(await this.hasSufficientCredits(normalizedBet))) {
    return;
}
```

**También necesita**:
- Descontar créditos ANTES de crear la sala
- Similar a como lo hace `createSocialChallenge`

---

### Corrección 2: Sala Privada - Unirse a Sala

**Archivo**: `game-engine.js` línea 904+

**Necesito verificar**:
- Si verifica créditos antes de unirse
- Si descuenta créditos al unirse

---

### Corrección 3: Torneo - Unirse a Torneo

**Archivo**: `game-engine.js` línea 1465-1483

**Problema**:
```javascript
if (!this.hasSufficientBalance(betAmount)) {
    return;
}
```

**Debe ser**:
```javascript
if (!(await this.hasSufficientCredits(betAmount))) {
    return;
}
```

---

## 📋 RESUMEN DE PROBLEMAS

| Categoría | Función | Verificación | Descuento | Estado |
|-----------|---------|--------------|-----------|--------|
| **Modo Rápido** | `joinQuickMatch` | ✅ Créditos | ✅ Créditos | ✅ Correcto |
| **Sala Privada** | `createPrivateRoom` | ❌ Balance | ❌ No descuenta | ❌ **CORREGIR** |
| **Sala Privada** | `joinPrivateRoom` | ⚠️ Verificar | ⚠️ Verificar | ⚠️ **VERIFICAR** |
| **Desafío Social** | `createSocialChallenge` | ✅ Créditos | ✅ Créditos | ✅ Correcto |
| **Torneo** | `joinTournament` | ❌ Balance | ✅ Créditos | ⚠️ **CORREGIR** |
| **Modo Práctica** | `startPracticeMatch` | ✅ Demo | ✅ Demo | ✅ Correcto |

---

## 🎯 PLAN DE CORRECCIÓN

1. **Corregir `createPrivateRoom`**:
   - Cambiar `hasSufficientBalance` → `hasSufficientCredits`
   - Agregar descuento de créditos ANTES de crear sala

2. **Verificar `joinPrivateRoom`**:
   - Verificar si usa créditos o balance
   - Corregir si es necesario

3. **Corregir `joinTournament`**:
   - Cambiar `hasSufficientBalance` → `hasSufficientCredits`

4. **Verificar consistencia**:
   - Todas las categorías deben usar créditos
   - Todas deben verificar ANTES de crear/unirse
   - Todas deben descontar créditos correctamente

---

¿Procedo con las correcciones?
