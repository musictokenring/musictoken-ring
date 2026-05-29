/**
 * Balance y deducción unificados (user_credits + saldo_fiat + saldo_onchain).
 */
async function readColumnBalances(client, targetUserId) {
  const { data: userData } = await client
    .from('users')
    .select('saldo_fiat, saldo_onchain')
    .eq('id', targetUserId)
    .maybeSingle();

  const { data: creditsRow } = await client
    .from('user_credits')
    .select('credits')
    .eq('user_id', targetUserId)
    .maybeSingle();

  const fiat = parseFloat(userData?.saldo_fiat || 0);
  const onchain = parseFloat(userData?.saldo_onchain || 0);
  const creditsBal = parseFloat(creditsRow?.credits || 0);
  return { fiat, onchain, creditsBal, columnTotal: fiat + onchain + creditsBal };
}

async function readUnifiedTotal(client, targetUserId) {
  let rpcTotal = null;
  try {
    const { data: rpcBalance } = await client.rpc('get_user_unified_balance', {
      user_id_param: targetUserId
    });
    if (rpcBalance !== null && rpcBalance !== undefined) {
      rpcTotal = parseFloat(rpcBalance) || 0;
    }
  } catch (_rpcErr) {
    /* usar columnas */
  }

  const cols = await readColumnBalances(client, targetUserId);
  const total = rpcTotal !== null
    ? Math.max(rpcTotal, cols.columnTotal)
    : cols.columnTotal;

  return { ...cols, rpcTotal, total };
}

async function ensureUserCreditsRow(client, targetUserId) {
  const { data: existing } = await client
    .from('user_credits')
    .select('user_id')
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (existing) return;

  await client.from('user_credits').insert({
    user_id: targetUserId,
    credits: 0,
    updated_at: new Date().toISOString()
  });
}

async function deductUnifiedBalance(client, targetUserId, amount) {
  const balances = await readUnifiedTotal(client, targetUserId);

  if (balances.total < amount) {
    return {
      ok: false,
      error: 'Insufficient credits',
      total: balances.total,
      creditsBal: balances.creditsBal,
      fiat: balances.fiat,
      onchain: balances.onchain
    };
  }

  let remaining = amount;
  let fromCredits = Math.min(balances.creditsBal, remaining);
  remaining -= fromCredits;
  let fromFiat = Math.min(balances.fiat, remaining);
  remaining -= fromFiat;
  let fromOnchain = remaining;

  if (balances.columnTotal < amount && balances.total >= amount) {
    const playable = balances.rpcTotal !== null ? balances.rpcTotal : balances.total;
    const newCredits = Math.max(0, playable - amount);
    await ensureUserCreditsRow(client, targetUserId);
    await client
      .from('user_credits')
      .update({ credits: newCredits, updated_at: new Date().toISOString() })
      .eq('user_id', targetUserId);
    return {
      ok: true,
      fromCredits: amount,
      fromFiat: 0,
      fromOnchain: 0,
      totalBefore: balances.total,
      syncedFromRpc: true
    };
  }

  if (fromCredits > 0) {
    const { error: creditsError } = await client.rpc('decrement_user_credits', {
      user_id_param: targetUserId,
      credits_to_subtract: fromCredits
    });
    if (creditsError) {
      await ensureUserCreditsRow(client, targetUserId);
      await client
        .from('user_credits')
        .update({
          credits: Math.max(0, balances.creditsBal - fromCredits),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', targetUserId);
    }
  }

  if (fromFiat > 0) {
    const { error: fiatError } = await client.rpc('decrement_user_fiat_balance', {
      user_id_param: targetUserId,
      amount_to_subtract: fromFiat
    });
    if (fiatError) {
      await client
        .from('users')
        .update({
          saldo_fiat: Math.max(0, balances.fiat - fromFiat),
          updated_at: new Date().toISOString()
        })
        .eq('id', targetUserId);
    }
  }

  if (fromOnchain > 0) {
    await client
      .from('users')
      .update({
        saldo_onchain: Math.max(0, balances.onchain - fromOnchain),
        updated_at: new Date().toISOString()
      })
      .eq('id', targetUserId);
  }

  return {
    ok: true,
    fromCredits,
    fromFiat,
    fromOnchain,
    totalBefore: balances.total
  };
}

module.exports = {
  deductUnifiedBalance,
  readUnifiedTotal
};
