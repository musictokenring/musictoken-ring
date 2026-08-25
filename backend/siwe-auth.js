/**
 * Sign-In with Ethereum (SIWE) — login por firma de wallet, sin contraseña ni
 * Google.
 *
 * Por qué existe: cuando el usuario ya está ADENTRO del navegador propio de su
 * wallet (MetaMask/Trust Wallet, window.ethereum disponible), Google bloquea el
 * login por política propia de seguridad contra WebViews embebidos (no es algo
 * que podamos arreglar de este lado), y WalletConnect no hace falta ahí porque
 * la wallet ya está en el mismo navegador. Esta es la alternativa: un login
 * real, con una sola firma, sin depender de ninguno de los dos.
 *
 * Flujo:
 *  1. POST /api/auth/wallet/nonce { address } -> genera un mensaje único para
 *     firmar (nonce de un solo uso, vive 5 minutos).
 *  2. El usuario firma ese mensaje con su wallet (personal_sign, un solo tap,
 *     no autoriza ninguna transacción ni gasta gas).
 *  3. POST /api/auth/wallet/verify { address, signature } -> verifica la firma
 *     matemáticamente, encuentra o crea el usuario de Supabase Auth para esa
 *     wallet (reusando walletLinkService/syncWalletOnLogin — los MISMOS
 *     mecanismos que ya usa el login con Google para fusionar actividad
 *     wallet-only, no se reinventa nada) y devuelve una sesión REAL de
 *     Supabase (access_token/refresh_token). El resto de la app funciona
 *     exactamente igual que si hubieras entrado con Google — no hace falta
 *     tocar ningún otro código.
 */
const { createClient } = require('@supabase/supabase-js');
const { verifyMessage } = require('viem');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

// Nonces en memoria: viven 5 minutos y son de un solo uso. Este backend corre
// en una sola instancia (WEB_CONCURRENCY=1, confirmado en el arranque del
// server), así que no hace falta persistirlos en la base de datos.
const NONCE_TTL_MS = 5 * 60 * 1000;
const pendingNonces = new Map(); // address -> { message, expiresAt }

function cleanupExpiredNonces() {
  const now = Date.now();
  for (const [addr, entry] of pendingNonces.entries()) {
    if (entry.expiresAt < now) pendingNonces.delete(addr);
  }
}

function walletEmailFor(address) {
  // Email sintético, exclusivo para el login por wallet -- nunca se manda
  // ningún correo a esta dirección, solo se usa como identificador interno
  // de Supabase Auth.
  return `wallet-${address}@musictokenring.wallet`;
}

function buildSiweMessage(address, nonce, domain, origin) {
  const issuedAt = new Date().toISOString();
  return (
    `${domain} quiere que inicies sesión con tu wallet Ethereum:\n` +
    `${address}\n\n` +
    `Firmá este mensaje para entrar a MusicToken Ring. Esto NO autoriza ` +
    `ninguna transacción ni gasta gas, solo confirma que sos dueño de esta wallet.\n\n` +
    `URI: ${origin}\n` +
    `Nonce: ${nonce}\n` +
    `Emitido: ${issuedAt}`
  );
}

// Verifica un nonce pendiente + firma para una address. Devuelve {ok:true}
// o {ok:false, status, error} -- compartido entre /verify (login) y /link
// (vincular wallet de retiro a una cuenta ya autenticada), para no repetir
// la lógica de verificación en dos lugares.
async function checkPendingSignature(address, signature) {
  if (!WALLET_RE.test(address) || !signature) {
    return { ok: false, status: 400, error: 'Datos incompletos' };
  }
  const pending = pendingNonces.get(address);
  if (!pending || pending.expiresAt < Date.now()) {
    return { ok: false, status: 400, error: 'El mensaje para firmar expiró. Volvé a intentar.' };
  }
  const isValid = await verifyMessage({ address, message: pending.message, signature });
  if (!isValid) {
    return { ok: false, status: 401, error: 'Firma inválida' };
  }
  pendingNonces.delete(address); // de un solo uso
  return { ok: true };
}

