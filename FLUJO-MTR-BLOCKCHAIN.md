# 🔗 Flujo de Interacción con MTR en Blockchain Real

## 📋 RESUMEN EJECUTIVO

Este documento explica **cómo funciona actualmente** el sistema y **cómo debería funcionar** si se implementara la interacción completa con tokens MTR en blockchain real durante las apuestas.

---

## 🔄 FLUJO ACTUAL (Sistema de Créditos)

### Estado Actual del Sistema

**Modalidad:** Base de Datos Centralizada con Créditos

El sistema actualmente **NO interactúa directamente con tokens MTR en blockchain** durante las apuestas. En su lugar, utiliza un sistema de créditos almacenados en base de datos.

### Flujo Actual de Apuestas

#### 1. **Usuario Inicia Apuesta**

```
Usuario → Selecciona canción → Ingresa cantidad de apuesta → Click "Buscar Rival"
```

**Validación:**
- Verifica que tenga suficientes **créditos** en base de datos (NO MTR on-chain)
- Verifica que la apuesta sea >= 5 créditos
- Verifica que haya seleccionado una canción

**Código relevante:**
```javascript
// game-engine.js - joinQuickMatch()
async hasSufficientCredits(betAmount) {
    const credits = window.CreditsSystem.currentCredits || 0;
    if (Number(betAmount) > credits) {
        showToast(`Créditos insuficientes. Disponible: ${credits.toFixed(2)} créditos`, 'error');
        return false;
    }
    return true;
}
```

#### 2. **Creación del Match**

**Proceso:**
1. Se busca oponente en la cola de matchmaking
2. Cuando se encuentra oponente, se crea el match en base de datos
3. **ANTES de crear el match**, se deducen los créditos del usuario

**Código relevante:**
```javascript
// game-engine.js - createMatch()
async createMatch(type, player1Id, player2Id, song1, song2Data, bet1, bet2) {
    // CRÍTICO: Descontar créditos ANTES de crear el match
    const deductionSuccess = await this.updateBalance(-bet1, 'bet', null);
    if (!deductionSuccess) {
        // Abortar si falla la deducción
        return;
    }
    
    // Crear match en base de datos
    const { data: match } = await supabaseClient.from('matches').insert([{
        match_type: type,
        player1_bet: bet1,
        player2_bet: bet2,
        total_pot: bet1 + bet2,
        status: 'ready'
    }]);
}
```

#### 3. **Deducción de Créditos**

**Método:** `updateBalance(-betAmount, 'bet', matchId)`

**Proceso:**
- Llama al backend: `POST /api/user/deduct-credits`
- El backend ejecuta: `decrement_user_credits(userId, betAmount)`
- Los créditos se deducen de la tabla `user_credits` en Supabase
- **NO hay transacción blockchain en este paso**

#### 4. **Ejecución del Match**

- Los usuarios compiten durante 60 segundos
- Se determina el ganador basado en streams/plays
- El resultado se guarda en la tabla `matches`

#### 5. **Procesamiento de Premios**

**Ganador:**
- Se calcula el pozo total: `total_pot = player1_bet + player2_bet`
- Se calcula fee de plataforma (2%): `platformFee = total_pot * 0.02`
- Se calcula premio del ganador: `winnerPayout = total_pot - platformFee`
- **Se otorgan CRÉDITOS al ganador** (NO MTR on-chain)

**Código relevante:**
```javascript
// game-engine.js - finalizeBattle()
if (userWon) {
    const creditsWon = payouts.winnerPayout;
    await this.awardCredits(creditsWon, match.id);
}

async awardCredits(credits, matchId) {
    // Llama al backend para agregar créditos
    await fetch(`${backendUrl}/api/user/add-credits`, {
        method: 'POST',
        body: JSON.stringify({
            userId,
            credits: credits,
            reason: 'match_win',
            matchId: matchId
        })
    });
}
```

**Perdedor:**
- Ya perdió sus créditos cuando se creó el match
- No recibe reembolso

#### 6. **Fee al Vault**

- El fee de apuesta (2%) se envía al vault
- Se registra en la tabla `vault_fees`
- **NO hay transacción blockchain inmediata**, se acumula en el vault

---

## 🚀 FLUJO PROPUESTO (Con MTR Real en Blockchain)

### Cambios Necesarios

Para que el sistema interactúe con tokens MTR reales en blockchain, se necesitarían los siguientes cambios:

### 1. **Al Iniciar Apuesta**

**Cambio necesario:**
- En lugar de verificar créditos en BD, verificar balance MTR on-chain
- Solicitar aprobación del contrato MTR si es necesario
- Transferir MTR del usuario a un contrato de escrow o a la wallet de la plataforma

