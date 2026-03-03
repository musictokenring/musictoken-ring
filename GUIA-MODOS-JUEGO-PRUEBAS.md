# 🎮 Guía Completa: Modos de Juego y Rutas de Prueba

## 📋 Resumen de Modos de Juego

El sistema tiene **4 modos de juego** diferentes, cada uno con su propia lógica y validaciones:

1. **⚔️ Modo Rápido (Quick Match)** - Matchmaking automático
2. **🎵 Sala Privada (Private Room)** - Crear o unirse a salas
3. **🎯 Modo Práctica (Practice)** - Contra CPU sin riesgo real
4. **🏆 Torneo (Tournament)** - Torneos con ID específico

---

## 🔄 Flujo General de Navegación

```
1. Iniciar Sesión (auth-system.js)
   ↓
2. Selector de Modos (modeSelector) - 4 opciones
   ↓
3. Selección de Canción (songSelection) - Buscar y elegir canción
   ↓
4. Configurar Apuesta (betAmount) - Mínimo 100 MTR
   ↓
5. Iniciar Batalla - Según el modo seleccionado
   ↓
6. Pantalla de Batalla - 60 segundos con streams en tiempo real
   ↓
7. Resultado - Ganador/perdedor + Payout (si aplica)
```

---

## 🎯 MODO 1: Modo Rápido (Quick Match)

### 📖 Descripción
- **Función**: `GameEngine.joinQuickMatch(song, betAmount)`
- **Tipo de match**: `match_type: 'quick'`
- **Lógica**: Matchmaking automático que busca oponentes en cola
- **Validaciones**: 
  - ✅ Apuesta mínima: 100 MTR
  - ✅ Balance suficiente on-chain
  - ✅ Validación ELO de canciones

### 🔍 Cómo Funciona Internamente

1. **Validación de apuesta**:
   ```javascript
   const normalizedBet = Math.max(this.minBet, Math.round(betAmount || this.minBet));
   if (normalizedBet < this.minBet) {
       showToast(`Apuesta mínima: ${this.minBet} MTR`, 'error');
       return;
   }
   ```

2. **Búsqueda de oponente**:
   - Busca en `matchmaking_queue` de Supabase
   - Filtra por apuestas similares (±20%)
   - Valida ELO de canciones
   - Si encuentra oponente → crea match inmediatamente
   - Si NO encuentra → te agrega a la cola

3. **Cola de espera**:
   - Te muestra pantalla `waitingScreen`
   - Hace polling cada X segundos buscando oponente
   - Puedes cancelar la búsqueda

### 🧪 RUTA DE PRUEBA - Modo Rápido

#### Paso 1: Acceder al Modo
```
URL: https://musictokenring.xyz
1. Inicia sesión (si no estás logueado)
2. Verás el selector de modos con 4 opciones
3. Haz clic en "⚔️ Modo Rápido" o ejecuta: selectMode('quick')
```

#### Paso 2: Seleccionar Canción
```
1. Busca una canción usando el buscador
2. Haz clic en una canción para seleccionarla
3. Verás la canción seleccionada en la tarjeta superior
```

#### Paso 3: Configurar Apuesta
```
1. En el campo "Apuesta (MTR)" ingresa un monto
2. Botones rápidos: 100, 500, 1K, 5K
3. VALIDACIÓN: Intenta ingresar menos de 100 MTR
   - Debe mostrar error: "Apuesta mínima: 100 MTR"
4. Ingresa 100 MTR o más
   - El botón "⚔️ Buscar Rival" se habilita
```

#### Paso 4: Iniciar Búsqueda
```
1. Haz clic en "⚔️ Buscar Rival"
2. Se ejecuta: GameEngine.joinQuickMatch(selectedSong, bet)
3. Verás pantalla "Buscando Oponente..."
```

#### Paso 5: Verificar en Consola
```javascript
// Abre DevTools (F12) y ejecuta:

// 1. Verificar que se validó la apuesta
console.log('MinBet:', GameEngine.minBet); // Debe ser 100

// 2. Verificar matchmaking
// Abre pestaña Network > Filtra por "matchmaking_queue"
// Debe haber requests a Supabase

// 3. Si hay match activo, verificar streams
const matchId = GameEngine.currentMatch?.id;
if (matchId) {
    console.log('Match ID:', matchId);
    console.log('Streams tracking:', window.StreamsRealtime?.state.activeMatches.has(matchId));
}
```