function registerSiweRoutes(app, walletLinkService) {
  app.post('/api/auth/wallet/nonce', async (req, res) => {
    try {
      cleanupExpiredNonces();
      const address = String(req.body?.address || '').toLowerCase();
      if (!WALLET_RE.test(address)) {
        return res.status(400).json({ ok: false, error: 'Dirección de wallet inválida' });
      }

      const nonce = crypto.randomBytes(16).toString('hex');
      const origin = req.headers.origin || 'https://www.musictokenring.xyz';
      const domain = origin.replace(/^https?:\/\//, '');
      const message = buildSiweMessage(address, nonce, domain, origin);

      pendingNonces.set(address, { message, expiresAt: Date.now() + NONCE_TTL_MS });

      res.json({ ok: true, message });
    } catch (error) {
      console.error('[siwe] Error generando nonce:', error);
      res.status(500).json({ ok: false, error: 'Error interno' });
    }
  });

  app.post('/api/auth/wallet/verify', async (req, res) => {
    try {
      const address = String(req.body?.address || '').toLowerCase();
      const signature = req.body?.signature;

      const check = await checkPendingSignature(address, signature);
      if (!check.ok) {
        return res.status(check.status).json({ ok: false, error: check.error });
      }

      // ¿Esta wallet ya está vinculada a una cuenta autenticada existente?
      let authUserId = null;
      const { data: existingLink } = await supabase
        .from('user_wallets')
        .select('user_id')
        .eq('wallet_address', address)
        .maybeSingle();

      if (existingLink?.user_id) {
        const { data: existingAuthUser } = await supabase.auth.admin.getUserById(existingLink.user_id);
        if (existingAuthUser?.user) authUserId = existingLink.user_id;
      }

      let email;
      if (authUserId) {
        const { data: authUser } = await supabase.auth.admin.getUserById(authUserId);
        email = authUser.user.email;
      } else {
        // Cuenta nueva, exclusiva para esta wallet. La contraseña es
        // aleatoria y no se expone en ningún lado -- el login real pasa por
        // el intercambio de token más abajo, nunca por esta contraseña.
        email = walletEmailFor(address);
        const randomPassword = crypto.randomBytes(24).toString('hex');
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password: randomPassword,
          email_confirm: true,
          user_metadata: { wallet_address: address, auth_method: 'wallet_signature' }
        });
        if (createErr) throw createErr;
        authUserId = created.user.id;

        // Reusa el MISMO mecanismo que ya fusiona actividad "solo wallet"
        // cuando alguien hace login con Google -- así una wallet que ya
        // jugó/depositó antes de este login no pierde nada, y queda
        // vinculada igual que si hubiera venido por el camino de siempre.
        const { syncWalletOnLogin } = require('./sync-wallet-on-login');
        await syncWalletOnLogin(authUserId, address);
      }

      // Emitir una sesión REAL de Supabase para ese usuario. Se genera un
      // magic link del lado del servidor -- NUNCA se manda ningún email, solo
      // se usa el token para canjearlo acá mismo por una sesión.
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email
      });
      if (linkErr) throw linkErr;

      const tokenHash = linkData?.properties?.hashed_token;
      if (!tokenHash) throw new Error('No se pudo generar el token de sesión');

      const { data: sessionData, error: verifyErr } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink'
      });
      if (verifyErr) throw verifyErr;
      if (!sessionData?.session) throw new Error('No se pudo emitir la sesión');

      console.log('[siwe] ✅ Login por firma de wallet exitoso:', address, 'userId:', authUserId);

      res.json({
        ok: true,
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        userId: authUserId
      });
    } catch (error) {
      console.error('[siwe] Error verificando firma:', error);
      res.status(500).json({ ok: false, error: error.message || 'Error interno' });
    }
  });

  // Vincular una wallet de RETIRO a una cuenta ya autenticada (email/Google
  // o wallet), sin crear ni reemplazar ninguna sesión. Pensado para
  // reemplazar la conexión completa de WalletConnect cuando lo único que
  // hace falta es confirmar a dónde mandar un pago -- una sola firma, sin
  // gas, sin pareo QR. A diferencia de POST /api/user/link-wallet (que
  // confía en cualquier address que mande el cliente), este endpoint exige
  // la MISMA prueba criptográfica que el login por firma antes de guardar
  // nada -- una sesión comprometida no puede redirigir un retiro a una
  // wallet ajena sin también falsificar esta firma.
  app.post('/api/auth/wallet/link', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ ok: false, error: 'Authentication required' });
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authUser) {
        return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
      }

      const address = String(req.body?.address || '').toLowerCase();
      const signature = req.body?.signature;
      const check = await checkPendingSignature(address, signature);
      if (!check.ok) {
        return res.status(check.status).json({ ok: false, error: check.error });
      }

      if (!walletLinkService) {
        return res.status(503).json({ ok: false, error: 'Wallet link service not available' });
      }
      const result = await walletLinkService.linkWallet(authUser.id, address, {
        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        linkedVia: 'signature'
      });
      if (!result.success) {
        return res.status(400).json({ ok: false, error: result.error || 'No se pudo vincular la wallet' });
      }

      console.log('[siwe] ✅ Wallet de retiro vinculada por firma:', address, 'userId:', authUser.id);
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[siwe] Error vinculando wallet de retiro:', error);
      res.status(500).json({ ok: false, error: error.message || 'Error interno' });
    }
  });
}

module.exports = { registerSiweRoutes, buildSiweMessage };
