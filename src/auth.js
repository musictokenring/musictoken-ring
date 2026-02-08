// =========================================
// AUTH - Registro, Login y Gestión de Sesión con Supabase
// =========================================

// Inicialización de Supabase con tu anon key pública
const supabaseUrl = 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzY21nY255bmJ4YWxjdXdkcWxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NTYwOTUsImV4cCI6MjA4NjAzMjA5NX0.1iasFQ5H0GmrFqi6poWNE1aZOtbmQuB113RCyg2BBK4';

const supabase = supabase.createClient(supabaseUrl, supabaseAnonKey);

// =========================================
// Funciones de UI para modal (llamar desde HTML)
// =========================================

function toggleAuthModal(show = true) {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.toggle('hidden', !show);
  }
}

function showTab(tab) {
  document.getElementById('loginTab').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerTab').classList.toggle('hidden', tab !== 'register');
}

// =========================================
// Registro con email y contraseña
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
      options: {
        emailRedirectTo: window.location.origin + '/dashboard.html'  // Redirige aquí después de confirmar
      }
    });

    if (error) throw error;

    showToast('¡Registrado! Revisa tu correo para confirmar la cuenta', 'success');
    toggleAuthModal(false);
  } catch (err) {
    console.error('Error en registro:', err);
    showToast(err.message || 'Error al registrarte. Intenta de nuevo.', 'error');
  }
}

// =========================================
// Inicio de sesión
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

    // Guardar sesión
    localStorage.setItem('sb-session', JSON.stringify(data.session));

    showToast(`¡Bienvenido, ${data.user.email.split('@')[0]}!`, 'success');
    toggleAuthModal(false);

    // Redirigir a dashboard
    window.location.href = '/dashboard.html';
  } catch (err) {
    console.error('Error en login:', err);
    showToast(err.message || 'Credenciales incorrectas o error al ingresar', 'error');
  }
}

// =========================================
// Verificar sesión activa (llamar al cargar cualquier página)
// =========================================
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    console.log('Usuario logueado:', session.user.email);
    
    // Mostrar info del usuario en UI (si tienes un elemento con id="userDisplay")
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) {
      userDisplay.textContent = `Hola, ${session.user.email.split('@')[0]}`;
      userDisplay.classList.remove('hidden');
    }

    // Opcional: ocultar botón de login y mostrar logout
    const authBtn = document.getElementById('authBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    if (authBtn) authBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');

    return session;
  } else {
    console.log('No hay sesión activa');
    // Mostrar modal o botón de login
    const authBtn = document.getElementById('authBtn');
    if (authBtn) authBtn.classList.remove('hidden');
    return null;
  }
}

// =========================================
// Cerrar sesión
// =========================================
async function logoutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showToast('Error al cerrar sesión', 'error');
    return;
  }

  localStorage.removeItem('sb-session');
  showToast('Sesión cerrada', 'info');
  window.location.href = '/';
}

// =========================================
// Listener global para cambios de auth
// =========================================
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    localStorage.setItem('sb-session', JSON.stringify(session));
    // Redirigir si es necesario
    if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
      window.location.href = '/dashboard.html';
    }
  }
  if (event === 'SIGNED_OUT') {
    localStorage.removeItem('sb-session');
  }
});

// =========================================
// Inicializar al cargar la página
// =========================================
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});