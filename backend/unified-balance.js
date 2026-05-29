/**
 * Deducción del balance unificado (user_credits + saldo_fiat + saldo_onchain).
 */
async function deductUnifiedBalance(client, targetUserId, amount) {
  let rpcTotal = null;
  try {
    const { data: rpcBalance } = await client.rpc('get_user_unified_balance', {
      user_id_param: targetUserId
    });
    if (rpcBalance !== null && rpcBalance !== undefined) {
      rpcTotal = parseFloat(rpcBalance) || 0;
    }
  } catch (_rpcErr) {
    /* usar lectura por tablas */
  }

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
  const columnTotal = fiat + onchain + creditsBal;
  const total = rpcTotal !== null ? Math.max(rpcTotal, columnTotal) : columnTotal;

  if (total < amount) {
    return {
      ok: false,
      error: 'Insufficient credits',
      total,
      creditsBal,
      fiat,
      onchain
    };
  }

  let remaining = amount;
  const fromCredits = Math.min(creditsBal, remaining);
  remaining -= fromCredits;
  const fromFiat = Math.min(fiat, remaining);
  remaining -= fromFiat;
  const fromOnchain = remaining;

  if (fromCredits > 0) {
    const { error: creditsError } = await client.rpc('decrement_user_credits', {
      user_id_param: targetUserId,
      credits_to_subtract: fromCredits
    });
    if (creditsError) {
      const newCredits = Math.max(0, creditsBal - fromCredits);
      await client
        .from('user_credits')
        .update({ credits: newCredits, updated_at: new Date().toISOString() })
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
          saldo_fiat: Math.max(0, fiat - fromFiat),
          updated_at: new Date().toISOString()
        })
        .eq('id', targetUserId);
    }
  }

  if (fromOnchain > 0) {
    await client
      .from('users')
      .update({
        saldo_onchain: Math.max(0, onchain - fromOnchain),
        updated_at: new Date().toISOString()
      })
      .eq('id', targetUserId);
  }

  return { ok: true, fromCredits, fromFiat, fromOnchain, totalBefore: total };
}

module.exports = { deductUnifiedBalance };
