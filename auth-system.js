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
        // Usuario no logueado
        console.log('User logged out');

        document.getElementById('loginWall')?.classList.remove('hidden');
        document.getElementById('modeSelector')?.classList.add('hidden');
        
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
        // CRÍTICO: Usar user_credits en lugar de user_balances para obtener el saldo REAL
        // El perfil SIEMPRE debe mostrar créditos reales, nunca el saldo de práctica
        const { data: creditsData } = await supabaseClient
            .from('user_credits')
            .select('credits')
            .eq('user_id', user.id)
            .maybeSingle();
        
        // Obtener balance real (créditos estables)
        const realBalance = creditsData?.credits || 0;

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

        // CRÍTICO: Mostrar siempre el saldo REAL de user_credits, nunca el saldo de práctica
        // Asegurar que nunca se muestre practiceDemoBalance en el perfil
        const displayBalance = realBalance;
        
        // Verificar que no estamos mostrando el saldo de práctica por error
        if (typeof window.GameEngine !== 'undefined' && window.GameEngine.practiceDemoBalance) {
            console.log('[loadPlayerProfile] ⚠️ Detectado practiceDemoBalance, asegurando que no se use en perfil');
        }
        
        setProfileValue('profileBalance', `${Math.round(displayBalance)} MTR`);
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
            setProfileValue('profileBalance', 'No disponible');
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
