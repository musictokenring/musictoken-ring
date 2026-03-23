# 🔍 Cómo Buscar los Logs de Inicialización

## ⚠️ Problema Identificado

Los logs que compartiste son de **operaciones periódicas** (deposit-sync, scans, etc.), pero **NO veo los logs de inicialización** del servidor.

Los servicios `mtr-swap` y `liquidity-manager` se inicializan **solo una vez** cuando el servidor arranca, no en cada operación periódica.

---

## 📍 Dónde Buscar los Logs de Inicialización

### En Render Dashboard:

1. **Ve a tu servicio** en Render Dashboard
2. **Haz clic en "Logs"**
3. **Busca hacia ARRIBA** en los logs (los más antiguos)
4. **Busca estos mensajes específicos:**

```
[server] Initializing automated services...
[server] 🔄 Initializing liquidity manager...
[mtr-swap] 🔄 Initializing MTR swap service...
```

---

## 🔍 Mensajes Clave a Buscar

### 1. Inicio del Servidor

Busca mensajes como:

```
==> Starting service...
==> Detected service running on port 3001
[server] Initializing automated services...
```

### 2. Inicialización de Servicios

Después del mensaje anterior, deberías ver:

```
[server] Initializing automated services...
[deposit-listener] Initializing...
[server] ✅ Vault service initialized
[server] 🔄 Initializing liquidity manager...
[server] SWAP_WALLET_PRIVATE_KEY configured: true/false
[mtr-swap] 🔄 Initializing MTR swap service...
[mtr-swap] SWAP_WALLET_PRIVATE_KEY exists: true/false
```

### 3. Finalización de Inicialización

Al final deberías ver:

```
[server] ✅ All services initialized
```

---

## 📋 Instrucciones Paso a Paso

### Paso 1: Ir a los Logs Más Antiguos

En Render Dashboard:
1. Ve a tu servicio
2. Haz clic en "Logs"
3. **Desplázate hacia ARRIBA** (los logs más antiguos están arriba)
4. Busca el momento en que el servidor se inició (después del último redeploy)

### Paso 2: Buscar Mensajes Específicos

Usa la función de búsqueda en Render (Ctrl+F o Cmd+F) y busca:

- `Initializing automated services`
- `mtr-swap`
- `liquidity-manager`
- `SWAP_WALLET_PRIVATE_KEY`

### Paso 3: Compartir los Logs de Inicialización

Copia y comparte:
- Los logs desde `[server] Initializing automated services...` hasta `[server] ✅ All services initialized`
- Cualquier mensaje que contenga `mtr-swap` o `liquidity-manager`
- Cualquier error que aparezca

---

## 🎯 Qué Deberías Ver (Si Todo Está Bien)

```
[server] Initializing automated services...
[deposit-listener] Initializing...
[server] ✅ Vault service initialized
[server] 🔄 Initializing liquidity manager...
[server] SWAP_WALLET_PRIVATE_KEY configured: true
[mtr-swap] 🔄 Initializing MTR swap service...
[mtr-swap] SWAP_WALLET_PRIVATE_KEY exists: true
[mtr-swap] SWAP_WALLET_PRIVATE_KEY length: 66
[mtr-swap] ✅ Service initialized
[mtr-swap] Swap wallet: 0x0000000000000000000000000000000000000001
[liquidity-manager] Initializing...
[liquidity-manager] Min USDC buffer: 5000 USDC
[liquidity-manager] ✅ Initialized
[server] ✅ Liquidity manager initialized
[server] ✅ All services initialized
```

---

## ⚠️ Si No Aparecen los Logs de Inicialización

### Posibles Causas:

1. **El código con logs de debug no se desplegó aún**
   - Verifica que el último commit esté en Render
   - Espera a que termine el deploy

2. **Los servicios no se están inicializando**
   - Busca errores que empiecen con `[server] ⚠️` o `[mtr-swap] ❌`
   - Comparte cualquier error que encuentres

3. **La variable SWAP_WALLET_PRIVATE_KEY no está configurada**
   - Verifica en Render → Environment que existe
   - Verifica que tenga un valor válido

---

## 🔧 Verificación Rápida en Render

1. **Ve a Environment Variables:**
   - Render Dashboard → Tu Servicio → Environment
   - Verifica que existan estas variables:
     - ✅ `SWAP_WALLET_PRIVATE_KEY`
     - ✅ `SWAP_PERCENTAGE`
     - ✅ `MIN_SWAP_AMOUNT`
     - ✅ `MAX_DAILY_SWAP`
     - ✅ `MIN_USDC_BUFFER`

2. **Verifica el Último Deploy:**
   - Render Dashboard → Tu Servicio → Events
   - Verifica que el último deploy sea reciente
   - Verifica que no haya errores en el deploy

---

## 📝 Qué Compartir

Por favor comparte:

1. **Logs desde el inicio del servidor** (busca hacia arriba en los logs)
2. **Cualquier mensaje que contenga:**
   - `Initializing automated services`
   - `mtr-swap`
   - `liquidity-manager`
   - `SWAP_WALLET_PRIVATE_KEY`
3. **Cualquier error** que aparezca durante la inicialización

---

**¿Puedes buscar los logs del inicio del servidor y compartirlos?** Los logs que compartiste son de operaciones periódicas, pero necesito ver los logs de cuando el servidor se inició para verificar que los servicios se inicializaron correctamente. 🔍