#### Paso 6: Durante la Batalla (si se encuentra oponente)
```
1. Se crea la batalla (60 segundos)
2. Se inicializa StreamsRealtime para tracking
3. Verifica en consola:
   - Requests a Deezer cada 5 segundos
   - Porcentajes de streams actualizándose
   - Health bars cambiando según streams
```

#### ✅ Checklist de Pruebas - Modo Rápido
- [ ] Validación de apuesta mínima (100 MTR) funciona
- [ ] Búsqueda de oponente se inicia correctamente
- [ ] Cola de espera funciona (si no hay oponente)
- [ ] StreamsRealtime se inicializa al iniciar batalla
- [ ] Porcentajes se actualizan cada 5 segundos
- [ ] Ganador se determina basado en % streams
- [ ] Payout on-chain funciona si ganas

---

## 🎵 MODO 2: Sala Privada (Private Room)

### 📖 Descripción
- **Función**: `GameEngine.createPrivateRoom()` o `GameEngine.joinPrivateRoom()`
- **Tipo de match**: `match_type: 'private'`
- **Lógica**: Crear sala con código o unirse a una existente
- **Validaciones**: 
  - ✅ Apuesta mínima: 100 MTR
  - ✅ Balance suficiente
  - ✅ Código de sala válido (6 caracteres)

### 🔍 Cómo Funciona Internamente

1. **Crear Sala**:
   - Genera código aleatorio de 6 caracteres (ej: "ABC123")
   - Crea match en Supabase con `status: 'waiting'`
   - Muestra pantalla `roomScreen` con código
   - Espera a que otro jugador se una

2. **Unirse a Sala**:
   - Ingresa código de 6 caracteres
   - Busca match con ese código
   - Si existe y está `waiting` → se une como player2
   - Si no existe → error

### 🧪 RUTA DE PRUEBA - Sala Privada

#### Escenario A: Crear Sala

**Paso 1: Acceder al Modo**
```
1. En el selector de modos, haz clic en "🎵 Sala Privada"
2. O ejecuta: selectMode('private')
```

**Paso 2: Seleccionar Canción y Apuesta**
```
1. Busca y selecciona una canción
2. Configura apuesta (mínimo 100 MTR)
3. Haz clic en "🎵 Crear Sala"
```

**Paso 3: Verificar Creación**
```
1. Debe mostrarte pantalla con código de sala (ej: "ABC123")
2. Verifica en consola:
   console.log('Room Code:', document.getElementById('roomCode').textContent);
3. El código debe tener 6 caracteres
```

**Paso 4: Verificar en Supabase (opcional)**
```javascript
// En consola, verifica que se creó el match:
// Abre Network > Busca requests a Supabase > matches
// Debe haber un INSERT con match_type: 'private'
```

#### Escenario B: Unirse a Sala

**Paso 1: Obtener Código**
```
1. Necesitas un código de sala existente
2. Puedes crear una sala en otra pestaña/navegador
3. O usar un código de prueba si tienes uno
```

**Paso 2: Unirse**
```
1. Selecciona modo "Sala Privada"
2. Selecciona canción y apuesta
3. Ingresa el código en el campo "Código"
4. Haz clic en "Unirse"
```

**Paso 3: Verificar Unión**
```
1. Si el código es válido → inicia batalla
2. Si no existe → muestra error
3. Verifica en consola los logs
```

#### ✅ Checklist de Pruebas - Sala Privada
- [ ] Crear sala genera código válido
- [ ] Validación de apuesta mínima funciona
- [ ] Unirse a sala con código válido funciona
- [ ] Error al unirse con código inválido
- [ ] StreamsRealtime se inicializa en batalla privada
- [ ] Payout funciona al ganar

---

## 🎯 MODO 3: Modo Práctica (Practice)

### 📖 Descripción
- **Función**: `GameEngine.startPracticeMatch(userSong, demoBet)`
- **Tipo de match**: `match_type: 'practice'`
- **Lógica**: Batalla contra CPU sin riesgo real
- **Validaciones**: 
  - ✅ Apuesta mínima: 100 MTR (pero usa saldo demo)
  - ✅ Saldo demo suficiente (inicial: 1000 MTR)
  - ✅ NO requiere wallet conectada

### 🔍 Cómo Funciona Internamente

1. **Saldo Demo**:
   - Inicial: 1000 MTR demo
   - Se guarda en `localStorage: 'mtr_practice_demo_balance'`
   - Si ganas: +50 MTR demo
   - Si pierdes: -apuesta MTR demo

