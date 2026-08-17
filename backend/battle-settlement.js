/**
 * Liquidacion de batallas multi-fan (modelo 80/10/10).
 *
 * Modelo de negocio confirmado con el usuario (2026-08-17):
 *   - 80% del pozo total -> repartido PROPORCIONALMENTE entre quienes
 *     apostaron por el lado ganador (segun cuanto puso cada uno)
 *   - 10% del pozo total -> el artista/lado ganador (socio)
 *   - 10% del pozo total -> la plataforma
 *
 * computeSettlement() es una funcion pura (sin I/O, sin Supabase) para que
 * se pueda probar de forma aislada antes de tocar datos reales. Toda la
 * plata se calcula en centavos de credito (numeros, no floats de JS
 * directamente en la respuesta final) redondeando a 4 decimales, igual que
 * la columna DECIMAL(20,4) de user_credits.
 */

const ARTIST_CUT_PCT = 0.10;
const PLATFORM_CUT_PCT = 0.10;
const WINNER_POOL_PCT = 1 - ARTIST_CUT_PCT - PLATFORM_CUT_PCT; // 0.80

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * @param {Array<{userId: string, side: 'player1'|'player2', amount: number}>} bets
 * @param {'player1'|'player2'} winningSide
 * @returns {{
 *   totalPool: number,
 *   platformCut: number,
 *   artistCut: number,
 *   winnerPool: number,
 *   payouts: Array<{userId: string, amount: number}>,
 *   winningSideTotal: number,
 *   losingSideTotal: number
 * }}
 */
function computeSettlement(bets, winningSide) {
  if (!Array.isArray(bets) || bets.length === 0) {
    throw new Error('bets must be a non-empty array');
  }
  if (winningSide !== 'player1' && winningSide !== 'player2') {
    throw new Error("winningSide must be 'player1' or 'player2'");
  }
  for (const b of bets) {
    if (!b.userId) throw new Error('every bet needs a userId');
    if (b.side !== 'player1' && b.side !== 'player2') {
      throw new Error(`invalid bet side: ${b.side}`);
    }
    if (!(Number(b.amount) > 0)) {
      throw new Error(`invalid bet amount for user ${b.userId}: ${b.amount}`);
    }
  }

  const totalPool = round4(bets.reduce((sum, b) => sum + Number(b.amount), 0));
  const platformCut = round4(totalPool * PLATFORM_CUT_PCT);
  const artistCut = round4(totalPool * ARTIST_CUT_PCT);

  const winningBets = bets.filter((b) => b.side === winningSide);
  const losingBets = bets.filter((b) => b.side !== winningSide);
  const winningSideTotal = round4(winningBets.reduce((s, b) => s + Number(b.amount), 0));
  const losingSideTotal = round4(losingBets.reduce((s, b) => s + Number(b.amount), 0));

  // winnerPool se calcula como el remanente exacto (total - platform - artist)
  // en vez de totalPool * WINNER_POOL_PCT, para que los 3 cortes sumen
  // EXACTO el pozo total incluso con redondeos de centavos.
  const winnerPool = round4(totalPool - platformCut - artistCut);

  let payouts = [];
  if (winningSideTotal > 0) {
    payouts = winningBets.map((b) => ({
      userId: b.userId,
      amount: round4(winnerPool * (Number(b.amount) / winningSideTotal))
    }));
  } else {
    // Nadie aposto por el lado ganador (caso raro: ej. bracket con solo un
    // lado con apuestas humanas). No hay a quien repartir el winnerPool;
    // se documenta explicitamente en vez de perderlo en silencio.
    payouts = [];
  }

  // Ajuste de centavos: por redondeo, la suma de payouts puede quedar
  // hasta +/-0.0001*N por debajo/encima de winnerPool. Se corrige en el
  // primer payout para que la conciliacion cierre exacto.
  if (payouts.length > 0) {
    const paidSum = round4(payouts.reduce((s, p) => s + p.amount, 0));
    const diff = round4(winnerPool - paidSum);
    if (diff !== 0) {
      payouts[0] = { ...payouts[0], amount: round4(payouts[0].amount + diff) };
    }
  }

  return {
    totalPool,
    platformCut,
    artistCut,
    winnerPool,
    payouts,
    winningSideTotal,
    losingSideTotal
  };
}

module.exports = { computeSettlement, ARTIST_CUT_PCT, PLATFORM_CUT_PCT, WINNER_POOL_PCT };
