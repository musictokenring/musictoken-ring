// =========================================
// AUTHENTICATION SYSTEM - MusicToken Ring
// =========================================

// Supabase client configuration
const SUPABASE_URL = 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzY21nY255bmJ4YWxjdXdkcWxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NTYwOTUsImV4cCI6MjA4NjAzMjA5NX0.1iasFQ5H0GmrFqi6poWNE1aZOtbmQuB113RCyg2BBK4';

// Initialize Supabase client (only if not already initialized)
let supabaseClient;
if (typeof window.supabaseClient === 'undefined') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabaseClient = supabaseClient;
} else {
    supabaseClient = window.supabaseClient;
}

// Auth state
let currentUser = null;

// Initialize auth on page load
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthStatus();
    setupAuthListeners();
});

// Check current auth status
async function checkAuthStatus() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (error) throw error;
        
        if (session) {
            currentUser = session.user;
            updateUIForLoggedInUser(currentUser);
        } else {
            updateUIForLoggedOutUser();
        }
    } catch (error) {
        console.error('Auth check error:', error);
        updateUIForLoggedOutUser();
    }
}

// Setup auth state listeners
function setupAuthListeners() {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event);
        
        if (session) {
            currentUser = session.user;
            updateUIForLoggedInUser(currentUser);
        } else {
            currentUser = null;
            updateUIForLoggedOutUser();
        }
    });
}

// Login with Google
async function loginWithGoogle() {
    try {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        
        if (error) throw error;
        
        showToast('Redirecting to Google...', 'success');
    } catch (error) {
        console.error('Google login error:', error);
        showToast('Error logging in with Google', 'error');
    }
}

// Login with Email
async function loginWithEmail(email, password) {
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) throw error;
        
        showToast('Login successful!', 'success');
        closeAuthModal();
    } catch (error) {
        console.error('Email login error:', error);
        showToast(error.message || 'Error logging in', 'error');
    }
}

// Sign up with Email
async function signUpWithEmail(email, password, displayName) {
    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    display_name: displayName
                }
            }
        });
        
        if (error) throw error;
        
        showToast('Account created! Check your email to verify.', 'success');
        closeAuthModal();
    } catch (error) {
        console.error('Sign up error:', error);
        showToast(error.message || 'Error creating account', 'error');
    }
}

// Logout
async function logout() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        
        if (error) throw error;
        
        showToast('Logged out successfully', 'success');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Error logging out', 'error');
    }
}

// Update UI for logged in user
function updateUIForLoggedInUser(user) {
    // Update header
    const authButton = document.getElementById('authButton');
    if (authButton) {
        const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'User';
        authButton.innerHTML = `
            <div class="user-menu">
                <div class="user-avatar">
                    ${user.user_metadata?.avatar_url ? 
                        `<img src="${user.user_metadata.avatar_url}" alt="${displayName}">` :
                        `<span>${displayName.charAt(0).toUpperCase()}</span>`
                    }
                </div>
                <span class="user-name">${displayName}</span>
                <button onclick="logout()" class="btn-logout">Logout</button>
            </div>
        `;
    }
    
    console.log('User logged in:', user.email);
}

// Update UI for logged out user
function updateUIForLoggedOutUser() {
    const authButton = document.getElementById('authButton');
    if (authButton) {
        authButton.innerHTML = `
            <button onclick="openAuthModal()" class="btn-login">
                Iniciar Sesión
            </button>
        `;
    }
    
    console.log('User logged out');
}

// Open auth modal
function openAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

// Close auth modal
function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Handle login form submit
function handleLoginSubmit(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    loginWithEmail(email, password);
}

// Handle signup form submit
function handleSignupSubmit(event) {
    event.preventDefault();
    
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const displayName = document.getElementById('signupName').value;
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    signUpWithEmail(email, password, displayName);
}

// Switch between login and signup
function switchToSignup() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('signupForm').classList.remove('hidden');
}

function switchToLogin() {
    document.getElementById('signupForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
}

// Get current user (utility function)
function getCurrentUser() {
    return currentUser;
}

// Check if user is logged in (utility function)
function isLoggedIn() {
    return currentUser !== null;
}
