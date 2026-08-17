// Verificacion manual rapida del fix de seguridad en /api/prizes/send.
// No es un test formal del framework del repo, solo una comprobacion
// puntual antes de subir el cambio. Se puede borrar despues.
const path = require('path');
const Module = require('module');

// Mock de ./prize-service para no llamar a la blockchain de verdad
const prizeServicePath = path.join(__dirname, '..', 'backend', 'prize-service.js');
const originalLoad = Module._load;
let sendPrizeCalls = [];
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename && path.resolve(path.dirname(parent.filename), request) === prizeServicePath.replace('.js', '')) {
    return {
      sendPrize: async (winner, amount) => {
        sendPrizeCalls.push({ winner, amount });
        return { method: 'mock', txHash: '0xmock' };
      }
    };
  }
  return originalLoad.apply(this, arguments);
};

const { makePrizeRouteHandler } = require('../backend/prize-api');
Module._load = originalLoad;

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

async function run() {
  const supabaseMock = {
    from(table) {
      if (table === 'matches') {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() {
            return { data: { id: 'match1', player1_id: 'userA', player2_id: 'userB' }, error: null };
          }
        };
      }
      if (table === 'users') {
        return {
          select() { return this; },
          in() {
            return Promise.resolve({
              data: [
                { id: 'userA', wallet_address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
                { id: 'userB', wallet_address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' }
              ],
              error: null
            });
          }
        };
      }
      throw new Error('unexpected table ' + table);
    }
  };

  const handler = makePrizeRouteHandler(supabaseMock);
  sendPrizeCalls = [];

  // Caso 1: wallet legitima (participante real del match) -> debe pagar
  let req = { body: { winner: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', amount: 10, matchId: 'match1' } };
  let res = fakeRes();
  await handler(req, res);
  console.log('Caso 1 (participante legitimo) ->', res.statusCode, JSON.stringify(res.body));
  console.assert(res.statusCode === 200, 'Caso 1 deberia ser 200');
  console.assert(sendPrizeCalls.length === 1, 'Caso 1 deberia haber llamado a sendPrize una vez');

  // Caso 2: wallet de atacante (no es participante del match) -> debe rechazar
  req = { body: { winner: '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF', amount: 10, matchId: 'match1' } };
  res = fakeRes();
  await handler(req, res);
  console.log('Caso 2 (atacante externo) ->', res.statusCode, JSON.stringify(res.body));
  console.assert(res.statusCode === 403, 'Caso 2 deberia ser 403');
  console.assert(sendPrizeCalls.length === 1, 'Caso 2 NO deberia haber llamado a sendPrize de nuevo (sigue en 1)');

  // Caso 3: matchId inexistente -> debe rechazar
  req = { body: { winner: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', amount: 10, matchId: 'no-existe' } };
  res = fakeRes();
  const supabaseMock2 = {
    from(table) {
      return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } };
    }
  };
  const handler2 = makePrizeRouteHandler(supabaseMock2);
  await handler2(req, res);
  console.log('Caso 3 (match inexistente) ->', res.statusCode, JSON.stringify(res.body));
  console.assert(res.statusCode === 404, 'Caso 3 deberia ser 404');

  console.log('\nTodos los asserts pasaron si no se vio ningun "Assertion failed" arriba.');
}

run().catch((e) => { console.error('ERROR EN TEST:', e); process.exit(1); });
