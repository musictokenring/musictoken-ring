// =========================================
// AUTH - Registro, Login y Gestión de Sesión con Supabase
// =========================================

// Inicialización de Supabase
const supabaseUrl = 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzY21nY255bmJ4YWxjdXdkcWxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NTYwOTUsImV4cCI6MjA4NjAzMjA5NX0.1iasFQ5H0GmrFqi6poWNE1aZOtbmQuB113RCyg2BBK4';

const supabase = supabase.createClient(supabaseUrl, supabaseAnonKey);

// =========================================
// Funciones de UI para modal
// =========================================

function toggleAuthModal(show = true) {
  const modal = document.getElementById('authModal');
  if (modal) {
    if (show) {
      modal.classList.remove('hidden');
    } else {
      modal.classList.add('hidden');
    }
  } else {
    console.warn('Modal no encontrado');
  }
}

function showTab(tab) {
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginTabBtn = document.getElementById('loginTabBtn');
  const registerTabBtn = document.getElementById('registerTabBtn');

  if (loginTab && registerTab) {
    loginTab.classList.add('hidden');
    registerTab.classList.add('hidden');
    if (tab === 'login') loginTab.classList.remove('hidden');
    if (tab === 'register') registerTab.classList.remove('hidden');
  }

  if (loginTabBtn && registerTabBtn) {
    // Resetear estilos de ambos
    loginTabBtn.classList.remove('text-pink-500', 'border-b-2', 'border-pink-500');
    registerTabBtn.classList.remove('text-pink-500', 'border-b-2', 'border-pink-500');

    // Aplicar al activo
    if (tab === 'login') {
      loginTabBtn.classList.add('text-pink-500', 'border-b-2', 'border-pink-500');
    }
    if (tab === 'register') {
      registerTabBtn.classList.add('text-pink-500', 'border-b-2', 'border-pink-500');
    }
  }
}

// =========================================
// Registro
// =========================================
async function registerUser() {
  const email = document.getElementById('regEmail')?.value?.trim();
  const password = document.getElementById('regPassword')?.value?.trim();

  if (!email || !password || password.length < 6) {
    showToast('Completa email y contraseña (mínimo 6 caracteres)', 'error');
    return;
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + '/dashboard.html' }
    });

    if (error) throw error;

    showToast('¡Registrado! Revisa tu correo para confirmar', 'success');
    toggleAuthModal(false);
  } catch (err) {
    console.error('Error registro:', err);
    showToast(err.message || 'Error al registrarte', 'error');
  }
}

// =========================================
// Login
// =========================================
async function loginUser() {
  const email = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value?.trim();

  if (!email || !password) {
    showToast('Completa email y contraseña', 'error');
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    localStorage.setItem('sb-session', JSON.stringify(data.session));
    showToast(`¡Bienvenido, ${data.user.email.split('@')[0]}!`, 'success');
    toggleAuthModal(false);
    window.location.href = '/dashboard.html';
  } catch (err) {
    console.error('Error login:', err);
    showToast(err.message || 'Credenciales incorrectas', 'error');
  }
}

// =========================================
// Check auth al cargar página
// =========================================
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();

  const authBtn = document.getElementById('authBtn');
  const userDisplay = document.getElementById('userDisplay');
  const userName = document.getElementById('userName');

  if (session) {
    if (authBtn) authBtn.classList.add('hidden');
    if (userDisplay) {
      userDisplay.classList.remove('hidden');
      if (userName) userName.textContent = session.user.email.split('@')[0];
    }
    localStorage.setItem('user_id', session.user.id);
    return session;
  } else {
    if (authBtn) authBtn.classList.remove('hidden');
    if (userDisplay) userDisplay.classList.add('hidden');
    return null;
  }
}

// =========================================
// Logout
// =========================================
async function logoutUser() {
  await supabase.auth.signOut();
  localStorage.removeItem('sb-session');
  showToast('Sesión cerrada', 'info');
  window.location.href = '/';
}

// =========================================
// Listener de cambios de auth
// =========================================
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    localStorage.setItem('sb-session', JSON.stringify(session));
    if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
      window.location.href = '/dashboard.html';
    }
  }
  if (event === 'SIGNED_OUT') {
    localStorage.removeItem('sb-session');
  }
});

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});