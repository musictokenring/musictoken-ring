# Guía de Pruebas - Lógica de Apuestas y Streams en Tiempo Real

## 🎯 Objetivo
Verificar que todos los cambios implementados funcionan correctamente en producción.

## 📋 Checklist de Pruebas

### 1. Verificación de Archivos en Producción

#### ✅ Verificar que los archivos están cargados:
1. Abre la consola del navegador (F12)
2. Verifica que se carga el módulo StreamsRealtime:
   ```javascript
   // En la consola del navegador:
   typeof window.StreamsRealtime
   // Debe retornar: "object"
   ```

3. Verifica que GameEngine tiene las nuevas funciones:
   ```javascript
   // En la consola:
   typeof GameEngine.initializeStreamsTracking
   // Debe retornar: "function"
   
   typeof GameEngine.getRealTimeStreams
   // Debe retornar: "function"
   ```

### 2. Pruebas de Validación de Apuesta Mínima (100 MTR)

#### Test 1: Apuesta por debajo del mínimo
1. Conecta tu wallet
2. Ve a cualquier modo de juego (Rápido, Privada, Práctica)
3. Intenta ingresar una apuesta menor a 100 MTR (ej: 50 MTR)
4. **Resultado esperado**: Debe mostrar error "Apuesta mínima: 100 MTR"

#### Test 2: Apuesta exactamente en el mínimo
1. Ingresa exactamente 100 MTR
2. **Resultado esperado**: Debe aceptar la apuesta sin errores

#### Test 3: Apuesta mayor al mínimo
1. Ingresa 200 MTR o más
2. **Resultado esperado**: Debe aceptar la apuesta normalmente

### 3. Pruebas de Streams en Tiempo Real

#### Test 1: Inicialización del tracking
1. Inicia una batalla (cualquier modo)
2. Abre la consola del navegador
3. Verifica que se inicializa el tracking:
   ```javascript
   // En la consola durante una batalla:
   window.StreamsRealtime.state.activeMatches.size
   // Debe ser mayor a 0 si hay una batalla activa
   ```

#### Test 2: Actualización de streams
1. Durante una batalla activa, verifica en la consola:
   ```javascript
   // Obtener el ID del match actual (si está disponible)
   const matchId = GameEngine.currentMatch?.id;
   if (matchId) {
     const streams = window.StreamsRealtime.getStreamPercentages(matchId);
     console.log('Streams:', streams);
   }
   ```
2. **Resultado esperado**: Debe mostrar porcentajes actualizados cada 5 segundos

#### Test 3: Datos de APIs
1. Durante una batalla, verifica en la consola:
   ```javascript
   // Verificar que se están haciendo requests
   // Abre la pestaña Network en DevTools
   // Filtra por "deezer" o "api"
   // Debe haber requests cada 5 segundos
   ```

### 4. Pruebas de Determinación de Ganador

#### Test 1: Ganador basado en porcentajes
1. Inicia una batalla
2. Espera a que termine (60 segundos)
3. **Resultado esperado**: El ganador debe determinarse basado en los porcentajes de streams reales

#### Test 2: Verificación de datos finales
1. Al finalizar una batalla, verifica en la consola:
   ```javascript
   // Si tienes acceso al match finalizado:
   const finalStreams = window.StreamsRealtime.getStreamPercentages(matchId);
   console.log('Streams finales:', finalStreams);
   ```

### 5. Pruebas de Payout On-Chain

#### Test 1: Validación de dirección de wallet
1. Gana una batalla
2. Verifica que se valida la dirección antes de enviar el payout
3. **Resultado esperado**: Si la dirección es inválida, debe mostrar error

#### Test 2: Validación de monto mínimo
1. El sistema debe verificar que el payout sea al menos 100 MTR
2. **Resultado esperado**: Si el monto es menor, debe mostrar error

#### Test 3: Envío de payout
1. Gana una batalla con payout válido
2. Verifica que se muestra el hash de transacción
3. **Resultado esperado**: Debe mostrar "Premio enviado! Tx: [hash]..."

### 6. Pruebas de Error Handling

#### Test 1: Fallback cuando APIs fallan
1. Simula un error de red (desconecta internet temporalmente)
2. Inicia una batalla
3. **Resultado esperado**: Debe usar el cálculo simulado como fallback

#### Test 2: Manejo de errores de conexión
1. Verifica que los errores se muestran correctamente al usuario
2. **Resultado esperado**: Mensajes de error claros y útiles

### 7. Pruebas de Tests Unitarios

#### Ejecutar tests:
```bash
# Si tienes Jest instalado:
npm test

# O ejecutar directamente:
node tests/bet-logic.test.js
```

## 🔗 URLs para Pruebas

### Producción:
- **URL Principal**: https://musictokenring.xyz
- **Verificar cambios**: https://musictokenring.xyz/# (con wallet conectada)

### Local (si quieres probar localmente):
```bash
npm start
# O
npx http-server public -p 8080
```
Luego abre: http://localhost:8080

## 📊 Verificación en Consola del Navegador

### Comandos útiles para debugging:

```javascript
// 1. Verificar que StreamsRealtime está cargado
console.log('StreamsRealtime:', window.StreamsRealtime);

// 2. Ver matches activos siendo trackeados
console.log('Matches activos:', Array.from(window.StreamsRealtime.state.activeMatches.keys()));

// 3. Ver estado de un match específico
const matchId = 'tu-match-id';
const data = window.StreamsRealtime.getStreamPercentages(matchId);
console.log('Datos de streams:', data);

// 4. Verificar GameEngine
console.log('GameEngine minBet:', GameEngine.minBet); // Debe ser 100
console.log('GameEngine tiene streams tracking:', typeof GameEngine.initializeStreamsTracking);

// 5. Verificar que se están haciendo requests
// Abre DevTools > Network > Filtra por "deezer" o "api"
// Debe haber requests cada ~5 segundos durante una batalla
```

## 🐛 Troubleshooting

### Problema: StreamsRealtime no está definido
**Solución**: Verifica que `src/streams-realtime.js` se carga antes de `game-engine.js` en `index.html`

### Problema: No se actualizan los streams
**Solución**: 
1. Verifica la consola por errores
2. Verifica que las APIs de Deezer están accesibles
3. Verifica la pestaña Network en DevTools

### Problema: Apuestas menores a 100 MTR se aceptan
**Solución**: Verifica que `GameEngine.minBet` es 100 y que la validación se ejecuta en `joinQuickMatch`, `createPrivateRoom`, etc.

### Problema: Payout no se envía
**Solución**:
1. Verifica que la wallet está conectada
2. Verifica que la dirección es válida
3. Verifica que el backend está disponible
4. Revisa la consola por errores

## ✅ Checklist Final

- [ ] StreamsRealtime se carga correctamente
- [ ] Validación de apuesta mínima funciona (100 MTR)
- [ ] Streams se actualizan cada 5 segundos durante batallas
- [ ] Ganador se determina basado en % streams reales
- [ ] Payout on-chain funciona con validaciones
- [ ] Error handling funciona correctamente
- [ ] Tests unitarios pasan

## 📝 Notas

- Los cambios están en producción en `main`
- Vercel debería haber desplegado automáticamente
- Si no ves los cambios, limpia la caché del navegador (Ctrl+Shift+R)
- Verifica que estás en la URL correcta de producción
