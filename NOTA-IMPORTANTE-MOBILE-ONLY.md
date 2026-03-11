# ⚠️ NOTA IMPORTANTE: Flujo Exclusivo para Móviles

## 🎯 DECISIÓN DE DISEÑO

**El sistema de vinculación wallet-usuario es EXCLUSIVO para dispositivos móviles.**

**Razón:** En PC el comportamiento es diferente y funciona bien sin necesidad de cambios.

---

## 📱 DETECCIÓN DE DISPOSITIVO MÓVIL

### Cómo se Detecta:

```javascript
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
```

**O en backend:**
```javascript
const userAgent = req.headers['user-agent'] || '';
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
```

---

## 🔄 COMPORTAMIENTO POR DISPOSITIVO

### En PC (Desktop):

```
Comportamiento NORMAL (sin cambios):
├─ Usuario se loguea con Google → Sesión Supabase
├─ Usuario conecta wallet → Funciona normalmente
├─ No hay auto-vinculación (no es necesario)
└─ Todo funciona como antes ✅
```

**Lógica aplicada:**
- ✅ NO intenta wallet link si no hay sesión
- ✅ NO muestra banner de wallet vinculada
- ✅ Funciona exactamente como antes
- ✅ Sin cambios en comportamiento

---

### En Móvil (Mobile):

```
Comportamiento MEJORADO (con wallet link):
├─ Usuario se loguea con Google → Sesión Supabase
├─ Usuario conecta wallet → Auto-vinculación ✅
├─ Wallet abre navegador interno → Sistema usa wallet link ✅
├─ Muestra estado de autenticación ✅
└─ Usuario puede operar sin sesión Google ✅
```

**Lógica aplicada:**
- ✅ Auto-vinculación cuando usuario conecta wallet y está autenticado
- ✅ Verifica wallet link si no hay sesión Supabase
- ✅ Muestra UI de estado de autenticación
- ✅ Funciona en navegadores internos de wallets

---

## 🔍 DÓNDE SE APLICA LA DETECCIÓN

### Frontend (`src/credits-system.js`):

1. **`loadBalance()`:**
   - Solo verifica wallet link si `isMobile === true`
   - PC: Funciona como antes

2. **`getUserId()`:**
   - Solo auto-vincula wallet si `isMobile === true`
   - Solo verifica wallet link si `isMobile === true`
   - PC: Funciona como antes

3. **`claimCredits()`:**
   - Usa `getUserId()` que ya tiene detección móvil
   - PC: Funciona como antes

### Frontend (`index.html`):

1. **`renderWallet()`:**
   - Solo auto-vincula wallet si `isMobile === true`
   - PC: No intenta auto-vinculación

### Backend (`server-auto.js`):

1. **`GET /api/user/credits/:walletAddress`:**
   - Solo verifica wallet link si `isMobile === true` (detectado por user-agent)
   - PC: Funciona como antes (busca en users.wallet_address)

---

## ✅ GARANTÍAS

### PC (Desktop):

- ✅ **Sin cambios en comportamiento**
- ✅ **Funciona exactamente como antes**
- ✅ **No intenta wallet link**
- ✅ **No muestra UI adicional**
- ✅ **Experiencia idéntica a antes**

### Móvil:

- ✅ **Auto-vinculación cuando corresponde**
- ✅ **Funciona en navegadores internos**
- ✅ **Muestra estado de autenticación**
- ✅ **Experiencia mejorada**

---

## 🧪 CÓMO PROBAR

### En PC:

1. Abre plataforma en Chrome/Firefox (PC)
2. Loguea con Google
3. Conecta wallet
4. **Verifica:** NO intenta auto-vinculación
5. **Verifica:** Funciona normalmente como antes

### En Móvil:

1. Abre plataforma en Chrome móvil
2. Loguea con Google
3. Conecta wallet
4. **Verifica:** Auto-vincula wallet
5. Abre desde navegador interno de wallet
6. **Verifica:** Funciona sin sesión Google
7. **Verifica:** Muestra estado de autenticación

---

## 📋 CHECKLIST DE VERIFICACIÓN

### PC (Desktop):
- [ ] No intenta wallet link automáticamente
- [ ] No muestra banner de wallet vinculada
- [ ] Funciona exactamente como antes
- [ ] Sin errores en consola relacionados con wallet link

### Móvil:
- [ ] Auto-vincula wallet cuando usuario está autenticado
- [ ] Funciona en navegador interno de wallet
- [ ] Muestra estado de autenticación
- [ ] Usuario puede operar sin sesión Google

---

## 🎯 CONCLUSIÓN

**El sistema está diseñado para:**
- ✅ **PC:** Sin cambios, funciona como antes
- ✅ **Móvil:** Mejora con wallet link para navegadores internos

**La detección de dispositivo asegura que:**
- PC no se ve afectado
- Móvil tiene la funcionalidad mejorada
- Ambos funcionan correctamente

---

**¿Quieres que ejecute la migración SQL ahora para crear la tabla `user_wallets`?**
