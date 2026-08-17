// Verificacion manual de las rutas de apuestas (mock de supabase, sin red).
const { makePlaceBetHandler, makeSettleHandler } = require('../backend/battle-bets-api');

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

function makeSupabaseMock({ userCredits = {}, bets = [], settlements = {} } = {}) {
  const calls = { decrement: [], increment: [], inserts: [] };
  return {
    calls,
    auth: {
      async getUser(token) {
        if (token === 'valid-token-fan1') return { data: { user: { id: 'fan1' } }, error: null };
        if (token === 'valid-token-fan2') return { data: { user: { id: 'fan2' } }, error: null };
        return { data: { user: null }, error: 'invalid' };
      }
    },
    rpc(fn, args) {
      if (fn === 'decrement_user_credits') {
        calls.decrement.push(args);
        userCredits[args.user_id_param] = (userCredits[args.user_id_param] || 0) - args.credits_to_subtract;
        return Promise.resolve({ error: null });
      }
      if (fn === 'increment_user_credits') {
        calls.increment.push(args);
        userCredits[args.user_id_param] = (userCredits[args.user_id_param] || 0) + args.credits_to_add;
        return Promise.resolve({ error: null });
      }
      throw new Error('unexpected rpc ' + fn);
    },
    from(table) {
      if (table === 'users') {
        return {
          select() { return this; },
          eq(col, val) { this._id = val; return this; },
          async maybeSingle() { return { data: { id: this._id }, error: null }; }
        };
      }
      if (table === 'user_credits') {
        return {
          select() { return this; },
          eq(col, val) { this._id = val; return this; },
          async maybeSingle() { return { data: { credits: userCredits[this._id] || 0 }, error: null }; }
        };
      }
      if (table === 'battle_settlements') {
        return {
          select() { return this; },
          eq(col, val) { this._battleId = val; return this; },
          async maybeSingle() { return { data: settlements[this._battleId] || null, error: null }; },
          async insert(row) { settlements[row.battle_id] = row; calls.inserts.push(row); return { error: null }; }
        };
      }
      if (table === 'battle_bets') {
        return {
          select() { return this; },
          eq(col, val) {
            if (col === 'battle_id') this._battleId = val;
            return this;
          },
          insert(row) {
            const withId = { id: 'bet-' + (bets.length + 1), ...row };
            bets.push(withId);
            return { select: () => ({ single: async () => ({ data: { id: withId.id }, error: null }) }) };
          },
          async update(fields) { return { eq: () => Promise.resolve({ error: null }) }; }
        };
      }
      throw new Error('unexpected table ' + table);
    }
  };
}

async function run() {
  let ok = 0, fail = 0;
  function assertEq(actual, expected, label) {
    if (actual === expected) { ok++; }
    else { fail++; console.error(`FAIL ${label}: esperado ${expected}, obtuve ${actual}`); }
  }

  // --- Caso 1: colocar apuesta valida ---
  {
    const userCredits = { fan1: 95 };
    const bets = [];
    const supabase = makeSupabaseMock({ userCredits, bets });
    const handler = makePlaceBetHandler(supabase);
    const req = { params: { battleId: 'b1' }, body: { side: 'player1', amount: 50 }, headers: { authorization: 'Bearer valid-token-fan1' } };
    const res = fakeRes();
    await handler(req, res);
    assertEq(res.statusCode, 200, 'Caso1 status');
    assertEq(userCredits.fan1, 45, 'Caso1 saldo descontado');
    console.log('Caso 1 (apuesta valida):', res.statusCode, JSON.stringify(res.body));
  }

  // --- Caso 2: saldo insuficiente ---
  {
    const userCredits = { fan1: 10 };
    const supabase = makeSupabaseMock({ userCredits });
    const handler = makePlaceBetHandler(supabase);
    const req = { params: { battleId: 'b1' }, body: { side: 'player1', amount: 50 }, headers: { authorization: 'Bearer valid-token-fan1' } };
    const res = fakeRes();
    await handler(req, res);
    assertEq(res.statusCode, 402, 'Caso2 status (saldo insuficiente)');
    console.log('Caso 2 (saldo insuficiente):', res.statusCode, JSON.stringify(res.body));
  }

  // --- Caso 3: sin token -> 401 ---
  {
    const supabase = makeSupabaseMock({});
    const handler = makePlaceBetHandler(supabase);
    const req = { params: { battleId: 'b1' }, body: { side: 'player1', amount: 50 }, headers: {} };
    const res = fakeRes();
    await handler(req, res);
    assertEq(res.statusCode, 401, 'Caso3 status (sin token)');
    console.log('Caso 3 (sin token):', res.statusCode, JSON.stringify(res.body));
  }

  // --- Caso 4: liquidar batalla con 2 apostadores por lado ganador ---
  {
    const userCredits = { fan1: 0, fan2: 0, fan3: 0, artist1: 0 };
    const bets = [
      { id: 'b1', battle_id: 'battleX', user_id: 'fan1', side: 'player1', amount: 30, settled: false },
      { id: 'b2', battle_id: 'battleX', user_id: 'fan2', side: 'player1', amount: 70, settled: false },
      { id: 'b3', battle_id: 'battleX', user_id: 'fan3', side: 'player2', amount: 100, settled: false }
    ];
    const supabase = makeSupabaseMock({ userCredits, bets });
    // Sobre-escribimos from('battle_bets') para simular la cadena real de
    // Supabase: select().eq('battle_id',x).eq('settled',false) donde la
    // ULTIMA llamada de la cadena es awaitable (resuelve {data, error}).
    const originalFrom = supabase.from.bind(supabase);
    supabase.from = (table) => {
      if (table === 'battle_bets') {
        return {
          select() { this._eqCount = 0; return this; },
          eq(col, val) {
            this._eqCount = (this._eqCount || 0) + 1;
            if (col === 'battle_id') this._battleId = val;
            if (this._eqCount >= 2) {
              return Promise.resolve({
                data: bets.filter((b) => b.battle_id === this._battleId && !b.settled),
                error: null
              });
            }
            return this;
          },
          update() { return { eq: () => Promise.resolve({ error: null }) }; }
        };
      }
      return originalFrom(table);
    };

    const handler = makeSettleHandler(supabase);
    const req = { params: { battleId: 'battleX' }, body: { winningSide: 'player1', artistUserId: 'artist1' } };
    const res = fakeRes();
    await handler(req, res);
    console.log('Caso 4 (liquidar batalla):', res.statusCode, JSON.stringify(res.body));
    // pozo total = 30+70+100 = 200; winnerPool = 200*0.8 = 160
    assertEq(res.statusCode, 200, 'Caso4 status');
    assertEq(userCredits.fan1, 48, 'Caso4 fan1 payout (30/100 del lado ganador * 160)');
    assertEq(userCredits.fan2, 112, 'Caso4 fan2 payout (70/100 del lado ganador * 160)');
    assertEq(userCredits.artist1, 20, 'Caso4 artist payout (10% de 200)');
    assertEq(userCredits.fan3, 0, 'Caso4 fan3 (perdio, no cobra)');
  }

  console.log(`\n${ok} asserts OK, ${fail} fallos`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error('ERROR:', e); process.exit(1); });
