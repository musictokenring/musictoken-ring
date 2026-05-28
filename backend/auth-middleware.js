/**
 * Auth helpers for sensitive backend routes.
 */

function getInternalSecret() {
  return process.env.BACKEND_INTERNAL_SECRET || '';
}

function hasValidInternalSecret(req) {
  const secret = getInternalSecret();
  if (!secret) return false;

  const headerSecret = req.headers['x-internal-secret'];
  if (headerSecret && headerSecret === secret) return true;

  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7) === secret) {
    return true;
  }

  return false;
}

function requireInternalSecret(req, res, next) {
  if (!getInternalSecret()) {
    console.error('[auth] BACKEND_INTERNAL_SECRET is not configured');
    return res.status(503).json({
      error: 'Internal auth not configured',
      message: 'Configure BACKEND_INTERNAL_SECRET in the server environment.'
    });
  }

  if (!hasValidInternalSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.authMode = 'internal';
  next();
}

async function getAuthUserFromBearer(req, supabase) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  if (!token || token === getInternalSecret()) {
    return null;
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

async function resolvePublicUserId(supabase, authUser) {
  const { data: row } = await supabase
    .from('users')
    .select('id')
    .eq('id', authUser.id)
    .maybeSingle();

  if (row?.id) return row.id;

  if (authUser.email) {
    const { data: byEmail } = await supabase
      .from('users')
      .select('id')
      .ilike('email', authUser.email)
      .maybeSingle();
    if (byEmail?.id) return byEmail.id;
  }

  return authUser.id;
}

async function userOwnsWallet(supabase, walletLinkAdapter, authUserId, walletAddress) {
  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return false;
  }

  const normalized = walletAddress.toLowerCase();

  const { data: walletUser } = await supabase
    .from('users')
    .select('id')
    .ilike('wallet_address', normalized)
    .maybeSingle();

  if (walletUser?.id === authUserId) return true;

  if (walletLinkAdapter?.getUserIdFromWallet) {
    const linkedUserId = await walletLinkAdapter.getUserIdFromWallet(normalized);
    if (linkedUserId === authUserId) return true;
  }

  return false;
}

async function verifyUserCanMutateCredits(
  supabase,
  walletLinkAdapter,
  authUser,
  { userId, walletAddress }
) {
  const publicUserId = await resolvePublicUserId(supabase, authUser);

  if (userId && userId !== publicUserId && userId !== authUser.id) {
    return false;
  }

  if (walletAddress) {
    return userOwnsWallet(supabase, walletLinkAdapter, publicUserId, walletAddress);
  }

  return Boolean(userId);
}

async function verifyUserInMatch(supabase, authUser, matchId) {
  if (!matchId) return false;

  const publicUserId = await resolvePublicUserId(supabase, authUser);

  const { data: match, error } = await supabase
    .from('matches')
    .select('id, player1_id, player2_id, status')
    .eq('id', matchId)
    .maybeSingle();

  if (error || !match) return false;

  return match.player1_id === publicUserId ||
    match.player1_id === authUser.id ||
    match.player2_id === publicUserId ||
    match.player2_id === authUser.id;
}

function createCreditMutationGuard(supabase, walletLinkAdapter = null) {
  return async function requireCreditMutationAuth(req, res, next) {
    if (hasValidInternalSecret(req)) {
      req.authMode = 'internal';
      return next();
    }

    const authUser = await getAuthUserFromBearer(req, supabase);
    if (!authUser) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Inicia sesión para modificar créditos.'
      });
    }

    req.authUser = authUser;
    req.authMode = 'user';
    next();
  };
}

function createVaultFeeGuard(supabase) {
  return async function requireVaultFeeAuth(req, res, next) {
    if (hasValidInternalSecret(req)) {
      req.authMode = 'internal';
      return next();
    }

    const authUser = await getAuthUserFromBearer(req, supabase);
    if (!authUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { feeType, matchId } = req.body || {};
    if (feeType !== 'bet' || !matchId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Solo se permiten fees de apuesta con matchId sin credencial interna.'
      });
    }

    const inMatch = await verifyUserInMatch(supabase, authUser, matchId);
    if (!inMatch) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'No participas en esta partida.'
      });
    }

    req.authUser = authUser;
    req.authMode = 'user';
    next();
  };
}

module.exports = {
  createCreditMutationGuard,
  createVaultFeeGuard,
  getAuthUserFromBearer,
  hasValidInternalSecret,
  requireInternalSecret,
  resolvePublicUserId,
  verifyUserCanMutateCredits,
  verifyUserInMatch
};
