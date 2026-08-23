// =========================================
// AUTH SYSTEM - MusicToken Ring
// Sistema de autenticación completo
// =========================================

// Modal control functions (must be global)
function openAuthModal() {
    document.getElementById('authModal')?.classList.remove('hidden');
    // El botón de "Firmar con tu wallet" solo tiene sentido si hay un
    // provider inyectado (window.ethereum) -- típicamente porque estamos
    // adentro del navegador propio de MetaMask/Trust Wallet, donde Google
    // se bloquea por política propia de seguridad contra WebViews.
    var walletBtn = document.getElementById('walletSignInBtn');
    if (walletBtn) walletBtn.classList.toggle('hidden', !window.ethereum);
}

const playerProfileLoadStateByUser = new Map();
let activeProfileUserId = null;
let profileBattleHistoryCache = [];
let profileBattleFilter = 'all';

const PROFILE_BATTLE_FILTERS = [
    { id: 'all', label: 'Todos' },
    { id: 'win', label: 'Victorias' },
    { id: 'loss', label: 'Derrotas' },
    { id: 'prize', label: 'Con premio' },
    { id: 'tournament', label: 'Torneos' },
    { id: 'match', label: 'PvP' }
];

function closeAuthModal() {
    document.getElementById('authModal')?.classList.add('hidden');
}

function switchToSignup() {
    document.getElementById('loginForm')?.classList.add('hidden');
    document.getElementById('forgotPasswordForm')?.classList.add('hidden');
    document.getElementById('signupForm')?.classList.remove('hidden');
}

function switchToLogin() {
    document.getElementById('signupForm')?.classList.add('hidden');
    document.getElementById('forgotPasswordForm')?.classList.add('hidden');
    document.getElementById('loginForm')?.classList.remove('hidden');
}

function showForgotPassword() {
    document.getElementById('loginForm')?.classList.add('hidden');
    document.getElementById('signupForm')?.classList.add('hidden');
    document.getElementById('forgotPasswordForm')?.classList.remove('hidden');
}

// Función para toggle de visibilidad de contraseña
function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    const eyeIcon = button.querySelector('svg');
    
    if (input.type === 'password') {
        input.type = 'text';
        // Cambiar icono a "ojo tachado"
        eyeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.88 9.88l4.242 4.242M9.88 9.88L3 3m6.88 6.88l4.242 4.242M15 12a3 3 0 11-6 0 3 3 0 016 0zm6 0a9 9 0 11-18 0 9 9 0 0118 0z"></path>';
    } else {
        input.type = 'password';
        // Cambiar icono a "ojo normal"
        eyeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>';
    }
}

