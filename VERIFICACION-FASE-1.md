# ✅ VERIFICACIÓN FASE 1 - FUNCIONES CORE

## 🎯 OBJETIVO

Verificar que las funciones core del sistema funcionan correctamente sin necesidad de ETH.

---

## 1. 💳 SISTEMA DE CRÉDITOS

### 📋 Funcionalidad a Verificar:

#### 1.1 Acreditación de Créditos al Depositar
- Cuando llega USDC → Acredita créditos 1:1
- Cuando llega MTR → Convierte a créditos según tasa

#### 1.2 Descuento de Créditos al Apostar
- Descuenta créditos cuando usuario apuesta
- Verifica que tenga suficientes créditos

#### 1.3 Acreditación de Premios
- Acredita créditos cuando usuario gana
- Calcula premio correctamente

### 🔍 Cómo Verificar:

#### Verificación Manual:
1. **Revisar Base de Datos**:
   ```sql
   -- Ver créditos de usuarios
   SELECT * FROM user_credits ORDER BY updated_at DESC LIMIT 10;
   
   -- Ver historial de cambios
   SELECT * FROM credit_transactions ORDER BY created_at DESC LIMIT 20;
   ```

2. **Revisar Logs del Servidor**:
   - Buscar: `[deposit-listener]` o `[multi-chain]`
   - Buscar: `increment_user_credits`
   - Buscar: `Credits awarded`

3. **Probar con Depósito Pequeño**:
   - Enviar 10 USDC a wallet de tesorería
   - Verificar que se acreditan 10 créditos
   - Verificar en logs y base de datos

### ✅ Checklist:
- [ ] Los créditos se acreditan correctamente al depositar USDC
- [ ] Los créditos se acreditan correctamente al depositar MTR (con tasa)
- [ ] Los créditos se descuentan al apostar
- [ ] Los créditos se acreditan al ganar
- [ ] La tasa es 1 crédito = 1 USDC para USDC
- [ ] La tasa MTR → créditos es correcta

---

## 2. 🎮 SISTEMA DE APUESTAS

### 📋 Funcionalidad a Verificar:

#### 2.1 Crear Partida
- Usuario puede crear partida privada
- Se establece monto de apuesta
- Se verifica que tenga créditos suficientes

#### 2.2 Unirse a Partida
- Usuario puede unirse a partida existente
- Se descuentan créditos al unirse
- Se verifica balance antes de unirse

#### 2.3 Cálculo de Ganadores
- Se determina ganador correctamente
- Se calcula premio correctamente
- Se acreditan créditos al ganador

#### 2.4 Finalización de Partida
- Partida se finaliza correctamente
- Créditos se distribuyen correctamente
- Estado se actualiza en base de datos

### 🔍 Cómo Verificar:

#### Verificación Manual:
1. **Revisar Código de Game Engine**:
   - Verificar lógica de apuestas
   - Verificar cálculo de ganadores
   - Verificar distribución de premios

2. **Revisar Logs**:
   - Buscar: `[game-engine]`
   - Buscar: `Match created`
   - Buscar: `Match finalized`
   - Buscar: `Credits awarded`

3. **Probar Flujo Completo**:
   - Crear partida de prueba
   - Unirse a partida
   - Simular finalización
   - Verificar créditos

### ✅ Checklist:
- [ ] Se pueden crear partidas
- [ ] Se puede unir a partidas
- [ ] Se verifican créditos antes de apostar
- [ ] Se descuentan créditos al apostar
- [ ] Se calculan ganadores correctamente
- [ ] Se acreditan premios correctamente
- [ ] Las partidas se finalizan correctamente

---

## 3. 🔍 DETECCIÓN DE DEPÓSITOS

### 📋 Funcionalidad a Verificar:

#### 3.1 Detección en Base Network
- Detecta depósitos USDC en Base
- Detecta depósitos MTR en Base
- Escanea bloques periódicamente

#### 3.2 Detección Multi-Chain
- Detecta depósitos en Ethereum
- Detecta depósitos en Polygon
- Detecta depósitos en Optimism
- Detecta depósitos en Arbitrum

#### 3.3 Procesamiento de Depósitos
- Verifica que depósito es válido
- Acredita créditos correctamente
- Guarda registro en base de datos
- Dispara auto-compra de MTR (si hay ETH)

