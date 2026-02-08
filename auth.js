// AUTH - Registro y Login con Supabase (versión limpia)

console.log('Auth.js cargado - versión segura 07-02-2026');

// Usamos la instancia global del CDN
const supabase = window.supabase;

function toggleAuthModal(show = true) {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList[show ? 'remove' : 'add']('hidden');
}

function showTab(tab) {
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginBtn = document.getElementById('loginTabBtn');
  const registerBtn = document.getElementById('registerTabBtn');

  if (loginTab && registerTab) {
    loginTab.classList.add('hidden');
    registerTab.classList.add('hidden');
    if (tab === 'login') loginTab.classList.remove('hidden');
    if (tab === 'register') registerTab.classList.remove('hidden');
  }

  if (loginBtn && registerBtn) {
    loginBtn.classList.remove('text-pink-500', 'border-b-2', 'border-pink-500');
    registerBtn.classList.remove('text-pink-500', 'border-b-2', 'border-pink-500');

    if (tab === 'login') loginBtn.classList.add('text-pink-500', 'border-b-2', 'border-pink-500');
    if (tab === 'register') registerBtn.classList.add('text-pink-500', 'border-b-2', 'border-pink-500');
  }
}

// Registro
async function registerUser() {
  const email = document.getElementById('regEmail')?.value?.trim();
  const password = document.getElementById('regPassword')?.value?.trim();

  if (!email || !password || password.length < 6) {
    showToast('Completa email y contraseña (mínimo 6 caracteres)', 'error');
    return;
  }

  try {
    const { error } = await supabase.auth.signUp({
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

// Login
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

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  console.log('Auth inicializado');
});