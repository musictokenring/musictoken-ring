# Test Completo del Sistema - MusicToken Ring

## 🧪 Cómo Ejecutar el Test

### Opción 1: Consola del Navegador (Recomendado)

1. Abre https://musictokenring.xyz en tu navegador
2. Abre la consola del desarrollador (F12 o Cmd+Option+I)
3. Copia y pega el contenido de `test-sistema-completo.js`
4. Presiona Enter para ejecutar

### Opción 2: Desde el Archivo

1. Abre `test-sistema-completo.js` en tu editor
2. Copia todo el contenido
3. Pégalo en la consola del navegador en musictokenring.xyz

## 📋 Qué Verifica el Test

### 1. Backend Health Check
- ✅ Verifica que el backend esté respondiendo
- ✅ Verifica que todos los servicios estén inicializados
- ✅ Muestra estado de deposit-listener, price-updater, claim-service, vault-service

### 2. Vault Balance
- ✅ Verifica que el endpoint `/api/vault/balance` funcione
- ✅ Muestra el balance actual del vault en USDC

### 3. Configuración de Mínimo de Apuesta
- ✅ Verifica que `MIN_BET_AMOUNT = 5`
- ✅ Verifica que `GameEngine.minBet = 5`
- ✅ Verifica que la UI muestre "Mínimo: 5 créditos"
- ✅ Verifica que el input tenga `min="5"`

### 4. Integración de Ramp Network
- ✅ Verifica que `RampIntegration` esté disponible
- ✅ Verifica que las funciones principales existan
- ✅ Muestra estado del API key (configurado o no)

### 5. Game Engine
- ✅ Verifica que `GameEngine` esté disponible
- ✅ Verifica que esté inicializado
- ✅ Verifica que todos los modos de juego estén disponibles
- ✅ Verifica configuración de `minBet`

### 6. Sistema de Créditos
- ✅ Verifica que `CreditsSystem` esté disponible
- ✅ Muestra créditos actuales del usuario
- ✅ Verifica funciones principales

### 7. Conexión de Wallet
- ✅ Verifica si hay wallet conectada
- ✅ Muestra dirección de wallet (parcial)
- ✅ Muestra balance on-chain
- ✅ Intenta obtener créditos del backend

### 8. Elementos de UI
- ✅ Verifica que elementos críticos existan en el DOM:
  - `betAmount` (input de apuesta)
  - `minBet` (display de mínimo)
  - `appBalanceDisplay` (balance en header)
  - `depositSection` (sección de depósitos)
  - `rampOnRampSection` (sección de Ramp)
  - `claimSection` (sección de reclamos)

### 9. Botones de Apuesta Rápida
- ✅ Verifica que existan 4 botones
- ✅ Verifica que los montos sean: 5, 50, 500, 5000
- ✅ Verifica que los onclick handlers estén configurados

## 📊 Interpretación de Resultados

### ✅ Estado OK
- Componente funcionando correctamente
- No requiere acción

### ⚠️ Estado WARNING
- Componente presente pero con configuración incorrecta
- Revisar y corregir

### ❌ Estado ERROR
- Componente no disponible o con error
- Requiere atención inmediata

## 🔍 Ejemplo de Salida

```
🧪 ==========================================
🧪 TEST COMPLETO DEL SISTEMA
🧪 ==========================================

1️⃣ Probando Backend...
   ✅ Backend respondiendo correctamente
   📊 Servicios: { depositListener: true, priceUpdater: true, ... }

2️⃣ Probando Vault Balance...
   ✅ Vault balance cargado: 1234.56 USDC

3️⃣ Verificando Configuración de Mínimo de Apuesta...
   ✅ Mínimo de apuesta configurado correctamente: 5 créditos
   📱 UI muestra mínimo: 5 créditos
   📝 Input tiene min: 5

...

📊 ==========================================
📊 RESUMEN DEL TEST
📊 ==========================================

✅ COMPONENTES FUNCIONANDO:
   ✅ Backend
   ✅ Vault Balance
   ✅ Configuración MinBet
   ✅ Ramp Integration
   ✅ Game Engine
   ✅ Credits System

🎉 ¡No se encontraron errores!
```

## 🐛 Troubleshooting

### Backend no responde
- Verificar que el servicio esté corriendo en Render
- Verificar URL del backend en `window.CONFIG.BACKEND_API`
- Verificar CORS configuration

### Vault balance no carga
- Verificar que la migración SQL se haya ejecutado
- Verificar que el vault tenga datos iniciales
- Verificar logs del backend

### MinBet incorrecto
- Verificar que `MIN_BET_AMOUNT = 5` en `game-engine.js`
- Verificar que `GameEngine.minBet` use `MIN_BET_AMOUNT`
- Limpiar cache del navegador

### Ramp Integration no disponible
- Verificar que `ramp-integration.js` esté cargado
- Verificar orden de scripts en `index.html`
- Verificar consola para errores de carga

## 📝 Notas

- El test requiere que la página esté completamente cargada
- Algunos tests requieren wallet conectada para funcionar completamente
- Los resultados se guardan en `window.testResultados` para inspección posterior
