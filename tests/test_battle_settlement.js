/**
 * Tests de la logica de liquidacion 80/10/10. Correr con: node tests/test_battle_settlement.js
 * Sin dependencias de Supabase — prueba solo la funcion pura.
 */
const assert = require('assert');
const { computeSettlement } = require('../backend/battle-settlement');

let passed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`OK   - ${name}`);
    passed++;
  } catch (e) {
    console.error(`FAIL - ${name}`);
    console.error('     ', e.message);
    process.exitCode = 1;
  }
}

// Caso del ejemplo exacto del usuario: A apuesta 50 (player1), B apuesta 50 (player2), gana player2
check('Ejemplo 1v1 del usuario: 50 vs 50, pozo 100 -> 80/10/10', () => {
  const bets = [
    { userId: 'A', side: 'player1', amount: 50 },
    { userId: 'B', side: 'player2', amount: 50 }
  ];
  const r = computeSettlement(bets, 'player2');
  assert.strictEqual(r.totalPool, 100);
  assert.strictEqual(r.platformCut, 10);
  assert.strictEqual(r.artistCut, 10);
  assert.strictEqual(r.winnerPool, 80);
  assert.strictEqual(r.payouts.length, 1);
  assert.strictEqual(r.payouts[0].userId, 'B');
  assert.strictEqual(r.payouts[0].amount, 80);
});

// Varios fans por lado, reparto proporcional
check('Multi-fan: 3 apuestan por el ganador en proporciones distintas', () => {
  const bets = [
    { userId: 'winner1', side: 'player1', amount: 30 }, // 30% del lado ganador
    { userId: 'winner2', side: 'player1', amount: 50 }, // 50%
    { userId: 'winner3', side: 'player1', amount: 20 }, // 20%
    { userId: 'loser1', side: 'player2', amount: 40 },
    { userId: 'loser2', side: 'player2', amount: 60 }
  ];
  const r = computeSettlement(bets, 'player1');
  assert.strictEqual(r.totalPool, 200);
  assert.strictEqual(r.platformCut, 20);
  assert.strictEqual(r.artistCut, 20);
  assert.strictEqual(r.winnerPool, 160);
  const byUser = Object.fromEntries(r.payouts.map((p) => [p.userId, p.amount]));
  assert.strictEqual(byUser.winner1, 48);  // 30% de 160
  assert.strictEqual(byUser.winner2, 80);  // 50% de 160
  assert.strictEqual(byUser.winner3, 32);  // 20% de 160
  const sumPayouts = r.payouts.reduce((s, p) => s + p.amount, 0);
  assert.strictEqual(Math.round(sumPayouts * 10000) / 10000, r.winnerPool);
});

check('Conciliacion exacta: platformCut + artistCut + sum(payouts) == totalPool', () => {
  const bets = [
    { userId: 'u1', side: 'player1', amount: 33.33 },
    { userId: 'u2', side: 'player1', amount: 17.77 },
    { userId: 'u3', side: 'player2', amount: 12.5 }
  ];
  const r = computeSettlement(bets, 'player1');
  const sumPayouts = r.payouts.reduce((s, p) => s + p.amount, 0);
  const reconciled = Math.round((r.platformCut + r.artistCut + sumPayouts) * 10000) / 10000;
  assert.strictEqual(reconciled, r.totalPool);
});

check('Nadie aposto por el ganador -> payouts vacio, no se pierde info', () => {
  const bets = [{ userId: 'u1', side: 'player2', amount: 100 }];
  const r = computeSettlement(bets, 'player1');
  assert.strictEqual(r.payouts.length, 0);
  assert.strictEqual(r.winningSideTotal, 0);
});

check('Rechaza lado invalido', () => {
  assert.throws(() => computeSettlement([{ userId: 'u1', side: 'player1', amount: 10 }], 'player3'));
});

check('Rechaza monto invalido', () => {
  assert.throws(() =>
    computeSettlement([{ userId: 'u1', side: 'player1', amount: -5 }], 'player1')
  );
});

check('Rechaza array vacio', () => {
  assert.throws(() => computeSettlement([], 'player1'));
});

console.log(`\n${passed} tests OK` + (process.exitCode ? ' (con fallas, ver arriba)' : ''));
