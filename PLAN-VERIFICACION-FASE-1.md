# 📋 PLAN DE VERIFICACIÓN FASE 1 - FUNCIONES CORE

## 🎯 OBJETIVO

Verificar sistemáticamente que las 4 funciones core funcionan correctamente:
1. Sistema de Créditos
2. Sistema de Apuestas  
3. Detección de Depósitos
4. Price Updater

---

## 1. 💳 SISTEMA DE CRÉDITOS - VERIFICACIÓN

### Código Revisado:
- ✅ `deposit-listener.js`: Líneas 441-471 - Acreditación al depositar
- ✅ `claim-service.js`: Líneas 90-98, 158-161 - Descuento al retirar
- ✅ `game-engine.js`: Funciones `updateBalance`, `awardCredits`

### Funcionalidad Esperada:

#### Acreditación al Depositar:
```javascript
// En deposit-listener.js línea 441
await supabase.rpc('increment_user_credits', {
    user_id_param: userId,
    credits_to_add: credits
});
```
- **USDC**: 1 USDC = 1 crédito
- **MTR**: Usa tasa configurada (ej: 778 MTR = 1 crédito)

#### Descuento al Apostar:
```javascript
// En game-engine.js
await this.updateBalance(-betAmount, 'bet', null);
```
- Verifica créditos suficientes antes de apostar
- Descuenta créditos al crear/unirse a partida

#### Acreditación al Ganar:
```javascript
// En game-engine.js
await this.awardCredits(creditsWon, match.id);
```
- Calcula premio según resultado
- Acredita créditos al ganador

### ✅ Verificación Requerida:

1. **Revisar Logs**:
   - Buscar: `[deposit-listener] ✅ Credited X credits`
   - Buscar: `[game-engine] Balance updated`
   - Buscar: `[game-engine] Credits awarded`

2. **Revisar Base de Datos**:
   ```sql
   -- Ver créditos actuales
   SELECT user_id, credits, updated_at 
   FROM user_credits 
   ORDER BY updated_at DESC 
   LIMIT 10;
   
   -- Ver transacciones recientes (si existe tabla)
   SELECT * FROM credit_transactions 
   ORDER BY created_at DESC 
   LIMIT 20;
   ```

3. **Probar Manualmente**:
   - Depositar pequeño monto USDC
   - Verificar créditos acreditados
   - Apostar y verificar descuento
   - Ganar y verificar acreditación

---

## 2. 🎮 SISTEMA DE APUESTAS - VERIFICACIÓN

### Código Revisado:
- ✅ `game-engine.js`: Funciones de creación de partidas, unión, finalización

### Funcionalidad Esperada:

#### Crear Partida:
- Usuario puede crear partida privada o pública
- Se establece monto de apuesta
- Se verifica créditos suficientes

#### Unirse a Partida:
- Usuario puede unirse a partida existente
- Se descuentan créditos al unirse
- Se verifica balance antes de unirse

#### Finalizar Partida:
- Se determina ganador según puntuación
- Se calcula premio (descontando fees)
- Se acreditan créditos al ganador

### ✅ Verificación Requerida:

1. **Revisar Logs**:
   - Buscar: `[game-engine] Match created`
   - Buscar: `[game-engine] User joined match`
   - Buscar: `[game-engine] Match finalized`
   - Buscar: `[game-engine] Winner determined`

2. **Revisar Base de Datos**:
   ```sql
   -- Ver partidas recientes
   SELECT id, status, bet_amount, winner_id, created_at 
   FROM matches 
   ORDER BY created_at DESC 
   LIMIT 10;
   
   -- Ver participantes
   SELECT * FROM match_participants 
   ORDER BY created_at DESC 
   LIMIT 20;
   ```

3. **Probar Flujo Completo**:
   - Crear partida de prueba
   - Unirse a partida
   - Simular finalización
   - Verificar créditos del ganador

---

## 3. 🔍 DETECCIÓN DE DEPÓSITOS - VERIFICACIÓN

### Código Revisado:
- ✅ `deposit-listener.js`: Escaneo de bloques Base
- ✅ `multi-chain-deposit-listener.js`: Escaneo multi-red

### Funcionalidad Esperada:

