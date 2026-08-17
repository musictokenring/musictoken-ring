/**
 * Rutas de apuestas multi-fan por batalla (modelo 80/10/10).
 *
 * POST /api/battles/:battleId/bet     -> un fan autenticado aposta credits
 *                                        por un lado de la batalla.
 * POST /api/battles/:battleId/settle  -> liquida la batalla (SOLO interno,
 *                                        requireInternalSecret — la llama el
 *                                        propio backend cuando la batalla
 *                                        real se resuelve, nunca un cliente).
 *
 * SEGURIDAD, mismo patron que el resto del proyecto:
 *  - El usuario que aposta se identifica por su token Bearer (getAuthUserFromBearer),
 *    NUNCA por un userId que venga en el body.
 fix/battle-bets-wallet-user-resolution
 *  - El userId que realmente tiene el saldo se resuelve con resolveCreditsUserId
 *    (backend/auth-middleware.js) — el MISMO mecanismo que usa la inscripcion a
 *    torneos para cuentas con wallet vinculada. resolvePublicUserId (la version
 *    simple) devuelve el id de auth de Supabase, que en cuentas con wallet no es
 *    necesariamente donde vive el saldo (saldo_fiat/saldo_onchain quedan bajo el
 *    id vinculado a la wallet) — eso causaba "Insufficient credits" con saldo real
 *    de sobra (encontrado probando en produccion con una cuenta con wallet y
 *    ~$3000 nominales que via la resolucion simple daba total_balance: 0).
 *  - El saldo se descuenta con deductUnifiedBalance (backend/unified-balance.js) —
 *    la MISMA fuente de balance que muestra el frontend (credits + saldo_fiat +
 *    saldo_onchain), igual que /api/credits/deduct y las inscripciones a torneo.

 *  - El saldo se descuenta con deductUnifiedBalance (backend/unified-balance.js) —
 *    la MISMA fuente de balance que muestra el frontend (credits + saldo_fiat +
 *    saldo_onchain), igual que /api/credits/deduct y las inscripciones a torneo.
 *    Descontar solo de user_credits.credits (como se hacia antes) causaba falsos
 *    "Insufficient credits" en cuentas cuyo saldo esta en saldo_fiat/onchain. main
 *  - Las ganancias se acreditan con increment_user_credits (RPC atomica que ya
 *    usa el resto del sistema de creditos), nunca escribiendo la tabla directo.
 *  - /settle es idempotente: si el battleId ya tiene fila en
 *    battle_settlements, se rechaza (no se puede liquidar dos veces).
 */
const { getAuthUserFromBearer, resolveCreditsUserId, requireInternalSecret } = require('./auth-middleware');
const { computeSettlement } = require('./battle-settlement');
const { deductUnifiedBalance } = require('./unified-balance');

function makePlaceBetHandler(supabase, walletLinkService) {
  return async function placeBetHandler(req, res) {
    try {
      const { battleId } = req.params;
      const { side, amount, walletAddress } = req.body || {};

      if (!battleId) return res.status(400).json({ ok: false, error: 'battleId is required' });
      if (side !== 'player1' && side !== 'player2') {
        return res.status(400).json({ ok: false, error: "side must be 'player1' or 'player2'" });
      }
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ ok: false, error: 'amount must be a positive number' });
      }

      const authUser = await getAuthUserFromBearer(req, supabase);
      if (!authUser) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      const resolved = await resolveCreditsUserId(
        supabase,
        { getUserIdFromWallet: (addr) => (walletLinkService ? walletLinkService.getUserIdFromWallet(addr) : null) },
        authUser,
        walletAddress || null
      );
      const userId = resolved.userId;
      if (!userId) {
        return res.status(404).json({ ok: false, error: 'User not found' });
      }

      const { data: alreadySettled } = await supabase
        .from('battle_settlements')
        .select('battle_id')
        .eq('battle_id', battleId)
        .maybeSingle();
      if (alreadySettled) {
        return res.status(409).json({ ok: false, error: 'This battle is already settled; no more bets accepted' });
      }

      // Descuenta del balance unificado (credits + saldo_fiat + saldo_onchain,
      // misma fuente que el header del frontend) de forma atomica ANTES de
      // registrar la apuesta.
      const deduction = await deductUnifiedBalance(supabase, userId, numericAmount);
      if (!deduction.ok) {
        return res.status(402).json({
          ok: false,
          error: deduction.error || 'Insufficient credits',
          total_balance: deduction.total
        });
      }

      const { data: bet, error: insertError } = await supabase
        .from('battle_bets')
        .insert({ battle_id: battleId, user_id: userId, side, amount: numericAmount })
        .select('id')
        .single();

      if (insertError) {
        // Compensacion: la apuesta no se pudo registrar, devolver los creditos.
        console.error('[battle-bets] insert failed, refunding credits:', insertError);
        await supabase.rpc('increment_user_credits', {
          user_id_param: userId,
          credits_to_add: numericAmount
        });
        return res.status(500).json({ ok: false, error: 'Failed to record bet, credits refunded' });
      }

      return res.status(200).json({ ok: true, betId: bet.id, battleId, side, amount: numericAmount });
    } catch (error) {
      console.error('[battle-bets] placeBetHandler error:', error);
      return res.status(500).json({ ok: false, error: error?.message || 'Internal error' });
    }
  };
}