**Flujo propuesto:**
```
Usuario → Selecciona canción → Ingresa apuesta → Click "Buscar Rival"
    ↓
Verificar balance MTR on-chain
    ↓
Solicitar approve() al contrato MTR (si no está aprobado)
    ↓
Transferir MTR a contrato de escrow o wallet de plataforma
    ↓
Esperar confirmación de transacción
    ↓
Crear match en base de datos
```

### 2. **Contrato de Escrow (Recomendado)**

**Arquitectura propuesta:**

```
┌─────────────────┐
│  Usuario Wallet │
│  1000 MTR       │
└────────┬────────┘
         │
         │ transfer(escrow, 50 MTR)
         │
         ▼
┌─────────────────┐
│ Escrow Contract │
│  - Player1: 50  │
│  - Player2: 50  │
│  - Total: 100   │
└────────┬────────┘
         │
         │ (Después del match)
         │
         ▼
┌─────────────────┐
│  Winner Wallet  │
│  98 MTR         │
└─────────────────┘
         │
         │
         ▼
┌─────────────────┐
│ Platform Wallet │
│  2 MTR (fee)    │
└─────────────────┘
```

### 3. **Flujo Completo con MTR Real**

#### **Paso 1: Usuario Inicia Apuesta**

```javascript
// 1. Verificar balance MTR on-chain
const mtrBalance = await publicClient.readContract({
    address: MTR_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [userWallet]
});

if (mtrBalance < betAmount) {
    throw new Error('Balance MTR insuficiente');
}

// 2. Verificar/obtener aprobación del contrato
const allowance = await publicClient.readContract({
    address: MTR_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [userWallet, ESCROW_CONTRACT_ADDRESS]
});

if (allowance < betAmount) {
    // Solicitar aprobación
    const approveHash = await walletClient.writeContract({
        address: MTR_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ESCROW_CONTRACT_ADDRESS, betAmount]
    });
    
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
}

// 3. Transferir MTR al escrow
const transferHash = await walletClient.writeContract({
    address: ESCROW_CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'depositBet',
    args: [matchId, betAmount]
});

await publicClient.waitForTransactionReceipt({ hash: transferHash });
```

#### **Paso 2: Crear Match**

- Después de confirmar la transacción, crear el match en BD
- Registrar el `tx_hash` de la transferencia
- El escrow mantiene los MTR bloqueados hasta que termine el match

#### **Paso 3: Ejecutar Match**

- Igual que actualmente (60 segundos de batalla)
- Determinar ganador basado en streams/plays

#### **Paso 4: Distribuir Premios**

**Ganador:**
```javascript
// Llamar al contrato de escrow para distribuir premios
const payoutHash = await walletClient.writeContract({
    address: ESCROW_CONTRACT_ADDRESS,
    abi: ESCROW_ABI,
    functionName: 'distributePrizes',
    args: [matchId, winnerAddress]
});

// El contrato:
// 1. Transfiere winnerPayout MTR al ganador
// 2. Transfiere platformFee MTR a la wallet de la plataforma
// 3. Quema o mantiene los MTR del perdedor
```

**Perdedor:**
- Sus MTR ya están en el escrow
- El contrato los transfiere al ganador o los quema según las reglas

---

## 🏗️ ARQUITECTURA PROPUESTA

### Opción A: Contrato de Escrow (Recomendado)

**Ventajas:**
- ✅ Descentralizado - Los fondos están en un contrato inteligente
- ✅ Transparente - Todas las transacciones son visibles en blockchain
- ✅ Seguro - No requiere confianza en la plataforma
- ✅ Automático - El contrato distribuye premios automáticamente

**Desventajas:**
- ⚠️ Requiere desarrollo de contrato inteligente
- ⚠️ Fees de gas para cada apuesta
- ⚠️ Más complejo de implementar

**Contrato propuesto:**
```solidity
contract MatchEscrow {
    struct Match {
        address player1;
        address player2;
        uint256 bet1;
        uint256 bet2;
        uint256 totalPot;
        address winner;
        bool resolved;
    }
    
    mapping(uint256 => Match) public matches;
    
    function depositBet(uint256 matchId, uint256 amount) external {
        // Transferir MTR del usuario al contrato
        IERC20(MTR_TOKEN).transferFrom(msg.sender, address(this), amount);
        // Registrar apuesta
        matches[matchId].bet1 = amount;
    }
    
    function distributePrizes(uint256 matchId, address winner) external {
        Match storage match = matches[matchId];
        require(!match.resolved, "Match already resolved");
        
        uint256 totalPot = match.bet1 + match.bet2;
        uint256 platformFee = totalPot * 2 / 100; // 2%
        uint256 winnerPayout = totalPot - platformFee;
        
        // Transferir al ganador
        IERC20(MTR_TOKEN).transfer(winner, winnerPayout);
        
        // Transferir fee a plataforma
        IERC20(MTR_TOKEN).transfer(PLATFORM_WALLET, platformFee);
        
        match.winner = winner;
        match.resolved = true;
    }
}
```

