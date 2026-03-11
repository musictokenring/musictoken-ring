# ✅ CORRECCIÓN: Mínimo de Apuesta para Desafíos Sociales

## 🐛 PROBLEMA DETECTADO

El sistema mostraba **"La apuesta mínima para desafíos sociales es 100 créditos"** cuando debería ser **5 créditos**.

### Causa:
El código estaba usando `GameEngine.minBet` que puede venir de la base de datos (`game_config`) y tener un valor de 100 créditos, en lugar de usar siempre 5 para desafíos sociales.

---

## ✅ SOLUCIÓN IMPLEMENTADA

### Cambios Realizados:

1. **En `index.html` - Función `createSocialChallenge()`**:
   - **Antes**: Usaba `GameEngine.minBet` (podía ser 100)
   - **Ahora**: Usa siempre `5` créditos para desafíos sociales

2. **En `index.html` - Función `updateBetEligibility()`**:
   - **Antes**: Usaba `GameEngine.minBet` para validar elegibilidad
   - **Ahora**: Usa siempre `5` créditos para desafíos sociales

### Código Corregido:

```javascript
// ANTES (INCORRECTO):
const minBetAmount = (typeof GameEngine !== 'undefined' && GameEngine.minBet) ? GameEngine.minBet : 5;

// AHORA (CORRECTO):
// CRÍTICO: Desafíos sociales siempre tienen mínimo de 5 créditos
const minBetAmount = 5;
```

---

## 🎯 RESULTADO ESPERADO

### Antes:
- ❌ Mensaje: "La apuesta mínima para desafíos sociales es 100 créditos"
- ❌ Validación rechazaba apuestas menores a 100

### Ahora:
- ✅ Mensaje: "La apuesta mínima para desafíos sociales es 5 créditos"
- ✅ Validación acepta apuestas de 5 créditos o más
- ✅ Botón "Crear Desafío" se habilita con 5 créditos

---

## 📝 VERIFICACIÓN

Para verificar que funciona:

1. **Navega a Desafío Social**
2. **Selecciona una canción**
3. **Ingresa 5 créditos** en el campo de apuesta
4. **Verifica que**:
   - ✅ NO aparece el mensaje de error de "100 créditos"
   - ✅ El botón "Crear Desafío" está habilitado
   - ✅ Puedes crear el desafío con 5 créditos

---

## 🔍 NOTAS TÉCNICAS

- El mínimo de **5 créditos** está hardcodeado específicamente para desafíos sociales
- Otros modos (Quick Match, Sala Privada, Torneo) siguen usando `GameEngine.minBet` que puede venir de la base de datos
- El backend (`game-engine.js`) ya valida correctamente con `MIN_BET_AMOUNT = 5`

---

¿Funciona correctamente ahora?