function makeSettleHandler(supabase) {
  return async function settleHandler(req, res) {
    try {
      const { battleId } = req.params;
      const { winningSide, artistUserId } = req.body || {};

      if (!battleId) return res.status(400).json({ ok: false, error: 'battleId is required' });
      if (winningSide !== 'player1' && winningSide !== 'player2') {
        return res.status(400).json({ ok: false, error: "winningSide must be 'player1' or 'player2'" });
      }

      const { data: existing } = await supabase
        .from('battle_settlements')
        .select('battle_id')
        .eq('battle_id', battleId)
        .maybeSingle();
      if (existing) {
        return res.status(409).json({ ok: false, error: 'Battle already settled' });
      }

      const { data: bets, error: betsError } = await supabase
        .from('battle_bets')
        .select('id, user_id, side, amount')
        .eq('battle_id', battleId)
        .eq('settled', false);

      if (betsError) {
        console.error('[battle-bets] failed to load bets:', betsError);
        return res.status(500).json({ ok: false, error: 'Failed to load bets' });
      }
      if (!bets || bets.length === 0) {
        return res.status(404).json({ ok: false, error: 'No bets found for this battle' });
      }

      const settlement = computeSettlement(
        bets.map((b) => ({ userId: b.user_id, side: b.side, amount: Number(b.amount) })),
        winningSide
      );

      // Acredita a cada ganador (RPC atomica, una llamada por usuario).
      for (const payout of settlement.payouts) {
        const { error: payErr } = await supabase.rpc('increment_user_credits', {
          user_id_param: payout.userId,
          credits_to_add: payout.amount
        });
        if (payErr) {
          // No hacemos rollback de los pagos anteriores: mejor pagar de mas
          // (y loggear fuerte) que dejar a un ganador sin cobrar por un
          // error de red a mitad de camino. Se corrige manualmente si pasa.
          console.error('[battle-bets] CRITICAL: payout failed for user', payout.userId, payErr);
        }
      }

      // Acredita al artista (10%), si se indico su user_id.
      if (artistUserId && settlement.artistCut > 0) {
        const { error: artistPayErr } = await supabase.rpc('increment_user_credits', {
          user_id_param: artistUserId,
          credits_to_add: settlement.artistCut
        });
        if (artistPayErr) {
          console.error('[battle-bets] CRITICAL: artist payout failed:', artistPayErr);
        }
      }

      // El platformCut no se acredita a nadie: simplemente no se reparte,
      // queda "retenido" (es la comision de la casa).

      await supabase
        .from('battle_bets')
        .update({ settled: true, settled_at: new Date().toISOString() })
        .eq('battle_id', battleId);

      await supabase.from('battle_settlements').insert({
        battle_id: battleId,
        winning_side: winningSide,
        total_pool: settlement.totalPool,
        platform_cut: settlement.platformCut,
        artist_cut: settlement.artistCut,
        winner_pool: settlement.winnerPool,
        artist_user_id: artistUserId || null
      });

      return res.status(200).json({ ok: true, battleId, ...settlement });
    } catch (error) {
      console.error('[battle-bets] settleHandler error:', error);
      return res.status(500).json({ ok: false, error: error?.message || 'Internal error' });
    }
  };
}

function registerBattleBetsRoutes(app, supabase, walletLinkService) {
  if (!app || typeof app.post !== 'function') {
    throw new Error('registerBattleBetsRoutes requires an app instance');
  }
  if (!supabase) {
    throw new Error('registerBattleBetsRoutes requires a supabase client');
  }

  app.post('/api/battles/:battleId/bet', makePlaceBetHandler(supabase, walletLinkService));
  app.post('/api/battles/:battleId/settle', requireInternalSecret, makeSettleHandler(supabase));
  return app;
}

module.exports = { registerBattleBetsRoutes, makePlaceBetHandler, makeSettleHandler };