### Opción B: Wallet Centralizada (Actual con MTR)

**Ventajas:**
- ✅ Más simple de implementar
- ✅ Menos fees de gas (solo para premios)
- ✅ Control total de la plataforma

**Desventajas:**
- ⚠️ Requiere confianza en la plataforma
- ⚠️ Menos descentralizado
- ⚠️ Los usuarios deben transferir MTR a la plataforma antes de apostar

**Flujo propuesto:**
```
1. Usuario deposita MTR a wallet de plataforma (como depósito)
2. Plataforma mantiene balance MTR del usuario
3. Al apostar, se deducen MTR del balance interno
4. Al ganar, se acreditan MTR al balance interno
5. Usuario puede retirar MTR cuando quiera
```

---

## 📊 COMPARACIÓN: ACTUAL vs PROPUESTO

| Aspecto | Actual (Créditos) | Propuesto (MTR Real) |
|---------|-------------------|---------------------|
| **Apuesta** | Deduce créditos de BD | Transfiere MTR a escrow |
| **Premio** | Acredita créditos en BD | Transfiere MTR desde escrow |
| **Blockchain** | Solo para depósitos/retiros | Cada apuesta es una transacción |
| **Fees de Gas** | Solo en depósitos/retiros | En cada apuesta |
| **Descentralización** | Parcial (custodial) | Completa (contrato) |
| **Velocidad** | Instantáneo | Depende de confirmación blockchain |
| **Transparencia** | Base de datos privada | Todas las transacciones públicas |

---

## 🔧 IMPLEMENTACIÓN REQUERIDA

### Para Opción A (Escrow):

1. **Desarrollar Contrato Inteligente**
   - Contrato de escrow en Solidity
   - Funciones: `depositBet()`, `distributePrizes()`, `cancelMatch()`
   - Deploy en Base Network

2. **Modificar Frontend**
   - Integrar wallet connection (ya existe)
   - Agregar lógica de `approve()` y `transfer()`
   - Manejar confirmaciones de transacciones
   - Actualizar UI para mostrar transacciones pendientes

3. **Modificar Backend**
   - Endpoint para verificar transacciones de apuesta
   - Endpoint para trigger de distribución de premios
   - Monitoreo de eventos del contrato

4. **Modificar Game Engine**
   - Cambiar `hasSufficientCredits()` por `hasSufficientMTR()`
   - Cambiar `updateBalance()` por `transferMTRToEscrow()`
   - Cambiar `awardCredits()` por `distributeMTRPrizes()`

### Para Opción B (Wallet Centralizada):

1. **Modificar Deposit Listener**
   - Aceptar depósitos de MTR (ya existe parcialmente)
   - Mantener balance MTR por usuario

2. **Modificar Game Engine**
   - Usar balance MTR interno en lugar de créditos
   - Transferencias internas (sin blockchain)

3. **Modificar Claim Service**
   - Permitir retiros de MTR además de USDC

---

## ⚠️ CONSIDERACIONES IMPORTANTES

### Fees de Gas

- Cada apuesta requeriría una transacción blockchain
- En Base Network, los fees son bajos (~$0.01-0.05 por transacción)
- Pero multiplicado por muchas apuestas, puede ser significativo

### Velocidad

- Las transacciones blockchain requieren confirmación (12 segundos en Base)
- Esto podría ralentizar el proceso de matchmaking
- Se podría usar un sistema híbrido: créditos para apuestas, MTR para premios grandes

### Experiencia de Usuario

- Los usuarios necesitarían aprobar el contrato una vez
- Cada apuesta requeriría confirmar una transacción en su wallet
- Esto podría ser molesto para apuestas frecuentes

### Seguridad

- El contrato de escrow debe ser auditado
- Debe manejar casos edge (usuario desconectado, match cancelado, etc.)
- Debe prevenir ataques (reentrancy, overflow, etc.)

---

## 💡 RECOMENDACIÓN

**Sistema Híbrido:**

1. **Apuestas pequeñas (< 100 MTR):** Usar créditos (sistema actual)
   - Más rápido
   - Sin fees de gas
   - Mejor UX

2. **Apuestas grandes (>= 100 MTR):** Usar MTR real en escrow
   - Más seguro
   - Descentralizado
   - Transparente

3. **Premios grandes:** Siempre distribuir MTR real
   - Usar `prize-service.js` existente
   - Transparencia total

---

## 📝 CONCLUSIÓN

El sistema actual funciona con **créditos en base de datos**, lo cual es:
- ✅ Rápido
- ✅ Escalable
- ✅ Sin fees de gas
- ⚠️ Requiere confianza en la plataforma

Para implementar **MTR real en blockchain**, se necesitaría:
- Desarrollo de contrato de escrow
- Modificaciones significativas en frontend y backend
- Manejo de fees de gas
- Mejor UX para aprobaciones de wallet

¿Quieres que implemente alguna de estas opciones?
