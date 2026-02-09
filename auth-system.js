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
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        
        if (error) throw error;
    } catch (error) {
        console.error('Error logging in with Google:', error);
        showToast('Error al iniciar sesión con Google', 'error');
    }
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
        
        const user = session.user;
        const displayName = user.user_metadata?.display_name || 
                          user.user_metadata?.full_name || 
                          user.email?.split('@')[0] || 
                          'Usuario';
        const avatarUrl = user.user_metadata?.avatar_url || 
                         user.user_metadata?.picture || 
                         `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1DB954&color=fff`;
        
        authButton.innerHTML = `
            <div class="user-profile">
                <img src="${avatarUrl}" alt="${displayName}" class="user-avatar">
                <div class="user-info">
                    <div class="user-name">${displayName}</div>
                </div>
            </div>
            <button onclick="logout()" class="btn-logout">
                Salir
            </button>
        `;
        
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