2. **Oponente CPU**:
   - Selecciona canción aleatoria basada en ELO
   - No requiere otro jugador real
   - La batalla se ejecuta localmente

3. **Sin Payout Real**:
   - No se envía payout on-chain
   - Solo actualiza saldo demo
   - Perfecto para pruebas sin riesgo

### 🧪 RUTA DE PRUEBA - Modo Práctica

#### Paso 1: Acceder al Modo
```
1. En selector de modos, haz clic en "🎯 Modo Práctica"
2. O ejecuta: selectMode('practice')
3. NO requiere wallet conectada
```

#### Paso 2: Verificar Saldo Demo
```javascript
// En consola:
console.log('Saldo demo:', GameEngine.practiceDemoBalance);
// Debe ser 1000 MTR inicialmente
```

#### Paso 3: Seleccionar Canción y Apuesta
```
1. Busca y selecciona una canción
2. Configura apuesta (mínimo 100 MTR)
3. Haz clic en "🎯 Iniciar Práctica"
```

#### Paso 4: Durante la Batalla
```
1. Se inicia batalla contra CPU inmediatamente
2. Verifica en consola:
   console.log('Match type:', GameEngine.currentMatch?.match_type);
   // Debe ser 'practice'
   
3. Verifica streams tracking:
   const matchId = GameEngine.currentMatch?.id;
   if (matchId) {
       console.log('Streams:', window.StreamsRealtime?.getStreamPercentages(matchId));
   }
```

#### Paso 5: Verificar Resultado
```
1. Al terminar (60 segundos), verifica:
   - Si ganas: +50 MTR demo
   - Si pierdes: -apuesta MTR demo
2. Verifica saldo demo actualizado:
   console.log('Nuevo saldo demo:', GameEngine.practiceDemoBalance);
```

#### ✅ Checklist de Pruebas - Modo Práctica
- [ ] Funciona sin wallet conectada
- [ ] Saldo demo inicial es 1000 MTR
- [ ] Validación de apuesta mínima funciona
- [ ] Batalla se inicia inmediatamente (sin esperar oponente)
- [ ] StreamsRealtime funciona en práctica
- [ ] Saldo demo se actualiza correctamente
- [ ] NO se envía payout on-chain (correcto)

---

## 🏆 MODO 4: Torneo (Tournament)

### 📖 Descripción
- **Función**: `GameEngine.joinTournament(tournamentId, song, betAmount)`
- **Tipo de match**: `match_type: 'tournament'`
- **Lógica**: Unirse a torneo existente con ID
- **Validaciones**: 
  - ✅ Apuesta mínima: 100 MTR
  - ✅ Torneo existe en Supabase
  - ✅ Torneo tiene espacio disponible

### 🔍 Cómo Funciona Internamente

1. **Requiere ID de Torneo**:
   - Debe existir en tabla `tournaments` de Supabase
   - Verifica que el torneo esté abierto
   - Verifica que haya espacio

2. **Entry Fee**:
   - La apuesta es la entrada al torneo
   - Se suma al prize pool del torneo

### 🧪 RUTA DE PRUEBA - Torneo

#### Paso 1: Acceder al Modo
```
1. En selector de modos, haz clic en "🏆 Torneo"
2. O ejecuta: selectMode('tournament')
```

#### Paso 2: Necesitas ID de Torneo
```
⚠️ IMPORTANTE: Este modo requiere un torneo existente en Supabase

Opciones:
1. Crear un torneo manualmente en Supabase
2. Usar un ID de torneo existente
3. Omitir esta prueba si no hay torneos disponibles
```

#### Paso 3: Unirse al Torneo
```
1. Selecciona canción y apuesta
2. Ingresa el ID del torneo en el campo
3. Haz clic en "🏆 Unirme"
```

#### Paso 4: Verificar
```
1. Si el torneo existe → te une
2. Si no existe → muestra error
3. Verifica en consola los logs
```

#### ✅ Checklist de Pruebas - Torneo
- [ ] Validación de apuesta mínima funciona
- [ ] Error si torneo no existe
- [ ] Error si torneo está lleno
- [ ] Unión exitosa si torneo válido
- [ ] StreamsRealtime funciona en torneo

---

## 🔧 Comandos Útiles para Pruebas

