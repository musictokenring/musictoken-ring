#!/usr/bin/env node
/**
 * Smoke test del flujo Express contra el backend en Render.
 * Uso: node scripts/test-tournament-flow.js [genreId]
 */
'use strict';

const BACKEND = process.env.BACKEND_API || 'https://musictoken-ring.onrender.com';
const GENRE = process.argv[2] || 'vallenato';

async function timed(label, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    console.log('OK  ', label, `(${ms}ms)`);
    return { ok: true, ms, result };
  } catch (err) {
    const ms = Date.now() - t0;
    console.error('FAIL', label, `(${ms}ms)`, err.message || err);
    return { ok: false, ms, error: err.message || String(err) };
  }
}

async function fetchJson(path, options) {
  const res = await fetch(BACKEND + path, options);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    const err = new Error((data.error || data.message || res.statusText) + ' HTTP ' + res.status);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function main() {
  console.log('Backend:', BACKEND);
  console.log('Género:', GENRE);
  console.log('---');

  const health = await timed('GET /api/health', () =>
    fetchJson('/api/health', { method: 'GET' })
  );
  if (health.result?.renderGitCommit) {
    console.log('     commit Render:', health.result.renderGitCommit.slice(0, 8));
  }

  const ensure = await timed('POST ensure-express', () =>
    fetchJson('/api/tournaments/genre/' + GENRE + '/ensure-express', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
  );
  if (!ensure.ok || !ensure.result?.express?.id) {
    console.error('\n❌ No se pudo abrir Express. Abortando.');
    process.exit(1);
  }

  const express = ensure.result.express;
  const tournamentId = express.id;
  console.log('     torneo:', tournamentId);
  console.log('     cierra:', express.registration_closes_at);
  console.log('     status:', express.status);

  const ensure2 = await timed('POST ensure-express (2ª vez, debe ser rápida)', () =>
    fetchJson('/api/tournaments/genre/' + GENRE + '/ensure-express', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
  );
  if (ensure2.ms > 3000) {
    console.log('     ⚠️  2ª ensure tardó', ensure2.ms + 'ms — backend aún sin fast-path (redeploy pendiente)');
  } else {
    console.log('     ✓ fast-path OK');
  }

  const hub = await timed('GET /api/tournaments/hub', () =>
    fetchJson('/api/tournaments/hub', { method: 'GET' })
  );
  if (hub.ok) {
    const g = (hub.result.genres || []).find(function (x) { return x.id === GENRE; });
    console.log('     hub express id:', g?.express?.id || 'null');
    console.log('     hub express match:', g?.express?.id === tournamentId ? 'yes' : 'NO');
  }

  const bracketRead = await timed('GET /bracket (readOnly)', () =>
    fetchJson('/api/tournaments/' + tournamentId + '/bracket', { method: 'GET' })
  );
  if (bracketRead.ok) {
    console.log('     bracket status:', bracketRead.result.tournament?.status);
    console.log('     lifecycleError:', bracketRead.result.lifecycleError || 'none');
    console.log('     duels:', bracketRead.result.bracket?.duels?.length || 0);
  }

  const startBattle = await timed('POST /start-battle (lifecycle)', () =>
    fetchJson('/api/tournaments/' + tournamentId + '/start-battle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
  );
  if (startBattle.ok) {
    const t = startBattle.result.tournament || {};
    console.log('     after kick status:', t.status);
    console.log('     lifecycleStage:', startBattle.result.lifecycleStage || 'n/a');
    console.log('     lifecycleError:', startBattle.result.lifecycleError || 'none');
    console.log('     participants:', startBattle.result.bracket?.participants?.length || 0);
    console.log('     duels:', startBattle.result.bracket?.duels?.length || 0);
    if (startBattle.result.lifecycleError) {
      console.log('     ⚠️', startBattle.result.lifecycleError);
    }
    if (startBattle.result.bracket?.duels?.length > 0) {
      console.log('     ✓ batalla generada');
    }
  }

  console.log('\n--- Resumen ---');
  const slow = [health, ensure, hub, bracketRead, startBattle].filter(function (x) { return x.ms > 10000; });
  if (slow.length) {
    console.log('Peticiones lentas (>10s):', slow.map(function (x) { return x.ms + 'ms'; }).join(', '));
    console.log('Render cold start puede causar timeouts en el navegador si poll aborta kick.');
  }
  const failed = [health, ensure, hub, bracketRead, startBattle].filter(function (x) { return !x.ok; });
  if (failed.length) {
    console.log('Fallos:', failed.length);
    process.exit(1);
  }
  console.log('Smoke test completado.');
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
