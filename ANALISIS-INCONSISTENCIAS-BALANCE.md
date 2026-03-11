# 🔍 ANÁLISIS DE INCONSISTENCIAS DE BALANCE

## 🐛 PROBLEMAS DETECTADOS

### Problema 1: Confusión entre "Jugable" y "Saldo demo"
- **Header**: "Jugable: 0 MTR" (balance real)
- **Sección Práctica**: "Jugable: 1000 MTR" (balance demo)
- **Inconsistencia**: Ambos dicen "Jugable" pero son conceptos diferentes

### Problema 2: Elementos que muestran balance inconsistente
En `index.html` línea 472-473:
```html
<span><span id="balanceLabel">Tu MTR (on-chain)</span>: <strong id="onchainMtrBalance">--</strong></span>
<span>Jugable: <strong id="userBalance">0</strong> MTR</span>
```

**En modo práctica:**
- `balanceLabel` cambia a "Saldo demo (práctica)" ✅
- `onchainMtrBalance` muestra balance demo ✅
- `userBalance` muestra balance demo ✅
- PERO el texto dice "Jugable: X MTR" cuando debería decir "Saldo demo: X MTR"

### Problema 3: El header siempre muestra balance real
- Esto está bien conceptualmente
- PERO en modo práctica puede ser confuso porque:
  - Header: "Jugable: 0 MTR" (real)
  - Sección: "Jugable: 1000 MTR" (demo)
  - El usuario puede confundirse sobre cuál es el balance real

## ✅ SOLUCIÓN PROPUESTA

### Opción 1: Cambiar el texto en modo práctica
En modo práctica, cambiar "Jugable: X MTR" a "Saldo demo: X MTR" para que sea claro que es demo.

### Opción 2: Ocultar "Jugable" en modo práctica
En modo práctica, solo mostrar "Saldo demo (práctica): X" sin el texto "Jugable".

### Opción 3: Hacer el header más claro en modo práctica
En modo práctica, el header podría mostrar: "Modo Práctica | Real: 0 MTR" para clarificar.

## 🎯 RECOMENDACIÓN

**Opción 1 es la mejor**: Cambiar el texto "Jugable: X MTR" a "Saldo demo: X MTR" cuando está en modo práctica, para que sea consistente con el label "Saldo demo (práctica)".