### 🔍 Cómo Verificar:

#### Verificación Manual:
1. **Revisar Logs**:
   ```
   [deposit-listener] Scanned USDC blocks...
   [deposit-listener] Found X USDC transfer events
   [deposit-listener] Processing deposit...
   [multi-chain] Found X transfers on network...
   ```

2. **Revisar Base de Datos**:
   ```sql
   -- Ver depósitos procesados
   SELECT * FROM deposits ORDER BY created_at DESC LIMIT 20;
   
   -- Ver depósitos por red
   SELECT network, COUNT(*) FROM deposits GROUP BY network;
   ```

3. **Probar con Depósito**:
   - Enviar pequeño depósito USDC a wallet
   - Esperar 1-2 minutos
   - Verificar en logs y base de datos

### ✅ Checklist:
- [ ] Detecta depósitos USDC en Base
- [ ] Detecta depósitos MTR en Base
- [ ] Detecta depósitos en otras redes (si aplica)
- [ ] Procesa depósitos correctamente
- [ ] Acredita créditos al procesar
- [ ] Guarda registro en base de datos
- [ ] No procesa depósitos duplicados

---

## 4. 📊 PRICE UPDATER

### 📋 Funcionalidad a Verificar:

#### 4.1 Actualización de Precio
- Obtiene precio de MTR periódicamente
- Actualiza precio en base de datos
- Maneja errores correctamente

#### 4.2 Fuentes de Precio
- Obtiene precio de múltiples fuentes
- Usa precio de Uniswap/DEX
- Tiene fallback si falla

#### 4.3 Almacenamiento
- Guarda precio en `platform_settings`
- Actualiza timestamp
- Mantiene historial (si aplica)

### 🔍 Cómo Verificar:

#### Verificación Manual:
1. **Revisar Logs**:
   ```
   [price-updater] Fetching MTR price...
   [price-updater] MTR price updated: $X.XXXXXX
   [price-updater] Price saved to database
   ```

2. **Revisar Base de Datos**:
   ```sql
   -- Ver precio actual
   SELECT * FROM platform_settings WHERE key = 'mtr_usdc_price';
   
   -- Ver último precio
   SELECT * FROM platform_settings 
   WHERE key LIKE '%price%' 
   ORDER BY updated_at DESC;
   ```

3. **Verificar Actualización Periódica**:
   - Esperar intervalo de actualización
   - Verificar que precio se actualiza
   - Verificar que precio es razonable

### ✅ Checklist:
- [ ] Se actualiza precio periódicamente
- [ ] El precio es razonable (no 0, no extremo)
- [ ] Se guarda en base de datos
- [ ] Maneja errores correctamente
- [ ] Tiene fallback si falla fuente principal
- [ ] El precio se usa correctamente en cálculos

---

## 📊 RESUMEN DE VERIFICACIÓN

### Funciones a Verificar:

| Función | Estado Esperado | Prioridad |
|---------|----------------|-----------|
| **Sistema de Créditos** | ✅ Funcionando | 🔴 Alta |
| **Sistema de Apuestas** | ✅ Funcionando | 🔴 Alta |
| **Detección de Depósitos** | ✅ Funcionando | 🔴 Alta |
| **Price Updater** | ✅ Funcionando | 🟡 Media |

---

## 🚀 PLAN DE ACCIÓN

### Paso 1: Revisar Logs del Servidor
- Buscar errores relacionados con estas funciones
- Verificar que se ejecutan correctamente
- Identificar problemas potenciales

### Paso 2: Revisar Base de Datos
- Verificar datos recientes
- Verificar integridad de datos
- Identificar inconsistencias

### Paso 3: Probar Funcionalidad
- Probar cada función manualmente
- Verificar resultados esperados
- Documentar problemas encontrados

### Paso 4: Documentar Resultados
- Crear reporte de verificación
- Listar problemas encontrados
- Proponer soluciones

---

## 📝 PRÓXIMOS PASOS

1. **Revisar logs actuales** del servidor
2. **Revisar base de datos** para ver datos recientes
3. **Probar cada función** manualmente
4. **Documentar resultados** y problemas encontrados

---

¿Empezamos revisando los logs del servidor o prefieres que revise el código primero?
