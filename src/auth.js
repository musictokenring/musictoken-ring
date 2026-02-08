// =========================================
// AUTH - Registro e Inicio de Sesión con Supabase
// =========================================

// Inicializa Supabase (pon tu URL y anon key reales)
const supabaseUrl = 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const supabaseAnonKey = 'TU_ANON_KEY_PÚBLICA_AQUÍ';  // ← CAMBIA ESTO (la encuentras en Supabase → Settings → API)

const supabase = supabase.createClient(supabaseUrl, supabaseAnonKey);

// Función para mostrar/ocultar modal de auth (agrega esto al HTML después)
function toggleAuthModal(show = true) {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.toggle('hidden', !show);
  }
}

// Registro con email y password
async function registerUser() {
  const email = document.getElementById('regEmail')?.value?.trim();
  const password = document.getElementById('regPassword')?.value?.trim();

  if (!email || !password) {
    showToast('Completa email y contraseña', 'error');
    return;
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + '/dashboard.html'  // redirige aquí después de confirmar email
      }
    });

    if (error) throw error;

    showToast('¡Registrado! Revisa tu correo para confirmar', 'success');
    toggleAuthModal(false);
  } catch (err) {
    console.error('Error registro:', err);
    showToast(err.message || 'Error al registrarte', 'error');
  }
}

// Login con email y password
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

    showToast('¡Bienvenido!', 'success');
    toggleAuthModal(false);

    // Redirigir a dashboard o recargar página principal
    window.location.href = '/dashboard.html';  // crea esta página después
  } catch (err) {
    console.error('Error login:', err);
    showToast(err.message || 'Error al ingresar', 'error');
  }
}

// Verificar si hay sesión activa (llamar al cargar páginas protegidas)
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session) {
    console.log('Usuario logueado:', session.user.email);
    // Puedes mostrar nombre o avatar en la UI
    document.getElementById('userDisplay')?.innerHTML = `Hola, ${session.user.email.split('@')[0]}`;
    return session;
  } else {
    console.log('No hay sesión');
    // Mostrar botón de login o redirigir
    toggleAuthModal(true);
    return null;
  }
}

// Logout
async function logoutUser() {
  await supabase.auth.signOut();
  localStorage.removeItem('sb-session');
  showToast('Sesión cerrada', 'info');
  window.location.href = '/';
}

// Listener para cambios de auth (ej. después de confirmar email)
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    localStorage.setItem('sb-session', JSON.stringify(session));
    window.location.href = '/dashboard.html';
  }
  if (event === 'SIGNED_OUT') {
    localStorage.removeItem('sb-session');
  }
});

// Inicializar al cargar cualquier página
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});