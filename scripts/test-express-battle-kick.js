#!/usr/bin/env node
/**
 * Espera al cierre de un Express y verifica que start-battle genere bracket (CPU).
 * Uso: node scripts/test-express-battle-kick.js [genreId]
 */
'use strict';

const BACKEND = process.env.BACKEND_API || 'https://musictoken-ring.onrender.com';
const GENRE = process.argv[2] || 'vallenato';

async function fetchJson(path, options, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 180000);
  try {
    const res = await fetch(BACKEND + path, Object.assign({}, options, { signal: ctrl.signal }));
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log('Backend:', BACKEND);
  console.log('Género:', GENRE);

  const ensure = await fetchJson(
    '/api/tournaments/genre/' + GENRE + '/ensure-express',
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    60000
  );
  if (!ensure.ok || !ensure.data.express?.id) {
    console.error('ensure-express falló:', ensure.data);
    process.exit(1);
  }

  const ex = ensure.data.express;
  console.log('Torneo:', ex.id);
  console.log('Cierra:', ex.registration_closes_at);
  console.log('Status:', ex.status);

  const closesMs = new Date(ex.registration_closes_at).getTime();
  const waitMs = Math.max(0, closesMs - Date.now() + 2500);
  if (waitMs > 360000) {
    console.log('Espera >6 min — abortando (usa un torneo próximo a cerrar)');
    process.exit(0);
  }
  console.log('Esperando', Math.round(waitMs / 1000), 's…');
  await new Promise(function (r) { setTimeout(r, waitMs); });

  console.log('\n--- POST /start-battle ---');
  const t0 = Date.now();
  const kick = await fetchJson(
    '/api/tournaments/' + ex.id + '/start-battle',
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    180000
  );
  const ms = Date.now() - t0;
  const d = kick.data || {};
  console.log('HTTP', kick.status, '(' + ms + 'ms)');
  console.log('tournament.status:', d.tournament?.status);
  console.log('lifecycleStage:', d.lifecycleStage);
  console.log('lifecycleError:', d.lifecycleError || 'none');
  console.log('duels:', d.bracket?.duels?.length || 0);
  console.log('participants:', d.bracket?.participants?.length || 0);
  console.log('human/cpu:', d.bracket?.humanCount, '/', d.bracket?.cpuCount);

  if (d.tournament?.status === 'in_progress' && d.bracket?.duels?.length > 0) {
    console.log('\n✅ Batalla Express OK');
    process.exit(0);
  }

  if (d.tournament?.status === 'cancelled') {
    console.error('\n❌ Torneo cancelado en lugar de iniciar batalla CPU');
    console.error('Respuesta:', JSON.stringify(d, null, 2).slice(0, 2500));
    process.exit(1);
  }

  console.warn('\n⚠️ Estado inesperado — revisar respuesta completa arriba');
  process.exit(1);
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
