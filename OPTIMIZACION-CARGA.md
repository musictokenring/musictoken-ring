# Optimización de Carga - MusicToken Ring

## 🐌 Problemas Identificados que Causan Lentitud

### 1. Tailwind CSS desde CDN (BLOQUEANTE)
- **Ubicación**: Línea 16
- **Problema**: `https://cdn.tailwindcss.com` es muy pesado y bloquea el renderizado
- **Impacto**: ALTO - Bloquea todo el parsing del HTML hasta que carga
- **Solución**: Usar Tailwind compilado o mover a `defer`

### 2. Scripts Sin Defer/Async
- **Problema**: Múltiples scripts bloquean el parsing
- **Scripts afectados**:
  - `@supabase/supabase-js@2` (línea 29)
  - `qrcode@1.5.3` (línea 31)
  - `@web3modal/standalone@2.7.1` (línea 41)
  - `@walletconnect/core@2.14.0` (línea 44)
  - `@walletconnect/ethereum-provider@2.23.6` (línea 45)

### 3. app.js Cargado Síncronamente
- **Ubicación**: Línea 918
- **Problema**: `script.async = false` fuerza carga síncrona
- **Impacto**: ALTO - Bloquea renderizado

### 4. Scripts Locales Sin Defer
- **Problema**: Scripts locales cargados sin `defer`:
  - `auth-system.js`
  - `streams-realtime.js`
  - `credits-system.js`
  - `wallet-credits-integration.js`
  - `deposit-ui.js`
  - `ramp-integration.js` (NUEVO - puede estar causando lentitud)
  - `claim-ui.js`
  - `game-engine.js`

### 5. Viem Importado como Módulo ES6
- **Ubicación**: Línea 2299
- **Problema**: `import` desde `esm.sh` puede ser lento
- **Impacto**: MEDIO

### 6. Scripts Inline Grandes
- **Problema**: Mucho código JavaScript inline en el HTML
- **Impacto**: MEDIO - Aumenta tamaño del HTML inicial

## ✅ Soluciones Propuestas

### Prioridad ALTA

1. **Mover Tailwind a defer o usar versión compilada**
2. **Agregar defer a scripts externos no críticos**
3. **Cambiar app.js a async**
4. **Agregar defer a scripts locales que no son críticos para render inicial**

### Prioridad MEDIA

5. **Optimizar carga de viem** (usar bundle local si es posible)
6. **Mover scripts inline grandes a archivos externos**

## 📊 Impacto Esperado

- **Reducción de tiempo de carga inicial**: 30-50%
- **Mejora en First Contentful Paint (FCP)**: 40-60%
- **Mejora en Time to Interactive (TTI)**: 20-40%