// Función para manejar recuperación de contraseña
async function handleForgotPasswordSubmit(event) {
    event.preventDefault();
    
    if (!supabaseClient) {
        supabaseClient = initSupabaseClient();
    }
    
    if (!supabaseClient) {
        showToast('Error: Supabase no está disponible. Recarga la página.', 'error');
        return;
    }
    
    const email = document.getElementById('forgotEmail').value;
    
    if (!email) {
        showToast('Por favor ingresa tu email', 'error');
        return;
    }
    
    try {
        const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}${window.location.pathname}?reset=true`
        });
        
        if (error) throw error;
        
        showToast('Se ha enviado un email con instrucciones para resetear tu contraseña. Revisa tu bandeja de entrada.', 'success');
        setTimeout(() => {
            switchToLogin();
        }, 2000);
    } catch (error) {
        console.error('Error resetting password:', error);
        showToast(error.message || 'Error al enviar email de recuperación', 'error');
    }
}

// Exportar funciones globalmente
window.switchToSignup = switchToSignup;
window.switchToLogin = switchToLogin;
window.showForgotPassword = showForgotPassword;
window.togglePasswordVisibility = togglePasswordVisibility;
window.handleForgotPasswordSubmit = handleForgotPasswordSubmit;

// Initialize Supabase client (if not already initialized)
// Esperar a que Supabase esté disponible
function initSupabaseClient() {
    if (typeof window.supabaseClient !== 'undefined') {
        return window.supabaseClient;
    }
    
    if (typeof window.supabase === 'undefined') {
        console.warn('[auth-system] Supabase SDK no está disponible aún, esperando...');
        // Esperar a que Supabase cargue
        return null;
    }
    
    const SUPABASE_URL = 'https://bscmgcnynbxalcuwdqlm.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzY21nY255bmJ4YWxjdXdkcWxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NTYwOTUsImV4cCI6MjA4NjAzMjA5NX0.1iasFQ5H0GmrFqi6poWNE1aZOtbmQuB113RCyg2BBK4';
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.supabaseClient;
}

// Intentar inicializar inmediatamente
let supabaseClient = initSupabaseClient();

// Si no está disponible, esperar a que el DOM esté listo
if (!supabaseClient && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            supabaseClient = initSupabaseClient();
            if (supabaseClient) {
                console.log('[auth-system] Supabase client inicializado después de DOMContentLoaded');
            }
        });
    } else {
        // DOM ya está listo, intentar de nuevo
        setTimeout(function() {
            supabaseClient = initSupabaseClient();
            if (supabaseClient) {
                console.log('[auth-system] Supabase client inicializado después de timeout');
            }
        }, 100);
    }
}

// ==========================================
// AUTH FUNCTIONS
// ==========================================

async function loginWithGoogle() {
    try {
        // Asegurar que supabaseClient esté inicializado
        if (!supabaseClient) {
            supabaseClient = initSupabaseClient();
        }
        
        if (!supabaseClient) {
            throw new Error('Supabase no está disponible. Recarga la página.');
        }
        
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo,
                queryParams: {
                    prompt: 'select_account'
                },
                skipBrowserRedirect: true
            }
        });
        
        if (error) throw error;

        if (data?.url) {
            showToast('Redirigiendo a Google...', 'info');
            window.location.assign(data.url);
        }
    } catch (error) {
        console.error('Error logging in with Google:', error);
        showToast('Error al iniciar sesión con Google', 'error');
    }
}

/**
 * Login por firma de wallet (Sign-In with Ethereum), sin Google y sin
 * contraseña. Pensado para cuando ya estamos adentro del navegador propio de
 * una wallet (window.ethereum disponible) -- ahí Google bloquea el login por
 * su propia política de seguridad contra WebViews embebidos, y WalletConnect
 * no hace falta porque la wallet ya está en este mismo navegador. Un solo tap
 * para firmar, no autoriza ninguna transacción ni gasta gas.
 *
 * El backend (backend/siwe-auth.js) verifica la firma y devuelve una sesión
 * REAL de Supabase -- a partir de setSession(), el resto de la app funciona
 * exactamente igual que con Google (el listener de onAuthStateChange más
 * abajo se encarga de actualizar la UI).
 */
async function signInWithWallet() {
    try {
        if (!window.ethereum) {
            showToast('No se encontró una wallet en este navegador. Abrí este sitio desde MetaMask o Trust Wallet.', 'error');
            return;
        }

        if (!supabaseClient) {
            supabaseClient = initSupabaseClient();
        }
        if (!supabaseClient) {
            throw new Error('Supabase no está disponible. Recarga la página.');
        }

        showToast('Conectando con tu wallet...', 'info');
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const address = (accounts && accounts[0] || '').toLowerCase();
        if (!address) throw new Error('No se pudo obtener la dirección de la wallet');

        const backendUrl = (window.CONFIG && window.CONFIG.BACKEND_API) || 'https://musictoken-ring.onrender.com';

        // 1. Pedir el mensaje único para firmar.
        const nonceRes = await fetch(`${backendUrl}/api/auth/wallet/nonce`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
        });
        const nonceData = await nonceRes.json().catch(() => ({}));
        if (!nonceRes.ok || !nonceData.ok) {
            throw new Error(nonceData.error || 'No se pudo iniciar el login con wallet');
        }

        // 2. Firmar (un solo tap en la wallet -- no gasta gas, no autoriza nada).
        showToast('Confirmá la firma en tu wallet...', 'info');
        const signature = await window.ethereum.request({
            method: 'personal_sign',
            params: [nonceData.message, address]
        });

        // 3. El backend verifica la firma y devuelve una sesión real de Supabase.
        const verifyRes = await fetch(`${backendUrl}/api/auth/wallet/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, signature })
        });
        const verifyData = await verifyRes.json().catch(() => ({}));
        if (!verifyRes.ok || !verifyData.ok) {
            throw new Error(verifyData.error || 'No se pudo verificar la firma');
        }

        // 4. Activar la sesión. onAuthStateChange (más abajo en este archivo)
        // se encarga de actualizar el resto de la UI, igual que con Google.
        const { error: sessionError } = await supabaseClient.auth.setSession({
            access_token: verifyData.access_token,
            refresh_token: verifyData.refresh_token
        });
        if (sessionError) throw sessionError;

        // La wallet ya quedó probada por firma -- la marcamos como conectada
        // directamente, sin pedir un "Conectar Wallet" aparte encima del login.
        window.connectedAddress = address;
        localStorage.setItem('mtr_wallet', address);
        if (typeof window.renderWallet === 'function') window.renderWallet();
        if (window.CreditsSystem && typeof window.CreditsSystem.loadBalance === 'function') {
            window.CreditsSystem.loadBalance(address);
        }

        showToast('¡Sesión iniciada con tu wallet! ✓', 'success');
        closeAuthModal();
    } catch (error) {
        console.error('[auth] Error en login por firma de wallet:', error);
        const msg = String((error && (error.message || error.code)) || 'Error al iniciar sesión con tu wallet');
        // El usuario cancelando la firma a propósito no es un error grave.
        if (/user rejected|user denied|rejected the request/i.test(msg)) {
            showToast('Firma cancelada', 'info');
        } else {
            showToast(msg, 'error');
        }
    }
}
window.signInWithWallet = signInWithWallet;

function parseOAuthErrorFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
    const errorDescription = params.get('error_description') || hashParams.get('error_description');

    if (errorDescription) {
        showToast(`Google auth: ${decodeURIComponent(errorDescription)}`, 'error');
    }
}

async function processOAuthCallbackIfNeeded() {
    if (!supabaseClient) {
        supabaseClient = initSupabaseClient();
    }
    
    if (!supabaseClient) {
        console.warn('[auth] Supabase no disponible para callback');
        return;
    }
    
    // Verificar si hay hash de reset de contraseña
    if (window.location.hash && window.location.hash.includes('type=recovery')) {
        console.log('[auth] Password reset callback detectado');
        if (typeof openAuthModal === 'function') {
            openAuthModal();
        }
        if (typeof showToast === 'function') {
            showToast('Ingresa tu nueva contraseña', 'info');
        }
        // Limpiar URL
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, cleanUrl);
        return;
    }
    
    // Manejar callback de OAuth normal
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    try {
        const { error } = await supabaseClient.auth.exchangeCodeForSession(window.location.href);
        if (error) {
            console.error('OAuth callback error:', error);
            showToast('No se pudo completar el login con Google', 'error');
            return;
        }

        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, cleanUrl);
        
        if (typeof showToast === 'function') {
            showToast('¡Bienvenido!', 'success');
        }
    } catch (e) {
        console.error('[auth] Error en exchangeCodeForSession:', e);
        showToast('Error al procesar el login', 'error');
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    
    // Asegurar que supabaseClient esté inicializado
    if (!supabaseClient) {
        supabaseClient = initSupabaseClient();
    }
    
    if (!supabaseClient) {
        showToast('Error: Supabase no está disponible. Recarga la página.', 'error');
        return;
    }
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) throw error;
        
        showToast('¡Bienvenido de vuelta!', 'success');
        closeAuthModal();
        
        // Después del login exitoso, el usuario puede conectar su wallet manualmente
        // No conectamos automáticamente para dar control al usuario
        
    } catch (error) {
        console.error('Error logging in:', error);
        showToast(error.message || 'Error al iniciar sesión', 'error');
    }
}

