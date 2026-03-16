// =========================================
// AUTH SYSTEM - MusicToken Ring
// Sistema de autenticación completo
// =========================================

// Modal control functions (must be global)
function openAuthModal() {
    document.getElementById('authModal')?.classList.remove('hidden');
}

const playerProfileLoadStateByUser = new Map();
let activeProfileUserId = null;

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

function updateAuthUI(session) {
    const authButton = document.getElementById('authButton');

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

        let matchesData = [];
        let matchesError = null;

        const baseMatchQuery = () => supabaseClient
            .from('matches')
            .select('id, winner, match_type, total_pot, player1_id, player2_id, player1_bet, player2_bet, finished_at, status')
            .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
            .eq('status', 'finished')
            .neq('match_type', 'practice') // EXCLUIR batallas de práctica de las estadísticas reales
            .order('finished_at', { ascending: false })
            .limit(50);

        ({ data: matchesData, error: matchesError } = await baseMatchQuery());

        if (matchesError && matchesError.code === '42703') {
            console.warn('Esquema de columnas de matches desactualizado. Reintentando con consulta mínima:', matchesError.message);
            ({ data: matchesData, error: matchesError } = await supabaseClient
                .from('matches')
                .select('id, winner, match_type, player1_id, player2_id, player1_bet, player2_bet, finished_at, status')
                .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
                .eq('status', 'finished')
                .neq('match_type', 'practice') // EXCLUIR batallas de práctica de las estadísticas reales
                .order('finished_at', { ascending: false })
                .limit(50));
        }

        if (matchesError) throw matchesError;

        const matches = matchesData || [];
        const totalMatches = matches.length;
        const wins = matches.filter((m) => {
            const isP1 = m.player1_id === user.id;
            return (isP1 && m.winner === 1) || (!isP1 && m.winner === 2);
        }).length;
        const losses = Math.max(0, totalMatches - wins);
        const winRate = totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(1) : '0.0';
        const totalStreams = 0;
        const totalWagered = matches.reduce((acc, m) => {
            const isP1 = m.player1_id === user.id;
            return acc + (isP1 ? (m.player1_bet || 0) : (m.player2_bet || 0));
        }, 0);

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
        setProfileValue('profileStreams', `${Math.round(totalStreams).toLocaleString('es-ES')}`);
        setProfileValue('profileWagered', `${Math.round(totalWagered)} MTR`);

        const recentMatches = document.getElementById('profileRecentMatches');
        if (recentMatches) {
            if (!matches.length) {
                recentMatches.innerHTML = '<p class="profile-empty">Aún no hay partidas finalizadas.</p>';
            } else {
                recentMatches.innerHTML = matches.slice(0, 5).map((m) => {
                    const isP1 = m.player1_id === user.id;
                    const won = (isP1 && m.winner === 1) || (!isP1 && m.winner === 2);
                    const mode = m.match_type === 'practice' ? 'Práctica' : (m.match_type || 'Modo').toUpperCase();
                    const ownBet = isP1 ? (m.player1_bet || 0) : (m.player2_bet || 0);
                    return `<div class="profile-match ${won ? 'win' : 'loss'}">
                        <span>${won ? '✅ Victoria' : '❌ Derrota'} · ${mode}</span>
                        <span>${ownBet} MTR</span>
                    </div>`;
                }).join('');
            }
        }
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