### Acceder directamente a un modo:
```javascript
// En la consola del navegador:
selectMode('quick');    // Modo Rápido
selectMode('private');  // Sala Privada
selectMode('practice'); // Modo Práctica
selectMode('tournament'); // Torneo
```

### Verificar estado actual:
```javascript
// Modo actual
console.log('Modo actual:', window.currentMode);

// Canción seleccionada
console.log('Canción:', selectedSong);

// Match actual
console.log('Match:', GameEngine.currentMatch);

// Streams activos
console.log('Matches trackeados:', Array.from(window.StreamsRealtime?.state.activeMatches.keys() || []));
```

### Simular selección de canción:
```javascript
// Simular canción para pruebas
selectedSong = {
    id: '123456',
    name: 'Test Song',
    artist: 'Test Artist',
    image: 'https://example.com/image.jpg',
    preview: 'https://example.com/preview.mp3'
};
document.querySelectorAll('#actionButtons button').forEach(btn => btn.disabled = false);
```

---

## 📊 Matriz de Pruebas por Modo

| Modo | Requiere Wallet | Requiere Otro Jugador | Apuesta Mínima | Streams Real-time | Payout On-chain |
|------|----------------|----------------------|----------------|-------------------|-----------------|
| **Quick** | ✅ Sí | ✅ Sí (matchmaking) | 100 MTR | ✅ Sí | ✅ Sí (si ganas) |
| **Private** | ✅ Sí | ✅ Sí (código sala) | 100 MTR | ✅ Sí | ✅ Sí (si ganas) |
| **Practice** | ❌ No | ❌ No (vs CPU) | 100 MTR (demo) | ✅ Sí | ❌ No (solo demo) |
| **Tournament** | ✅ Sí | ✅ Sí (torneo) | 100 MTR | ✅ Sí | ✅ Sí (si ganas) |

---

## 🎯 Ruta Recomendada para Pruebas Completas

### Orden de Pruebas (de más fácil a más complejo):

1. **🎯 Modo Práctica** (MÁS FÁCIL - No requiere wallet ni otro jugador)
   - Perfecto para probar validaciones y streams
   - No hay riesgo real
   - Se puede probar inmediatamente

2. **🎵 Sala Privada - Crear** (FÁCIL - Solo necesitas crear)
   - Prueba creación de sala
   - Verifica código generado
   - Puedes probar unirte en otra pestaña

3. **⚔️ Modo Rápido** (MEDIO - Requiere wallet y posible espera)
   - Prueba matchmaking
   - Puede requerir esperar oponente
   - Mejor con 2 navegadores/pestañas

4. **🏆 Torneo** (COMPLEJO - Requiere torneo existente)
   - Solo si tienes torneos configurados
   - Puede omitirse si no hay torneos

---

## 🐛 Troubleshooting por Modo

### Modo Rápido no encuentra oponente:
- **Causa**: No hay otros jugadores en cola
- **Solución**: Abre otra pestaña/navegador y busca también
- **O**: Espera en la cola (polling automático)

### Sala Privada no funciona:
- **Causa**: Código incorrecto o sala cerrada
- **Solución**: Verifica que el código tenga 6 caracteres exactos
- **O**: Crea una nueva sala

### Modo Práctica no inicia:
- **Causa**: Saldo demo insuficiente
- **Solución**: Se resetea automáticamente a 1000 MTR si está en 0

### Torneo no funciona:
- **Causa**: Torneo no existe o está lleno
- **Solución**: Verifica el ID del torneo en Supabase

---

## ✅ Checklist General de Pruebas

### Para TODOS los modos:
- [ ] Validación de apuesta mínima (100 MTR) funciona
- [ ] StreamsRealtime se inicializa al iniciar batalla
- [ ] Porcentajes de streams se actualizan cada 5 segundos
- [ ] Ganador se determina basado en % streams reales
- [ ] Error handling funciona correctamente

### Específico por modo:
- [ ] **Quick**: Matchmaking funciona
- [ ] **Private**: Crear y unirse funciona
- [ ] **Practice**: Saldo demo funciona correctamente
- [ ] **Tournament**: Unirse a torneo funciona (si hay torneos)

---

## 📝 Notas Finales

- Todos los modos validan apuesta mínima de **100 MTR**
- Todos los modos (excepto práctica) requieren **wallet conectada**
- Todos los modos usan **StreamsRealtime** para datos en tiempo real
- El modo **Práctica** es el mejor para pruebas iniciales (sin riesgo)
