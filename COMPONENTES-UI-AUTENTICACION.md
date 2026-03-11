# 🎨 Componentes UI para Mostrar Estado de Autenticación

## 🎯 Objetivo

Crear componentes visuales que muestren claramente al usuario que está autenticado dentro del navegador interno de la wallet, sin depender de la sesión de Google.

---

## 📋 COMPONENTES A CREAR

### 1. Componente de Estado de Sesión (Session Status Component)

**Ubicación:** Header/Navbar de la plataforma

**Funcionalidad:**
- Muestra si el usuario está autenticado
- Muestra email del usuario (si está disponible)
- Muestra método de autenticación (Google o Wallet)
- Badge de verificación visual

**Estados posibles:**
1. **Autenticado con Google:** "👤 usuario@gmail.com ✅"
2. **Autenticado con Wallet:** "👤 usuario@gmail.com 💼 (Wallet)"
3. **No autenticado:** "Iniciar Sesión"

---

### 2. Banner de Confirmación de Wallet Vinculada

**Ubicación:** Debajo del header, visible cuando wallet está vinculada

**Funcionalidad:**
- Confirma que wallet está vinculada
- Muestra wallet address
- Muestra email asociado
- Da confianza al usuario

---

### 3. Indicador de Seguridad

**Ubicación:** Cerca del botón de operaciones críticas (apostar, reclamar)

**Funcionalidad:**
- Muestra que la operación es segura
- Confirma que wallet está verificada
- Badge de "Verificado" o "Seguro"

---

## 💻 IMPLEMENTACIÓN PROPUESTA

### Función para Obtener Estado de Autenticación

```javascript
/**
 * Obtiene el estado completo de autenticación del usuario
 * Soporta tanto sesión Supabase como wallet link
 */
async function getUserAuthStatus() {
    let authStatus = {
        authenticated: false,
        method: null,
        userId: null,
        email: null,
        walletAddress: null,
        displayName: null
    };

    // 1. Intentar obtener de sesión Supabase (navegador externo)
    if (typeof supabaseClient !== 'undefined') {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session && session.user) {
                authStatus = {
                    authenticated: true,
                    method: 'google',
                    userId: session.user.id,
                    email: session.user.email,
                    walletAddress: window.connectedAddress || null,
                    displayName: session.user.email.split('@')[0]
                };
                return authStatus;
            }
        } catch (error) {
            console.warn('[auth-status] Error getting Supabase session:', error);
        }
    }

    // 2. Intentar obtener de wallet link (navegador interno)
    const walletAddress = window.connectedAddress || localStorage.getItem('mtr_wallet');
    if (walletAddress) {
        try {
            const backendUrl = window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com';
            const response = await fetch(`${backendUrl}/api/user/wallet/${walletAddress}`);
            
            if (response.ok) {
                const walletData = await response.json();
                if (walletData.linked && walletData.userId) {
                    authStatus = {
                        authenticated: true,
                        method: 'wallet',
                        userId: walletData.userId,
                        email: walletData.userEmail,
                        walletAddress: walletAddress,
                        displayName: walletData.userEmail ? walletData.userEmail.split('@')[0] : 'Usuario'
                    };
                    return authStatus;
                }
            }
        } catch (error) {
            console.warn('[auth-status] Error getting wallet link:', error);
        }
    }

    return authStatus;
}
```

---

### Componente HTML para Mostrar Estado

```html
<!-- Estado de Autenticación en Header -->
<div id="userAuthStatus" class="hidden flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
    <span class="text-green-400">✅</span>
    <div class="flex flex-col">
        <span class="text-sm font-semibold text-green-400" id="authStatusText">Sesión Activa</span>
        <span class="text-xs text-gray-400" id="authUserEmail"></span>
    </div>
</div>

<!-- Banner de Wallet Vinculada -->
<div id="walletLinkedBanner" class="hidden p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20 mb-4">
    <div class="flex items-center gap-2 mb-2">
        <span class="text-cyan-400">💼</span>
        <span class="text-sm font-semibold text-cyan-400">Wallet Verificada</span>
    </div>
    <div class="text-xs text-gray-400 space-y-1">
        <div>Wallet: <span id="linkedWalletAddress" class="font-mono"></span></div>
        <div>Vinculada a: <span id="linkedUserEmail" class="font-semibold"></span></div>
        <div class="text-green-400 mt-2">✅ Puedes usar la plataforma de forma segura desde el navegador interno de tu wallet</div>
    </div>
</div>
```

---

### Función para Actualizar UI

