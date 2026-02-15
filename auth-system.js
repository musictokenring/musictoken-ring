// =========================================
// AUTH SYSTEM - MusicToken Ring
// Sistema de autenticación completo
// =========================================

// Modal control functions (must be global)
function openAuthModal() {
    document.getElementById('authModal')?.classList.remove('hidden');
}

function closeAuthModal() {
    document.getElementById('authModal')?.classList.add('hidden');
}

function switchToSignup() {
    document.getElementById('loginForm')?.classList.add('hidden');
    document.getElementById('signupForm')?.classList.remove('hidden');
}

function switchToLogin() {
    document.getElementById('signupForm')?.classList.add('hidden');
    document.getElementById('loginForm')?.classList.remove('hidden');
}

// Initialize Supabase client (if not already initialized)
if (typeof window.supabaseClient === 'undefined') {
    const SUPABASE_URL = 'https://bscmgcnynbxalcuwdqlm.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzY21nY255bmJ4YWxjdXdkcWxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NTYwOTUsImV4cCI6MjA4NjAzMjA5NX0.1iasFQ5H0GmrFqi6poWNE1aZOtbmQuB113RCyg2BBK4';
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const supabaseClient = window.supabaseClient;

// ==========================================
// AUTH FUNCTIONS
// ==========================================

async function loginWithGoogle() {
    try {
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
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    const { error } = await supabaseClient.auth.exchangeCodeForSession(window.location.href);
    if (error) {
        console.error('OAuth callback error:', error);
        showToast('No se pudo completar el login con Google', 'error');
        return;
    }

    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, cleanUrl);
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    
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
        
    } catch (error) {
        console.error('Error logging in:', error);
        showToast(error.message || 'Error al iniciar sesión', 'error');
    }
}

async function handleSignupSubmit(event) {
    event.preventDefault();
    
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

async function logout() {
    try {
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
        if (typeof GameEngine !== 'undefined' && !GameEngine.initialized) {
            GameEngine.init();
            GameEngine.initialized = true;
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

    try {
        const [{ data: balanceData }, { data: matchesData, error: matchesError }] = await Promise.all([
            supabaseClient.from('user_balances').select('balance').eq('user_id', user.id).maybeSingle(),
            supabaseClient
                .from('matches')
                .select('id, winner, match_type, total_pot, player1_id, player2_id, player1_bet, player2_bet, finished_at, status')
                .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
                .eq('status', 'finished')
                .order('finished_at', { ascending: false })
                .limit(50)
        ]);

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

        setProfileValue('profileBalance', `${Math.round(balanceData?.balance || 0)} $MTOKEN`);
        setProfileValue('profileMatches', `${totalMatches}`);
        setProfileValue('profileWins', `${wins}`);
        setProfileValue('profileLosses', `${losses}`);
        setProfileValue('profileWinRate', `${winRate}%`);
        setProfileValue('profileStreams', `${Math.round(totalStreams).toLocaleString('es-ES')}`);
        setProfileValue('profileWagered', `${Math.round(totalWagered)} $MTOKEN`);

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
                        <span>${ownBet} $MTOKEN</span>
                    </div>`;
                }).join('');
            }
        }
    } catch (error) {
        console.error('Error loading player profile:', error);
        setProfileValue('profileBalance', 'No disponible');
    }
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

supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event);
    updateAuthUI(session);
});

// ==========================================
// INITIALIZE ON LOAD
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔐 Auth system initializing...');
    parseOAuthErrorFromUrl();
    await processOAuthCallbackIfNeeded();
    
    // Get current session
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    // Update UI
    updateAuthUI(session);
    
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