async function handleSignupSubmit(event) {
    event.preventDefault();
    
    // Asegurar que supabaseClient esté inicializado
    if (!supabaseClient) {
        supabaseClient = initSupabaseClient();
    }
    
    if (!supabaseClient) {
        showToast('Error: Supabase no está disponible. Recarga la página.', 'error');
        return;
    }
    
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    
    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    display_name: name
                }
            }
        });
        
        if (error) throw error;
        
        showToast('¡Cuenta creada! Revisa tu email para confirmar', 'success');
        closeAuthModal();
        
    } catch (error) {
        console.error('Error signing up:', error);
        showToast(error.message || 'Error al crear cuenta', 'error');
    }
}

// Función para resetear contraseña
async function resetPassword(email) {
    try {
        if (!supabaseClient) {
            supabaseClient = initSupabaseClient();
        }
        
        if (!supabaseClient) {
            throw new Error('Supabase no está disponible');
        }
        
        const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}${window.location.pathname}?reset=true`
        });
        
        if (error) throw error;
        
        showToast('Se ha enviado un email con instrucciones para resetear tu contraseña', 'success');
        return { success: true };
    } catch (error) {
        console.error('Error resetting password:', error);
        showToast(error.message || 'Error al enviar email de recuperación', 'error');
        return { success: false, error: error.message };
    }
}

async function logout() {
    try {
        if (!supabaseClient) {
            supabaseClient = initSupabaseClient();
        }
        
        if (!supabaseClient) {
            console.warn('[auth] Supabase no disponible para logout');
            return;
        }
        
        const { error } = await supabaseClient.auth.signOut();
        
        if (error) throw error;
        
        showToast('Sesión cerrada', 'info');
        window.location.reload();
        
    } catch (error) {
        console.error('Error logging out:', error);
        showToast('Error al cerrar sesión', 'error');
    }
}

// ==========================================
// UI UPDATE FUNCTIONS
// ==========================================

/**
 * Espera a que window.CreditsSystem exista (ver comentario en
 * updateAuthUI — se carga async vía fetch, no vía <script src>).
 * Poll simple cada 100ms hasta timeoutMs. Devuelve true si llegó a
 * tiempo, false si no.
 */
function waitForCreditsSystem(timeoutMs) {
    return new Promise(function (resolve) {
        const isReady = () => typeof window.CreditsSystem !== 'undefined' && typeof window.CreditsSystem.loadBalance === 'function';
        if (isReady()) { resolve(true); return; }
        const start = Date.now();
        const interval = setInterval(function () {
            if (isReady()) {
                clearInterval(interval);
                resolve(true);
            } else if (Date.now() - start > timeoutMs) {
                clearInterval(interval);
                resolve(false);
            }
        }, 100);
    });
}

// Guarda de secuencia: Supabase dispara onAuthStateChange varias veces
// seguidas para un mismo login (INITIAL_SESSION, SIGNED_IN, a veces
// TOKEN_REFRESHED), y updateAuthUI ahora hace un await (carga de saldo)
// antes de terminar — sin esto, dos llamadas superpuestas pueden
// resolver en cualquier orden, y la que termina último "gana" aunque
// haya arrancado antes con datos más viejos. Confirmado en vivo:
// updateAuthUI se disparaba 3 veces por login, reconstruyendo el header
// cada vez ("se reacomoda todo el encabezado") y a veces la última en
// terminar dejaba el saldo sin mostrar. Mismo patrón ya usado en
// game-engine.js para las narraciones del Host IA (mySeq).
let authUiSeq = 0;

async function updateAuthUI(session) {
    const authButton = document.getElementById('authButton');
    const mySeq = ++authUiSeq;

    if (!authButton) return;

    if (session && session.user) {
        // Usuario logueado
        console.log('User logged in:', session.user.email);

        document.getElementById('loginWall')?.classList.add('hidden');
        document.getElementById('modeSelector')?.classList.remove('hidden');
        
        // CRÍTICO: Mostrar sección de depósitos solo si hay autenticación
        const depositSection = document.getElementById('depositSectionMain');
        const depositAuthRequired = document.getElementById('depositAuthRequired');
        const depositContent = depositSection?.querySelector('.deposit-content');
        
        if (depositSection) {
            depositSection.classList.remove('hidden');
        }
        if (depositAuthRequired) {
            depositAuthRequired.classList.add('hidden');
        }
        
        // Mostrar contenido de depósitos
        if (depositContent) {
            depositContent.style.display = 'block';
        }
        
        const user = session.user;
        const displayName = user.user_metadata?.display_name || 
                          user.user_metadata?.full_name || 
                          user.email?.split('@')[0] || 
                          'Usuario';
        const avatarUrl = user.user_metadata?.avatar_url || 
                         user.user_metadata?.picture || 
                         `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1DB954&color=fff`;
        
        authButton.innerHTML = `
            <button class="user-profile" onclick="openProfileModal()" title="Ver perfil del jugador">
                <img src="${avatarUrl}" alt="${displayName}" class="user-avatar">
                <div class="user-info">
                    <div class="user-name">${displayName}</div>
                </div>
            </button>
            <button onclick="logout()" class="btn-logout">
                Salir
            </button>
        `;

        // CRÍTICO: cargar el saldo jugable (fiat/unificado) apenas se loguea,
        // y ESPERARLO antes de pintar el perfil. Antes esto SOLO pasaba
        // dentro de showLoginWall() — que no se llama en un login recién
        // hecho (acá se llama showModeSelector() en su lugar) — así que
        // CreditsSystem.currentCredits se quedaba en 0 hasta que algún otro
        // flujo lo recargara por su cuenta. Confirmado en vivo: usuario
        // logueado por primera vez veía "Fichas jugables insuficientes...
        // tenés 0.00" pese a tener saldo real.
        //
        // Un primer intento de este fix llamaba a loadBalance() sin esperarlo
        // Y DESPUÉS de loadPlayerProfile() — loadPlayerProfile lee
        // CreditsSystem.currentCredits de forma síncrona, así que capturaba
        // el 0 por defecto (currentCredits >= 0 es cierto incluso para 0,
        // así que "confiaba" en ese valor viejo) antes de que la carga real
        // terminara. Confirmado en vivo: el modal de perfil mostraba
        // "0 MTR" pese a tener $5.29 reales en la base de datos. Por eso
        // ahora se espera loadBalance() ANTES de pintar el perfil.
        // CRÍTICO (2026-08-23): credits-system.js NO se carga con un
        // <script src> normal — index.html lo trae con un fetch() al
        // backend y recién lo inyecta cuando ese fetch termina (mecanismo
        // de cache-busting ya existente, no tocarlo). auth-system.js sí
        // carga de forma normal y bloqueante, y puede reaccionar a un login
        // (sesión ya persistida, o SIGNED_IN muy rápido) ANTES de que ese
        // fetch termine. El chequeo síncrono de abajo entonces fallaba
        // SIEMPRE en ese caso, sin reintentar — confirmado en vivo con 15+
        // minutos de logs remotos: la función loadFiatBalance nunca llegó
        // a ejecutarse ni una sola vez, pese a loguearse muchas veces.
        // Se espera activamente (hasta 5s) a que CreditsSystem exista.
        const creditsSystemReady = await waitForCreditsSystem(5000);
        if (creditsSystemReady) {
            try {
                await window.CreditsSystem.loadBalance(null, session.user.id);
            } catch (err) {
                console.warn('[updateAuthUI] Error cargando saldo tras login:', err);
            }
        } else {
            console.warn('[updateAuthUI] CreditsSystem no llegó a cargar a tiempo, saldo no actualizado en este ciclo');
        }

        // Si mientras esperábamos el saldo llegó un evento de auth más
        // nuevo (ya en curso, con su propia carga de saldo corriendo),
        // esta llamada quedó obsoleta — dejar que la más nueva termine el
        // trabajo, para no pisarla con datos más viejos.
        if (mySeq !== authUiSeq) return;

        loadPlayerProfile(session.user);

        // Mostrar selector de modos
        if (typeof showModeSelector === 'function') {
            showModeSelector();
        }
        
        // Inicializar GameEngine si existe
        if (typeof GameEngine !== 'undefined') {
            GameEngine.init();
        }
    } else {
        // Usuario NO logueado - mostrar mensaje de autenticación requerida
        console.log('User logged out');

        document.getElementById('loginWall')?.classList.remove('hidden');
        document.getElementById('modeSelector')?.classList.add('hidden');
        
        const depositSection = document.getElementById('depositSectionMain');
        const depositAuthRequired = document.getElementById('depositAuthRequired');
        const depositContent = depositSection?.querySelector('.deposit-content');
        
        if (depositSection && depositAuthRequired) {
            depositSection.classList.remove('hidden'); // Mantener visible pero mostrar mensaje
            depositAuthRequired.classList.remove('hidden');
        }
        
        // Ocultar contenido de depósitos si existe
        if (depositContent) {
            depositContent.style.display = 'none';
        }
        
        authButton.innerHTML = `
            <button onclick="openAuthModal()" class="btn-login">
                Iniciar Sesión
            </button>
        `;
        
        // Mostrar login wall
        if (typeof showLoginWall === 'function') {
            showLoginWall();
        }
    }
}

async function loadPlayerProfile(user) {
    if (!user?.id) return;

    activeProfileUserId = user.id;
    
    // CRÍTICO: Verificar si este es el usuario actual y si CreditsSystem tiene el balance cargado
    // Si es así, usar ese balance directamente para garantizar consistencia con el dashboard
    let useCreditsSystemBalance = false;
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (typeof supabaseClient !== 'undefined') {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session && session.user && session.user.id === user.id) {
                // Es el usuario actual - verificar si CreditsSystem tiene balance cargado
                // SIN LIMITACIONES: Usar el balance completo sin importar qué tan grande sea
                if (typeof window.CreditsSystem !== 'undefined' && 
                    window.CreditsSystem.currentCredits !== undefined && 
                    window.CreditsSystem.currentCredits >= 0) {
                    if (isDevelopment) {
                        console.log('[loadPlayerProfile] ✅ Usuario actual, usando balance de CreditsSystem:', window.CreditsSystem.currentCredits);
                    }
                    useCreditsSystemBalance = true;
                }
            }
        } catch (e) {
            if (isDevelopment) {
                console.warn('[loadPlayerProfile] Error verificando sesión:', e);
            }
        }
    }

    const existingState = playerProfileLoadStateByUser.get(user.id);
    if (existingState?.inFlight) {
        existingState.needsReload = true;
        return existingState.promise;
    }

    const state = { inFlight: true, needsReload: false, promise: null };
    playerProfileLoadStateByUser.set(user.id, state);

    const isStaleResult = () => activeProfileUserId !== user.id;

    const profileName = document.getElementById('profileDisplayName');
    const profileEmail = document.getElementById('profileEmail');
    const profileSince = document.getElementById('profileSince');
    if (profileName) {
        profileName.textContent = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Jugador';
    }
    if (profileEmail) {
        profileEmail.textContent = user.email || 'Sin email';
    }
    if (profileSince) {
        profileSince.textContent = new Date(user.created_at).toLocaleDateString('es-ES');
    }

    const runLoad = async () => {
    try {
        // CRÍTICO: Obtener el saldo unificado (fiat + onchain + credits) igual que el dashboard
        // Esto asegura que siempre mostremos el saldo correcto y consistente
        let realBalance = 0;
        
        // PRIORIDAD 1: Si es el usuario actual y CreditsSystem tiene balance, usarlo directamente
        // Esto garantiza 100% de consistencia con el dashboard
        // CRÍTICO: SIEMPRE usar CreditsSystem si está disponible para el usuario actual
        // CRÍTICO: Verificar que CreditsSystem existe antes de acceder a currentCredits
        if (useCreditsSystemBalance && typeof window.CreditsSystem !== 'undefined' && window.CreditsSystem.currentCredits !== undefined && window.CreditsSystem.currentCredits >= 0) {
            realBalance = window.CreditsSystem.currentCredits;
            // CRÍTICO: Si CreditsSystem tiene el balance, usarlo inmediatamente sin consultar DB
            // Esto elimina el delay de 10 minutos - el perfil se actualiza instantáneamente
        } else {
            // PRIORIDAD 2: Método 1: Intentar usar función SQL unificada (si existe y migración ejecutada)
            let useRPC = false;
        try {
            const { data: unifiedBalance, error: unifiedError } = await supabaseClient
                .rpc('get_user_unified_balance', { user_id_param: user.id });
            
            if (!unifiedError && unifiedBalance !== null && unifiedBalance !== undefined) {
                realBalance = parseFloat(unifiedBalance) || 0;
                useRPC = true;
            }
        } catch (rpcError) {
            // Silenciar error en producción
        }
        
        // Método 2: Si RPC no funcionó, calcular balance unificado manualmente
        if (!useRPC) {
            // Intentar obtener datos de users (puede fallar si migración no ejecutada)
            let fiatBalance = 0;
            let onchainBalance = 0;
            
            try {
                const { data: userData, error: userError } = await supabaseClient
                    .from('users')
                    .select('saldo_fiat, saldo_onchain')
                    .eq('id', user.id)
                    .maybeSingle();
                
                if (!userError && userData) {
                    fiatBalance = parseFloat(userData.saldo_fiat || 0);
                    onchainBalance = parseFloat(userData.saldo_onchain || 0);
                }
            } catch (userError) {
                // Silenciar error en producción
            }
            
            // Obtener credits (siempre disponible)
            const { data: creditsData, error: creditsError } = await supabaseClient
                .from('user_credits')
                .select('credits')
                .eq('user_id', user.id)
                .maybeSingle();
            
            const creditsBalance = parseFloat(creditsData?.credits || 0);
            
            // Balance unificado = fiat + onchain + credits
            // Si migración no ejecutada, fiat y onchain serán 0, solo usamos credits
            realBalance = fiatBalance + onchainBalance + creditsBalance;
        }
        
        // Fallback final: Si todo falla y es el usuario actual, usar CreditsSystem
        // SIN LIMITACIONES: Usar el balance completo sin importar qué tan grande sea
        if (!useCreditsSystemBalance && realBalance === 0 && typeof window.CreditsSystem !== 'undefined' && window.CreditsSystem.currentCredits !== undefined) {
            const creditsSystemBalance = window.CreditsSystem.currentCredits || 0;
            if (creditsSystemBalance > 0) {
                realBalance = creditsSystemBalance;
            }
        }
        } // CRÍTICO: Cerrar el bloque else que empezó en la línea 493
        
        // Validación final: asegurar que el balance no sea negativo
        if (realBalance < 0) {
            realBalance = 0;
        }

        let battleHistory = [];
        let userStats = null;

        // CRÍTICO: en cuentas con wallet vinculada, las batallas/torneos se
        // registran con el id del usuario RESUELTO por wallet (el mismo que usa
        // deductUnifiedBalance/resolveCreditsUserId en el backend), que puede ser
        // distinto de user.id (el id de auth de Supabase). Si solo filtramos por
        // user.id el historial sale vacío aunque el jugador sí haya jugado.
        // window.CreditsSystem.currentUserId ya trae ese id resuelto (lo carga
        // /api/user/credits/:walletAddress, la misma fuente que el saldo del
        // header) cuando estamos viendo el perfil propio.
        var statsUserIds = [user.id];
        if (useCreditsSystemBalance &&
            typeof window.CreditsSystem !== 'undefined' &&
            window.CreditsSystem.currentUserId &&
            window.CreditsSystem.currentUserId !== user.id) {
            statsUserIds.push(window.CreditsSystem.currentUserId);
        }

        const { data: historyData, error: historyError } = await supabaseClient
            .from('player_battle_history')
            .select(
                'id, battle_kind, battle_mode, source_id, result, opponent_label, ' +
                'song_name, song_artist, credits_wagered, credits_won, placement, event_label, played_at'
            )
            .in('user_id', statsUserIds)
            .order('played_at', { ascending: false })
            .limit(200);

        if (!historyError && historyData) {
            battleHistory = historyData;
        } else if (historyError && historyError.code !== '42P01') {
            console.warn('[loadPlayerProfile] Historial de batallas:', historyError.message);
        }

        if (!battleHistory.length) {
            const orClause = statsUserIds
                .map((id) => `player1_id.eq.${id},player2_id.eq.${id}`)
                .join(',');
            const { data: matchesData, error: matchesError } = await supabaseClient
                .from('matches')
                .select('id, winner, match_type, player1_id, player2_id, player1_bet, player2_bet, finished_at, status')
                .or(orClause)
                .eq('status', 'finished')
                .neq('match_type', 'practice')
                .order('finished_at', { ascending: false })
                .limit(100);

            if (!matchesError && matchesData?.length) {
                battleHistory = matchesData.map((m) => {
                    const isP1 = statsUserIds.includes(m.player1_id);
                    const won = (isP1 && m.winner === 1) || (!isP1 && m.winner === 2);
                    return {
                        id: m.id,
                        battle_kind: 'match',
                        battle_mode: m.match_type || 'quick',
                        source_id: m.id,
                        result: won ? 'win' : 'loss',
                        opponent_label: 'Rival',
                        song_name: null,
                        credits_wagered: isP1 ? (m.player1_bet || 0) : (m.player2_bet || 0),
                        credits_won: 0,
                        event_label: String(m.match_type || 'quick').toUpperCase(),
                        played_at: m.finished_at
                    };
                });
            }
        }

        try {
            const { data: statsRows } = await supabaseClient
                .from('users')
                .select('id, total_matches, total_wins, total_losses, total_credits_won, total_streams, total_wagered')
                .in('id', statsUserIds);
            // Puede haber una fila de stats por cada id candidato (auth id vs id
            // vinculado a la wallet); nos quedamos con el maximo de cada campo en
            // vez de una sola fila, para no perder progreso que quedo registrado
            // bajo el otro id.
            if (statsRows && statsRows.length) {
                userStats = statsRows.reduce((acc, row) => ({
                    total_matches: Math.max(acc.total_matches, row.total_matches || 0),
                    total_wins: Math.max(acc.total_wins, row.total_wins || 0),
                    total_losses: Math.max(acc.total_losses, row.total_losses || 0),
                    total_credits_won: Math.max(acc.total_credits_won, row.total_credits_won || 0),
                    total_streams: Math.max(acc.total_streams, row.total_streams || 0),
                    total_wagered: Math.max(acc.total_wagered, row.total_wagered || 0)
                }), {
                    total_matches: 0, total_wins: 0, total_losses: 0,
                    total_credits_won: 0, total_streams: 0, total_wagered: 0
                });
            }
        } catch (statsErr) {
            console.warn('[loadPlayerProfile] Stats usuario:', statsErr.message);
        }

        const historyMatches = battleHistory.length;
        const historyWins = battleHistory.filter((b) => b.result === 'win').length;
        const historyLosses = battleHistory.filter((b) => b.result === 'loss').length;
        const historyPrizes = battleHistory.filter((b) => parseFloat(b.credits_won || 0) > 0).length;
        const historyWagered = battleHistory.reduce(
            (acc, b) => acc + parseFloat(b.credits_wagered || 0),
            0
        );

        const totalMatches = Math.max(historyMatches, userStats?.total_matches || 0);
        const wins = Math.max(historyWins, userStats?.total_wins || 0);
        const losses = Math.max(historyLosses, userStats?.total_losses || 0);
        const prizesReceived = historyPrizes > 0
            ? historyPrizes
            : Math.max(historyWins, userStats?.total_wins || 0);
        const winRate = totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(1) : '0.0';
        const totalStreams = userStats?.total_streams || 0;
        const totalWagered = Math.max(historyWagered, parseFloat(userStats?.total_wagered || 0));
        const totalCreditsWon = Math.max(
            battleHistory.reduce((acc, b) => acc + parseFloat(b.credits_won || 0), 0),
            parseFloat(userStats?.total_credits_won || 0)
        );

        profileBattleHistoryCache = battleHistory.slice();

        if (isStaleResult()) {
            return;
        }

        // CRÍTICO: Si es el usuario actual, SIEMPRE usar el balance del dashboard directamente
        // Esto garantiza 100% de consistencia sin importar qué tan grande sea el valor
        // PRIORIDAD ABSOLUTA: El dashboard es la fuente de verdad
        if (typeof window.CreditsSystem !== 'undefined' && window.CreditsSystem.currentCredits !== undefined) {
            const dashboardBalance = window.CreditsSystem.currentCredits;
            
            // SIEMPRE usar el balance del dashboard si está disponible (incluso si es 0)
            // SIN LIMITACIONES: Usar el balance completo sin importar qué tan grande sea
            // NO comparar diferencias - el dashboard siempre tiene prioridad para el usuario actual
            if (dashboardBalance >= 0) {
                realBalance = dashboardBalance;
            }
        }
        
        // CRÍTICO: Mostrar el mismo saldo que el header (balance unificado)
        // SIEMPRE mostrar el valor real completo sin limitaciones
        const displayBalance = realBalance;
        
        // Formatear igual que el header: usar toLocaleString para TODOS los números
        // CRÍTICO: Mostrar TODOS los dígitos, no truncar a 2 decimales si el número es grande
        // El dashboard muestra: "3024.64 MTR créditos" o "98024480.00 MTR créditos"
        let formattedBalance;
        
        // CRÍTICO: Para números grandes, mostrar TODOS los decimales significativos
        // Si tiene decimales, mostrar hasta 2. Si es entero grande, mostrar sin decimales forzados
        if (displayBalance >= 1000) {
            // Números grandes: mostrar con separadores de miles y decimales si los tiene
            const hasDecimals = displayBalance % 1 !== 0;
            formattedBalance = displayBalance.toLocaleString('es-ES', { 
                minimumFractionDigits: hasDecimals ? 2 : 0,
                maximumFractionDigits: hasDecimals ? 2 : 0
            });
        } else if (displayBalance >= 1) {
            // Números medianos: mostrar con 2 decimales si tiene decimales
            const hasDecimals = displayBalance % 1 !== 0;
            formattedBalance = hasDecimals ? displayBalance.toFixed(2) : displayBalance.toString();
        } else {
            // Números pequeños: mostrar tal cual con decimales si los tiene
            formattedBalance = displayBalance.toString();
        }
        
        // Log reducido: solo en desarrollo
        
        // Establecer el valor con ajuste automático de fuente
        setProfileValueWithAutoFont('profileBalance', `${formattedBalance} MTR`, displayBalance);
        setProfileValue('profileMatches', `${totalMatches}`);
        setProfileValue('profileWins', `${wins}`);
        setProfileValue('profileLosses', `${losses}`);
        setProfileValue('profileWinRate', `${winRate}%`);
        setProfileValue('profilePrizes', `${prizesReceived}`);
        setProfileValue(
            'profileCreditsWon',
            `${Math.round(totalCreditsWon).toLocaleString('es-ES')} MTR`
        );
        setProfileValue('profileStreams', `${Math.round(totalStreams).toLocaleString('es-ES')}`);
        setProfileValue('profileWagered', `${Math.round(totalWagered).toLocaleString('es-ES')} MTR`);

        renderProfileBattleFilters();
        renderProfileBattleHistory();
    } catch (error) {
        if (error?.name === 'AbortError' || String(error?.message || '').includes('aborted')) {
            console.warn('Carga de perfil cancelada (AbortError).');
            return;
        }
        console.error('Error loading player profile:', error);
        if (!isStaleResult()) {
            // En caso de error, intentar usar el balance del dashboard si está disponible
            if (typeof window.CreditsSystem !== 'undefined' && window.CreditsSystem.currentCredits !== undefined) {
                const dashboardBalance = window.CreditsSystem.currentCredits || 0;
                if (dashboardBalance > 0) {
                    const formattedError = dashboardBalance >= 1000 
                        ? dashboardBalance.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : dashboardBalance.toFixed(2);
                    setProfileValueWithAutoFont('profileBalance', `${formattedError} MTR`, dashboardBalance);
                    console.log('[loadPlayerProfile] ⚠️ Error cargando perfil, usando balance del dashboard:', dashboardBalance);
                } else {
                    setProfileValue('profileBalance', 'No disponible');
                }
            } else {
                setProfileValue('profileBalance', 'No disponible');
            }
        }
    } finally {
        state.inFlight = false;
        if (state.needsReload && !isStaleResult()) {
            state.needsReload = false;
            state.inFlight = true;
            state.promise = runLoad();
            return;
        }
        playerProfileLoadStateByUser.delete(user.id);
    }
    };

    state.promise = runLoad();
    return state.promise;
}

function battleModeLabel(battle) {
    const mode = String(battle.battle_mode || '').toLowerCase();
    const kind = battle.battle_kind;
    if (kind === 'tournament') {
        if (mode === 'weekly') return 'Grand Prix';
        if (mode === 'express') return 'Express';
        return 'Torneo';
    }
    if (mode === 'social') return 'Social';
    if (mode === 'private') return 'Privado';
    if (mode === 'quick') return 'Rápido';
    return battle.event_label || mode.toUpperCase() || 'PvP';
}

function formatProfileBattleDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function filterProfileBattles(list, filterId) {
    if (!list?.length) return [];
    switch (filterId) {
        case 'win':
            return list.filter((b) => b.result === 'win');
        case 'loss':
            return list.filter((b) => b.result === 'loss');
        case 'prize':
            return list.filter((b) => parseFloat(b.credits_won || 0) > 0);
        case 'tournament':
            return list.filter((b) => b.battle_kind === 'tournament');
        case 'match':
            return list.filter((b) => b.battle_kind === 'match');
        default:
            return list;
    }
}

function renderProfileBattleFilters() {
    const container = document.getElementById('profileBattleFilters');
    if (!container) return;
    container.innerHTML = PROFILE_BATTLE_FILTERS.map((f) => {
        const active = profileBattleFilter === f.id;
        return `<button type="button" class="profile-battle-filter${active ? ' active' : ''}" ` +
            `data-filter="${f.id}" onclick="setProfileBattleFilter('${f.id}')">${f.label}</button>`;
    }).join('');
}

function renderProfileBattleHistory() {
    const listEl = document.getElementById('profileBattleHistory');
    const countEl = document.getElementById('profileBattleCount');
    if (!listEl) return;

    const filtered = filterProfileBattles(profileBattleHistoryCache, profileBattleFilter);
    if (countEl) {
        countEl.textContent = `${filtered.length} registro${filtered.length === 1 ? '' : 's'}`;
    }

    if (!filtered.length) {
        listEl.innerHTML =
            '<p class="text-gray-500 text-sm py-4 text-center">Sin batallas en este filtro.</p>';
        return;
    }

    listEl.innerHTML = filtered.map((b) => {
        const won = b.result === 'win';
        const prize = parseFloat(b.credits_won || 0);
        const wagered = parseFloat(b.credits_wagered || 0);
        const mode = battleModeLabel(b);
        const title = b.event_label && b.battle_kind === 'tournament'
            ? b.event_label
            : (b.song_name || mode);
        const subtitle = b.song_artist
            ? b.song_artist
            : (b.battle_kind === 'tournament' ? 'Competencia de torneo' : 'Enfrentamiento PvP');
        const date = formatProfileBattleDate(b.played_at);
        const prizeLine = prize > 0
            ? `<span class="text-emerald-400 text-xs font-semibold">+${prize.toLocaleString('es-ES')} MTR premio</span>`
            : `<span class="text-gray-500 text-xs">${wagered.toLocaleString('es-ES')} MTR apostados</span>`;

        return `<button type="button" class="profile-battle-row ${won ? 'is-win' : 'is-loss'}" ` +
            `data-battle-id="${b.id || b.source_id}" title="${mode} · ${date}">` +
            `<div class="profile-battle-row-main">` +
            `<span class="profile-battle-icon">${won ? '✅' : '❌'}</span>` +
            `<div class="profile-battle-copy">` +
            `<strong>${won ? 'Victoria' : 'Derrota'} · ${mode}</strong>` +
            `<span>${title}${subtitle ? ' — ' + subtitle : ''}</span>` +
            `</div></div>` +
            `<div class="profile-battle-row-meta">` +
            prizeLine +
            `<span class="text-gray-500 text-xs">${date}</span>` +
            `</div></button>`;
    }).join('');
}

function setProfileBattleFilter(filterId) {
    profileBattleFilter = filterId || 'all';
    renderProfileBattleFilters();
    renderProfileBattleHistory();
}

function setProfileValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

/**
 * Establece el valor del perfil con ajuste automático de fuente
 * Si el número excede 6 dígitos, reduce el tamaño de fuente automáticamente
 * @param {string} id - ID del elemento
 * @param {string} formattedValue - Valor formateado con separadores
 * @param {number} rawValue - Valor numérico real (sin formato)
 */
function setProfileValueWithAutoFont(id, formattedValue, rawValue) {
    const el = document.getElementById(id);
    if (!el) return;
    
    // Contar dígitos del valor numérico (sin decimales ni separadores)
    const digitCount = Math.floor(Math.abs(rawValue)).toString().length;
    
    // Establecer el texto
    el.textContent = formattedValue;
    
    // Resetear estilos previos
    el.style.fontSize = '';
    el.style.lineHeight = '';
    el.style.wordBreak = '';
    
    // Ajustar tamaño de fuente automáticamente si excede 6 dígitos
    if (digitCount > 6) {
        // Calcular tamaño de fuente basado en número de dígitos
        // Base: 1rem (16px), reducir progresivamente
        let fontSize;
        if (digitCount <= 8) {
            fontSize = '0.9rem'; // 14.4px
        } else if (digitCount <= 10) {
            fontSize = '0.8rem'; // 12.8px
        } else if (digitCount <= 12) {
            fontSize = '0.7rem'; // 11.2px
        } else {
            fontSize = '0.6rem'; // 9.6px para números muy grandes
        }
        
        el.style.fontSize = fontSize;
        el.style.lineHeight = '1.2';
        el.style.wordBreak = 'break-word'; // Permitir que se rompa si es necesario
        
        console.log('[loadPlayerProfile] 🔤 Ajuste automático de fuente aplicado:', {
            digitCount: digitCount,
            fontSize: fontSize,
            rawValue: rawValue,
            formattedValue: formattedValue
        });
    } else {
        // Para números <= 6 dígitos, usar tamaño normal
        el.style.fontSize = '';
        el.style.lineHeight = '';
    }
}

function openProfileModal() {
    document.getElementById('profileModal')?.classList.remove('hidden');
    if (typeof supabaseClient !== 'undefined') {
        supabaseClient.auth.getSession().then(({ data: { session } }) => {
            if (session?.user && typeof loadPlayerProfile === 'function') {
                loadPlayerProfile(session.user);
            }
        }).catch(() => {});
    }
}

function closeProfileModal() {
    document.getElementById('profileModal')?.classList.add('hidden');
}

// ==========================================
// AUTH STATE LISTENER
// ==========================================

// Escuchar cambios de autenticación y manejar wallet
if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);
        updateAuthUI(session);

        // Si el usuario se desconecta, desconectar wallet también
        if (event === 'SIGNED_OUT') {
            if (typeof window !== 'undefined') {
                window.connectedAddress = null;
                window.connectedChainId = null;
                if (typeof window.renderWallet === 'function') {
                    window.renderWallet();
                }
            }
        }
        
        // Si el usuario se conecta, permitir conexión de wallet
        if (event === 'SIGNED_IN' && session) {
            console.log('[auth] Usuario logueado, wallet puede conectarse');
        }
    });
} else {
    // Si supabaseClient no está disponible aún, esperar
    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(function() {
                if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                    supabaseClient.auth.onAuthStateChange((event, session) => {
                        console.log('Auth state changed:', event);
                        updateAuthUI(session);
                        
                        if (event === 'SIGNED_OUT') {
                            if (typeof window !== 'undefined') {
                                window.connectedAddress = null;
                                window.connectedChainId = null;
                                if (typeof window.renderWallet === 'function') {
                                    window.renderWallet();
                                }
                            }
                        }
                    });
                }
            }, 500);
        });
    }
}

// ==========================================
// INITIALIZE ON LOAD
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔐 Auth system initializing...');
    parseOAuthErrorFromUrl();
    await processOAuthCallbackIfNeeded();
    
    // Get current session
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();

        // Update UI
        updateAuthUI(session);
    } catch (error) {
        if (error?.name === 'AbortError' || String(error?.message || '').includes('aborted')) {
            console.warn('Inicialización de sesión cancelada (AbortError).');
            return;
        }
        console.error('Error inicializando sesión:', error);
    }
    
    console.log('✅ Auth system ready!');
});

// Export functions to window
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchToSignup = switchToSignup;
window.switchToLogin = switchToLogin;
window.loginWithGoogle = loginWithGoogle;
window.handleLoginSubmit = handleLoginSubmit;
window.handleSignupSubmit = handleSignupSubmit;
window.logout = logout;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.loadPlayerProfile = loadPlayerProfile;
window.setProfileBattleFilter = setProfileBattleFilter;
