# Resumen de Implementación - Especificación Refinada del Flujo

**Fecha:** Marzo 2026  
**Objetivo:** Garantizar que el usuario vea y sienta: "Deposité USDC → juego con créditos estables que valen SIEMPRE $1 → retiro USDC garantizado"

## ✅ Cambios Implementados (Frontend)

### FASE 1: Actualización de UI
- ✅ Actualizado `credits-system.js` para mostrar créditos estables como "MTR créditos jugables"
- ✅ Agregado tooltip explicativo: "Estas fichas valen siempre $1 cada una. No fluctúan como el token MTR nativo"
- ✅ Ocultado visualmente el balance de MTR nativo (`onchainMtrBalance`) - ya no se muestra como saldo jugable
- ✅ Actualizado header para mostrar "Fichas jugables: X.XX MTR créditos = $Y.YY USDC estables"
- ✅ Actualizado panel de apuesta para mostrar "Fichas jugables: X.XX MTR créditos" con tooltip

### FASE 2: Validaciones y Mensajes
- ✅ Actualizado todas las validaciones de apuestas para usar SOLO créditos estables
- ✅ Eliminado referencias a `onchainBalance` en validaciones (MTR nativo se maneja solo en backend)
- ✅ Actualizado mensajes de error para mencionar "MTR créditos jugables" en lugar de "créditos y saldo MTR"
- ✅ Actualizado perfil de usuario para mostrar "MTR créditos" con tooltip explicativo
- ✅ Agregado tooltips en todos los elementos de balance para clarificar que son créditos estables 1:1 USDC

## 📋 Pendiente (Backend)

### 1. Conversión Automática MTR → Créditos Estables
**Ubicación:** Backend (listener de eventos / indexer)  
**Requisito:** Cuando usuario deposita MTR a la wallet de tesorería (0x75376BC58830f27415402875D26B73A6BE8E2253):
- Detectar Transfer de MTR
- Obtener precio actual (oracle: Chainlink USDC/USD o TWAP Aerodrome)
- Convertir MTR → créditos estables equivalentes
- Acreditar créditos estables al usuario (1 crédito = 1 USDC)
- MTR recibido queda en la wallet de tesorería (para trading/liquidez backend)

### 2. Depósito USDC → Créditos Estables
**Ubicación:** Backend (listener de eventos / indexer)  
**Requisito:** Cuando usuario deposita USDC a la wallet de tesorería:
- Detectar Transfer de USDC
- Calcular fee: 5% del monto → queda en wallet de tesorería
- Acreditar créditos estables: neto = monto - fee → user.credits += neto / 1e6
- Nunca acreditar MTR como saldo jugable

### 3. Fees en Apuestas
**Ubicación:** Backend (lógica de apuestas)  
**Requisito:** 
- Fee 2% de cada apuesta → acumula en wallet de tesorería
- Ganancias/pérdidas ajustan créditos estables del usuario

### 4. Retiro de Créditos Estables → USDC
**Ubicación:** Backend (función withdraw)  
**Requisito:**
- Usuario solicita retiro de créditos estables
- Fee: 5% → acumula en wallet de tesorería
- Transferir USDC neto desde wallet de tesorería (0x75376BC58830f27415402875D26B73A6BE8E2253) a wallet del usuario
- Mensaje UI: "Fondos enviados automáticamente desde la wallet de tesorería segura y transparente"

### 5. Wallet de Tesorería
**Address:** 0x75376BC58830f27415402875D26B73A6BE8E2253  
**Uso:**
- Recibir depósitos (USDC/MTR)
- Acumular fees (5% dep + 2% apuesta + 5% ret)
- Pagar retiros de usuarios
- Manejar trading/liquidez de MTR nativo (backend)
- **Regla estricta:** NUNCA se toca manualmente excepto para retiros de ganancias del owner (calculados vía SQL)

### 6. SQL para Calcular Ganancias del Owner
**Ubicación:** Backend (query SQL)  
**Requisito:**
- Query para sumar fees acumulados en DB o on-chain
- Trigger transfer manual/auto desde wallet (con logs para transparencia)
- Auditoría: Asegurar que wallet tenga multisig o restrictions para evitar drains no autorizados

## 🔍 Verificaciones Necesarias

1. **Backend - Conversión Automática:**
   - [ ] Listener de eventos configurado para Transfer de USDC/MTR a wallet de tesorería
   - [ ] Oracle de precio configurado (Chainlink o TWAP Aerodrome)
   - [ ] Lógica de conversión MTR → créditos estables funcionando
   - [ ] Fee de 5% en depósitos funcionando

2. **Backend - Fees:**
   - [ ] Fee 2% en apuestas acumulando en wallet de tesorería
   - [ ] Fee 5% en retiros acumulando en wallet de tesorería

3. **Backend - Retiros:**
   - [ ] Función withdraw validando saldo
   - [ ] Transfer de USDC desde wallet de tesorería funcionando
   - [ ] Mensaje UI mostrando transparencia de wallet

4. **Wallet de Tesorería:**
   - [ ] Balance actual verificado en BaseScan
   - [ ] Seed inicial si balance ~0 USDC
   - [ ] Multisig o restrictions configuradas
   - [ ] Link a BaseScan visible en UI para transparencia

5. **UI - Tooltips y Clarificaciones:**
   - [ ] Todos los tooltips funcionando correctamente
   - [ ] FAQ/Onboarding con analogía del "parque de apuestas musicales"
   - [ ] Link a BaseScan de wallet de tesorería visible

## 📝 Notas Importantes

- **MTR nativo (0x99cd1eb32846c9027ed9cb8710066fa08791c33b):** Solo se maneja en backend para liquidez general, trading, cotización en DEX. NUNCA afecta los créditos jugables ni los pagos directos.

- **Créditos estables:** Internamente son uint256, 1 crédito = 1 USDC fijo (decimals 6). Visualmente se muestran como "MTR créditos jugables" (alias gráfico).

- **Wallet única de tesorería:** Usar SOLO UNA wallet (0x75376BC58830f27415402875D26B73A6BE8E2253) para TODO: recibir depósitos, fees, manejar pagos/retiros, acumular comisiones.

- **Reversibilidad:** Todos los cambios están en commits separados y pueden revertirse si es necesario:
  - `211e07d` - FASE 1: Actualizar UI
  - `7875b25` - FASE 2: Actualizar validaciones y mensajes

## 🚀 Próximos Pasos

1. Verificar que el backend esté implementando la conversión automática MTR → créditos estables
2. Verificar que los fees estén acumulando correctamente en la wallet de tesorería
3. Agregar link a BaseScan de la wallet de tesorería en la UI
4. Implementar FAQ/Onboarding con la analogía del "parque de apuestas musicales"
5. Test end-to-end: Depósito USDC/MTR → fee acumula → apuesta → fee acumula → retiro desde wallet