```javascript
/**
 * Actualiza la UI con el estado de autenticación
 */
async function updateAuthStatusUI() {
    const authStatus = await getUserAuthStatus();
    
    const statusEl = document.getElementById('userAuthStatus');
    const statusTextEl = document.getElementById('authStatusText');
    const userEmailEl = document.getElementById('authUserEmail');
    const walletBannerEl = document.getElementById('walletLinkedBanner');
    const linkedWalletEl = document.getElementById('linkedWalletAddress');
    const linkedEmailEl = document.getElementById('linkedUserEmail');
    
    if (authStatus.authenticated) {
        // Mostrar estado de autenticación
        if (statusEl) {
            statusEl.classList.remove('hidden');
            
            if (statusTextEl) {
                if (authStatus.method === 'google') {
                    statusTextEl.textContent = 'Sesión Activa (Google)';
                } else if (authStatus.method === 'wallet') {
                    statusTextEl.textContent = 'Sesión Activa (Wallet)';
                }
            }
            
            if (userEmailEl && authStatus.email) {
                userEmailEl.textContent = authStatus.email;
            }
        }
        
        // Mostrar banner de wallet vinculada si es por wallet
        if (authStatus.method === 'wallet' && walletBannerEl) {
            walletBannerEl.classList.remove('hidden');
            
            if (linkedWalletEl && authStatus.walletAddress) {
                const shortAddress = authStatus.walletAddress.slice(0, 6) + '...' + authStatus.walletAddress.slice(-4);
                linkedWalletEl.textContent = shortAddress;
            }
            
            if (linkedEmailEl && authStatus.email) {
                linkedEmailEl.textContent = authStatus.email;
            }
        }
    } else {
        // Ocultar estado si no está autenticado
        if (statusEl) statusEl.classList.add('hidden');
        if (walletBannerEl) walletBannerEl.classList.add('hidden');
    }
}

// Actualizar UI periódicamente
setInterval(updateAuthStatusUI, 5000); // Cada 5 segundos
// También actualizar cuando wallet se conecta
window.addEventListener('walletConnected', updateAuthStatusUI);
```

---

## 🎨 ESTILOS CSS SUGERIDOS

```css
/* Estado de Autenticación */
#userAuthStatus {
    animation: pulse-green 2s infinite;
}

@keyframes pulse-green {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.8; }
}

/* Banner de Wallet Vinculada */
#walletLinkedBanner {
    animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Badge de Verificación */
.verified-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 12px;
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #22c55e;
    font-size: 12px;
    font-weight: 600;
}
```

---

## 📱 EJEMPLO DE UI COMPLETA

### Header con Estado de Autenticación:

```
┌─────────────────────────────────────────────────────────┐
│ [Logo] MusicToken Ring                                  │
│                                                          │
│ ✅ Sesión Activa (Wallet)                               │
│    usuario@gmail.com                                     │
│                                                          │
│ 💼 0x1234...5678  💰 100.00 créditos                    │
└─────────────────────────────────────────────────────────┘
```

### Banner de Confirmación:

```
┌─────────────────────────────────────────────────────────┐
│ 💼 Wallet Verificada                                    │
│                                                          │
│ Wallet: 0x1234...5678                                    │
│ Vinculada a: usuario@gmail.com                          │
│                                                          │
│ ✅ Puedes usar la plataforma de forma segura desde      │
│    el navegador interno de tu wallet                   │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ BENEFICIOS PARA EL USUARIO

1. ✅ **Confianza Visual**
   - Ve claramente que está autenticado
   - Email visible confirma identidad
   - Badge de verificación muestra seguridad

2. ✅ **Transparencia**
   - Ve su wallet address
   - Ve su email asociado
   - Ve sus créditos disponibles

3. ✅ **Seguridad Perceptible**
   - Banner de "Wallet Verificada"
   - Badge de "Sesión Activa"
   - Mensaje de seguridad visible

4. ✅ **Experiencia Fluida**
   - No necesita volver a loguearse
   - Todo funciona automáticamente
   - Transición suave entre navegadores

---

## 🎯 IMPLEMENTACIÓN RECOMENDADA

### Orden de Implementación:

1. ✅ **Backend ya implementado** (wallet link service)
2. ⏳ **Función `getUserAuthStatus()`** - Obtener estado
3. ⏳ **Función `updateAuthStatusUI()`** - Actualizar UI
4. ⏳ **Componentes HTML** - Mostrar estado
5. ⏳ **Estilos CSS** - Hacer visible y atractivo
6. ⏳ **Integración** - Llamar funciones en momentos clave

---

## 📝 MOMENTOS CLAVE PARA ACTUALIZAR UI

1. **Al cargar la página**
   - Verificar estado de autenticación
   - Mostrar/ocultar componentes según estado

2. **Al conectar wallet**
   - Actualizar estado
   - Mostrar banner de wallet vinculada

3. **Al hacer login con Google**
   - Actualizar estado
   - Ocultar banner de wallet (ya tiene sesión)

4. **Periódicamente**
   - Verificar estado cada 5-10 segundos
   - Actualizar si cambia

---

## 🔒 SEGURIDAD Y CONFIANZA

### Lo que el Usuario Ve:

1. ✅ **Email visible** → Confirma que es su cuenta
2. ✅ **Wallet verificada** → Confirma seguridad
3. ✅ **Badge "Sesión Activa"** → Confirma autenticación
4. ✅ **Créditos visibles** → Confirma que es su cuenta
5. ✅ **Mensaje de seguridad** → Confirma que puede operar con confianza

### Lo que el Sistema Verifica:

1. ✅ Wallet está vinculada al userId
2. ✅ Todas las operaciones verifican vinculación
3. ✅ Auditoría completa de acciones
4. ✅ Prevención de fraude

---

## 🎯 CONCLUSIÓN

**La solución aborda tu preocupación:**

✅ Usuario ve claramente que está logueado (email + badge)
✅ No depende de Google (usa wallet link)
✅ Siente seguridad (wallet verificada, mensajes claros)
✅ Puede operar con confianza (todo funciona normalmente)
✅ Transparencia total (ve toda su información)

**¿Quieres que implemente estos componentes UI ahora para que el usuario vea claramente su estado de autenticación?**