#### Detección Base Network:
- Escanea bloques cada X segundos
- Detecta eventos `Transfer` de USDC y MTR
- Verifica que destino sea wallet de tesorería
- Procesa depósito y acredita créditos

#### Detección Multi-Chain:
- Escanea Ethereum, Polygon, Optimism, Arbitrum
- Detecta depósitos USDC en cada red
- Convierte todo a créditos

### ✅ Verificación Requerida:

1. **Revisar Logs**:
   ```
   [deposit-listener] Scanned USDC blocks X-Y: found N events
   [deposit-listener] Processing deposit: txHash...
   [deposit-listener] ✅ Deposit processed successfully
   [multi-chain] Found N transfers on network...
   ```

2. **Revisar Base de Datos**:
   ```sql
   -- Ver depósitos procesados
   SELECT tx_hash, network, token, amount, user_id, created_at 
   FROM deposits 
   ORDER BY created_at DESC 
   LIMIT 20;
   
   -- Ver depósitos por red
   SELECT network, COUNT(*) as count, SUM(amount) as total 
   FROM deposits 
   GROUP BY network;
   ```

3. **Probar con Depósito**:
   - Enviar pequeño depósito USDC (ej: 10 USDC)
   - Esperar 1-2 minutos
   - Verificar en logs y base de datos
   - Verificar créditos acreditados

---

## 4. 📊 PRICE UPDATER - VERIFICACIÓN

### Código Revisado:
- ✅ `price-updater.js`: Actualización periódica de precio

### Funcionalidad Esperada:

#### Actualización Periódica:
- Obtiene precio MTR/USDC cada minuto
- Calcula precio desde pool de liquidez
- Actualiza en base de datos si cambia >5%

#### Fuentes de Precio:
- Uniswap V3 pool (Base)
- Aerodrome pool (fallback)
- 0x API (fallback)

### ✅ Verificación Requerida:

1. **Revisar Logs**:
   ```
   [price-updater] Fetching MTR price...
   [price-updater] MTR price: $X.XXXXXX
   [price-updater] Price updated in database
   ```

2. **Revisar Base de Datos**:
   ```sql
   -- Ver precio actual
   SELECT key, value, updated_at 
   FROM platform_settings 
   WHERE key = 'mtr_usdc_price' 
   OR key LIKE '%price%';
   
   -- Ver última actualización
   SELECT * FROM platform_settings 
   WHERE key = 'mtr_usdc_price';
   ```

3. **Verificar Actualización**:
   - Esperar 1-2 minutos
   - Verificar que precio se actualiza
   - Verificar que precio es razonable (no 0, no extremo)

---

## 📊 CHECKLIST DE VERIFICACIÓN

### Sistema de Créditos:
- [ ] Acreditación al depositar USDC funciona
- [ ] Acreditación al depositar MTR funciona (con tasa)
- [ ] Descuento al apostar funciona
- [ ] Acreditación al ganar funciona
- [ ] Tasa 1:1 para USDC es correcta
- [ ] No hay duplicados en acreditación

### Sistema de Apuestas:
- [ ] Crear partida funciona
- [ ] Unirse a partida funciona
- [ ] Verificación de créditos antes de apostar funciona
- [ ] Cálculo de ganadores funciona
- [ ] Acreditación de premios funciona
- [ ] Finalización de partidas funciona

### Detección de Depósitos:
- [ ] Detecta depósitos USDC en Base
- [ ] Detecta depósitos MTR en Base
- [ ] Detecta depósitos en otras redes (si aplica)
- [ ] Procesa depósitos correctamente
- [ ] No procesa duplicados
- [ ] Acredita créditos al procesar

### Price Updater:
- [ ] Actualiza precio periódicamente
- [ ] Precio es razonable
- [ ] Se guarda en base de datos
- [ ] Maneja errores correctamente
- [ ] Tiene fallback si falla fuente

---

## 🚀 PRÓXIMOS PASOS

1. **Revisar Logs del Servidor** (ahora)
2. **Revisar Base de Datos** (ahora)
3. **Probar Funcionalidad Manualmente** (después)
4. **Documentar Resultados** (final)

---

¿Empezamos revisando los logs del servidor o prefieres que revise primero el código en detalle?
