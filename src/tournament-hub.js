/**
 * Hub de torneos — 14 Express activos + Grand Prix + cronómetro en vivo.
 */
(function () {
  'use strict';

  var pollTimer = null;
  var countdownTimer = null;
  var enrollmentCountdownTimer = null;
  var hubData = null;
  var selectedGenreId = null;
  var serverSkewMs = 0;
  var fetchedAtLocal = 0;
  var hubSyncInFlight = false;
  var zeroSinceLocal = null;
  var lastHubSyncAt = 0;
  var hubPollController = null;
  var hubEnsureController = null;
  var ensureByGenre = {};
  var ensureRequested = {};
  var expressSlotCache = {};
  var ENSURE_TIMEOUT_MS = 90000;
  var EXPRESS_CACHE_MS = 45000;
  var API_TIMEOUT_MS = 55000;
  var HUB_GET_TIMEOUT_MS = 22000;
  var HUB_SYNC_COOLDOWN_MS = 20000;

  var FALLBACK_GENRES = [
    { id: 'reggaeton', label: 'Reggaeton', region: 'latino', emoji: '🎤', deezerQuery: 'reggaeton' },
    { id: 'pop_en', label: 'Pop en inglés', region: 'anglo', emoji: '🎵', deezerQuery: 'pop english' },
    { id: 'salsa', label: 'Salsa', region: 'latino', emoji: '💃', deezerQuery: 'salsa' },
    { id: 'rock_en', label: 'Rock en inglés', region: 'anglo', emoji: '🎸', deezerQuery: 'rock english' },
    { id: 'cumbia', label: 'Cumbia', region: 'latino', emoji: '🪗', deezerQuery: 'cumbia' },
    { id: 'hip_hop_en', label: 'Hip hop / R&B (EN)', region: 'anglo', emoji: '🎧', deezerQuery: 'hip hop english' },
    { id: 'vallenato', label: 'Vallenato', region: 'latino', emoji: '🎹', deezerQuery: 'vallenato' },
    { id: 'pop_latino', label: 'Pop latino', region: 'latino', emoji: '⭐', deezerQuery: 'pop latino' },
    { id: 'rock_es', label: 'Rock en español', region: 'latino', emoji: '🎸', deezerQuery: 'rock en español' },
    { id: 'electronic_en', label: 'Electrónica / EDM (EN)', region: 'anglo', emoji: '⚡', deezerQuery: 'edm electronic english' },
    { id: 'bachata', label: 'Bachata', region: 'latino', emoji: '❤️', deezerQuery: 'bachata' },
    { id: 'trap_latino', label: 'Trap latino', region: 'latino', emoji: '🔥', deezerQuery: 'trap latino' },
    { id: 'merengue', label: 'Merengue', region: 'latino', emoji: '🥁', deezerQuery: 'merengue' },
    { id: 'regional', label: 'Regional / Corridos', region: 'latino', emoji: '🤠', deezerQuery: 'corridos regional mexican' }
  ];

  function buildFallbackHubData() {
    var closes = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    return {
      ok: true,
      serverTime: new Date().toISOString(),
      config: { activeExpressCount: 14 },
      expressRotation: {
        activeExpressCount: 14,
        totalGenres: 14,
        secondsToBattle: 300,
        secondsToNextSlot: 300
      },
      genres: FALLBACK_GENRES.map(function (g) {
        return {
          id: g.id,
          label: g.label,
          region: g.region,
          emoji: g.emoji,
          deezerQuery: g.deezerQuery,
          express: {
            id: null,
            genre_id: g.id,
            status: 'registration',
            entry_fee: 3,
            max_participants: 4,
            current_participants: 0,
            prize_pool: 0,
            registration_closes_at: closes,
            name: 'Express ' + g.label
          },
          weekly: null
        };
      })
    };
  }

  function applyHubData(data) {
    hubData = data;
    if (data.serverTime) {
      serverSkewMs = Date.now() - new Date(data.serverTime).getTime();
      fetchedAtLocal = Date.now();
    }
    if ((data.genres || []).some(function (g) { return isOpenRegistration(g.express); })) {
      zeroSinceLocal = null;
    }
  }

  function renderHubLoading(message) {
    var banner = document.getElementById('tournamentRotationBanner');
    if (banner) {
      banner.innerHTML =
        '<div class="text-center text-sm text-purple-200 animate-pulse">' +
        (message || 'Cargando torneos…') + '</div>';
    }
  }

  function renderHubError(message) {
    var banner = document.getElementById('tournamentRotationBanner');
    if (!banner) return;
    banner.innerHTML =
      '<div class="flex flex-wrap items-center justify-between gap-3">' +
      '<p class="text-amber-200 text-sm flex-1">' + (message || 'Servidor lento.') + '</p>' +
      '<button type="button" id="tournamentHubRetryBtn" class="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-sm">Reintentar</button>' +
      '</div>';
    var btn = document.getElementById('tournamentHubRetryBtn');
    if (btn) {
      btn.onclick = function () {
        refresh(false).catch(function (e) {
          console.warn('[tournament-hub] retry:', e);
        });
      };
    }
  }

  function backendUrl() {
    return (window.CONFIG && window.CONFIG.BACKEND_API) || 'https://musictoken-ring.onrender.com';
  }

  function fmtTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function fmtClock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function serverNowMs() {
    return Date.now() - serverSkewMs;
  }

  function secondsToBattle(exp) {
    if (!exp || !exp.registration_closes_at) return 0;
    if (exp.status !== 'registration') return 0;
    var closes = new Date(exp.registration_closes_at).getTime();
    if (!Number.isFinite(closes) || closes <= serverNowMs()) return 0;
    return Math.max(0, Math.floor((closes - serverNowMs()) / 1000));
  }

  function isOpenRegistration(exp) {
    return exp && exp.status === 'registration' && secondsToBattle(exp) > 0;
  }

  function countLiveBattles() {
    if (!hubData || !hubData.genres) return 0;
    return hubData.genres.filter(function (g) {
      return g.express && (g.express.status === 'in_progress' || g.express.status === 'locked');
    }).length;
  }

  /** Segundos hasta la próxima batalla — siempre en vivo (no snapshot estático del API). */
  function rotationCountdownSeconds() {
    if (!hubData) return 0;
    var minOpen = null;
    (hubData.genres || []).forEach(function (g) {
      if (!isOpenRegistration(g.express)) return;
      var s = secondsToBattle(g.express);
      if (s > 0 && (minOpen === null || s < minOpen)) minOpen = s;
    });
    if (minOpen !== null && minOpen > 0) return minOpen;

    var rot = hubData.expressRotation || {};
    if (rot.registrationClosesAt) {
      var closesIso = new Date(rot.registrationClosesAt).getTime();
      if (Number.isFinite(closesIso)) {
        var secClose = Math.max(0, Math.floor((closesIso - serverNowMs()) / 1000));
        if (secClose > 0) return secClose;
      }
    }
    if (rot.battleStartsAt) {
      var battleIso = new Date(rot.battleStartsAt).getTime();
      if (Number.isFinite(battleIso)) {
        var secBattle = Math.max(0, Math.floor((battleIso - serverNowMs()) / 1000));
        if (secBattle > 0) return secBattle;
      }
    }
    if (fetchedAtLocal && rot.secondsToNextSlot != null) {
      var elapsed = Math.floor((Date.now() - fetchedAtLocal) / 1000);
      return Math.max(0, Number(rot.secondsToNextSlot) - elapsed);
    }
    return 0;
  }

  function isArenaVisible() {
    var arena = document.getElementById('tournamentArena');
    return arena && !arena.classList.contains('hidden');
  }

  function findGenre(genreId) {
    if (!genreId) return null;
    var fromHub = (hubData && hubData.genres || []).find(function (g) { return g.id === genreId; });
    if (fromHub) return fromHub;
    return FALLBACK_GENRES.find(function (g) { return g.id === genreId; }) || null;
  }

  function closeArenaForEnrollment() {
    if (window.TournamentBracket && typeof window.TournamentBracket.close === 'function') {
      window.TournamentBracket.close({ keepEnrollment: false });
    } else {
      var arena = document.getElementById('tournamentArena');
      if (arena) arena.classList.add('hidden');
      localStorage.removeItem('mtr_watch_tournament');
    }
    document.getElementById('depositSectionMain')?.classList.remove('hidden');
    document.getElementById('contactSection')?.classList.remove('hidden');
  }

  function clearStaleWatchState() {
    var saved = localStorage.getItem('mtr_watch_tournament');
    var joined = localStorage.getItem('mtr_joined_tournament');
    if (saved && (!joined || joined !== saved)) {
      localStorage.removeItem('mtr_watch_tournament');
    }
  }

  async function safeJson(res) {
    if (!res) return null;
    try {
      return await res.json();
    } catch (err) {
      if (err && err.name === 'AbortError') return null;
      throw err;
    }
  }

  async function fetchApi(path, options, timeoutMs, kind) {
    var isEnsure = kind === 'ensure' || String(path).indexOf('ensure-express') !== -1;
    var controller = new AbortController();
    if (isEnsure) {
      hubEnsureController = controller;
    } else {
      if (hubPollController) {
        try { hubPollController.abort(); } catch (e) { /* ignore */ }
      }
      hubPollController = controller;
    }
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || API_TIMEOUT_MS);
    try {
      var res = await fetch(backendUrl() + path, Object.assign({}, options || {}, {
        signal: controller.signal,
        cache: 'no-store'
      }));
      clearTimeout(timer);
      if (isEnsure && hubEnsureController === controller) hubEnsureController = null;
      if (!isEnsure && hubPollController === controller) hubPollController = null;
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (isEnsure && hubEnsureController === controller) hubEnsureController = null;
      if (!isEnsure && hubPollController === controller) hubPollController = null;
      if (err && err.name === 'AbortError') return null;
      throw err;
    }
  }

  async function wakeBackend() {
    try {
      await fetchApi('/api/health', { method: 'GET' }, 60000);
    } catch (e) {
      console.warn('[tournament-hub] wake:', e.message || e);
    }
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
    else console.log('[tournament-hub]', msg);
  }

  async function fetchHub(forceSync) {
    if (isArenaVisible()) return hubData || buildFallbackHubData();
    var timeout = forceSync ? API_TIMEOUT_MS : HUB_GET_TIMEOUT_MS;
    if (forceSync && Date.now() - lastHubSyncAt < HUB_SYNC_COOLDOWN_MS) {
      forceSync = false;
    }
    if (forceSync) {
      try {
        var syncRes = await fetchApi('/api/tournaments/hub/sync', { method: 'POST' }, API_TIMEOUT_MS);
        if (!syncRes) return hubData || buildFallbackHubData();
        var syncData = await safeJson(syncRes);
        if (!syncData) return hubData || buildFallbackHubData();
        if (syncRes.ok && syncData.ok) {
          lastHubSyncAt = Date.now();
          applyHubData(syncData);
          return syncData;
        }
      } catch (syncErr) {
        if (syncErr && syncErr.name !== 'AbortError') {
          console.warn('[tournament-hub] sync POST:', syncErr.message || syncErr);
        }
      }
    }
    var res = await fetchApi('/api/tournaments/hub', { method: 'GET' }, timeout);
    if (!res) return hubData || buildFallbackHubData();
    var data = await safeJson(res);
    if (!data) return hubData || buildFallbackHubData();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Error cargando torneos');
    applyHubData(data);
    return data;
  }

  async function syncHubSlots() {
    if (hubSyncInFlight) return;
    hubSyncInFlight = true;
    try {
      await fetchHub(true);
    } catch (e) {
      console.error('[tournament-hub] sync:', e);
    } finally {
      hubSyncInFlight = false;
    }
  }

  function patchGenreExpress(genreId, express) {
    if (!hubData || !express) return;
    var idx = (hubData.genres || []).findIndex(function (x) { return x.id === genreId; });
    if (idx >= 0) hubData.genres[idx].express = express;
  }

  async function ensureExpressSlot(genreId, options) {
    if (!genreId) return null;
    options = options || {};
    var cached = expressSlotCache[genreId];
    if (!options.force && cached && Date.now() - cached.at < EXPRESS_CACHE_MS) {
      return cached.express;
    }
    if (ensureByGenre[genreId]) return ensureByGenre[genreId];

    ensureByGenre[genreId] = (async function () {
      try {
        if (!options.skipWake) await wakeBackend();
        for (var attempt = 1; attempt <= 3; attempt++) {
          var res = await fetchApi(
            '/api/tournaments/genre/' + genreId + '/ensure-express',
            { method: 'POST', headers: { 'Content-Type': 'application/json' } },
            ENSURE_TIMEOUT_MS,
            'ensure'
          );
          if (!res) {
            if (attempt < 3) {
              await new Promise(function (r) { setTimeout(r, 1500 * attempt); });
              continue;
            }
            return null;
          }
          var data = await safeJson(res);
          if (!data) continue;
          if (res.ok && data.ok && data.express && data.express.id) {
            patchGenreExpress(genreId, data.express);
            ensureRequested[genreId] = true;
            expressSlotCache[genreId] = { express: data.express, at: Date.now() };
            return data.express;
          }
          if (data.error && attempt === 3) {
            throw new Error(data.error);
          }
          await new Promise(function (r) { setTimeout(r, 1500 * attempt); });
        }
        return null;
      } catch (e) {
        console.error('[tournament-hub] ensure-express:', e);
        toast(e.message || 'Servidor lento. Espera unos segundos e inténtalo de nuevo.', 'error');
        return null;
      } finally {
        delete ensureByGenre[genreId];
      }
    })();

    return ensureByGenre[genreId];
  }

  async function handleExpressJoin(exp, genre, btn) {
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Abriendo Express…';
    }
    try {
      var slot = exp;
      if (!slot || !slot.id) {
        slot = await ensureExpressSlot(genre.id);
      }
      if (!slot || !slot.id) {
        toast('No se pudo abrir el Express. El servidor puede estar despertando — reintenta en 10 s.', 'error');
        return;
      }
      await beginEnrollment(slot, genre, 'express');
    } catch (e) {
      console.error('[tournament-hub] express join:', e);
      toast('No se pudo abrir la inscripción. Reintenta.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        var fee = (exp && exp.entry_fee) || 3;
        btn.textContent = (exp && !exp.id ? 'Abrir e inscribirme · ' : 'Inscribirme · ') + fee + ' cr';
      }
    }
  }

  function countdownHtml(seconds, sizeClass) {
    sizeClass = sizeClass || 'text-2xl';
    var pct = Math.min(100, Math.max(0, (seconds / 300) * 100));
    var urgent = seconds <= 60;
    return (
      '<div class="tournament-countdown flex flex-col items-center gap-2">' +
      '<div class="' + sizeClass + ' font-black tabular-nums ' + (urgent ? 'text-red-400 animate-pulse' : 'text-cyan-400') + '" data-countdown-display>' +
      fmtClock(seconds) + '</div>' +
      '<div class="w-full max-w-xs h-2 rounded-full bg-gray-800 overflow-hidden">' +
      '<div class="h-full rounded-full transition-all duration-1000 ' + (urgent ? 'bg-red-500' : 'bg-cyan-500') + '" style="width:' + pct + '%"></div></div>' +
      '<div class="text-[11px] text-gray-500">Batalla inicia al llegar a 0:00</div></div>'
    );
  }

  function renderRotationBanner() {
    var el = document.getElementById('tournamentRotationBanner');
    if (!el || !hubData) return;
    var rot = hubData.expressRotation || {};
    var cfg = hubData.config || {};
    var active = rot.activeExpressCount || cfg.activeExpressCount || 14;
    var total = rot.totalGenres || 14;
    var minSec = rotationCountdownSeconds();
    var liveBattles = countLiveBattles();
    var timerBlock;

    if (minSec > 0) {
      timerBlock =
        '<div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Próxima batalla (más cercana)</div>' +
        countdownHtml(minSec, 'text-3xl');
    } else if (liveBattles > 0) {
      timerBlock =
        '<div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Estado Express</div>' +
        '<div class="text-2xl font-black text-purple-300 tabular-nums">⚔️ EN CURSO</div>' +
        '<div class="text-[11px] text-gray-500 mt-1">' + liveBattles + ' categoría(s) en batalla</div>';
    } else {
      timerBlock =
        '<div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Próxima ronda</div>' +
        '<div class="text-xl font-bold text-amber-300 animate-pulse">♻️ Abriendo…</div>' +
        '<div class="text-[11px] text-gray-500 mt-1">Sincronizando cronómetro</div>';
    }

    el.innerHTML =
      '<div class="flex flex-wrap items-center justify-between gap-4">' +
      '<div class="flex-1 min-w-[200px]">' +
      '<div class="text-purple-300 font-semibold mb-1">⚡ ' + active + '/' + total + ' Express activos · todas las categorías</div>' +
      '<div class="text-xs text-gray-400">Inscripción 5 min por ronda · CPU llena vacantes · batalla al cerrar</div></div>' +
      '<div class="flex-shrink-0 text-center px-4 py-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5">' +
      timerBlock +
      '</div></div>';
  }

  function expressStatusLine(exp) {
    if (!exp) return 'Iniciando…';
    if (exp.status === 'registration') {
      var sec = secondsToBattle(exp);
      if (sec <= 0) return '♻️ Reiniciando ronda…';
      return '⏱ ' + fmtClock(sec) + ' · Batalla';
    }
    if (exp.status === 'locked') return '🔒 Preparando batalla…';
    if (exp.status === 'in_progress') return '⚔️ Batalla en curso';
    return exp.status;
  }

  function renderGenreGrid(filter) {
    var grid = document.getElementById('tournamentGenreGrid');
    if (!grid) return;
    if (!hubData || !hubData.genres || !hubData.genres.length) {
      hubData = buildFallbackHubData();
    }
    var genres = hubData.genres || [];
    if (filter && filter !== 'all') {
      genres = genres.filter(function (g) { return g.region === filter; });
    }
    grid.innerHTML = genres.map(function (g) {
      var exp = g.express;
      var wk = g.weekly;
      var expLine = exp
        ? (exp.current_participants + '/' + exp.max_participants + ' · ' + expressStatusLine(exp))
        : 'Express activo';
      var wkLine = wk
        ? (wk.current_participants + '/' + wk.max_participants + ' · Pool ' + Number(wk.prize_pool || 0).toFixed(0) + ' cr')
        : '—';
      var liveBadge = exp && exp.status === 'registration'
        ? '<span class="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">LIVE</span>'
        : (exp && exp.status === 'in_progress'
          ? '<span class="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300">EN JUEGO</span>'
          : '');
      return (
        '<button type="button" data-genre="' + g.id + '" class="tournament-genre-card group text-left p-4 rounded-xl border border-purple-500/20 bg-gray-900/60 hover:border-purple-400/40 hover:bg-purple-500/5 transition-all">' +
        '<div class="text-2xl mb-2">' + g.emoji + '</div>' +
        '<div class="font-bold text-white group-hover:text-purple-300">' + g.label + '</div>' +
        '<div class="text-[11px] text-gray-500 mt-2">Express: ' + expLine + '</div>' +
        '<div class="text-[11px] text-gray-500">Semanal: ' + wkLine + '</div>' +
        liveBadge +
        '</button>'
      );
    }).join('');

    grid.querySelectorAll('.tournament-genre-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openGenreRoom(btn.getAttribute('data-genre'));
      });
    });
  }

  function renderGenreDetail() {
    var panel = document.getElementById('tournamentGenreDetail');
    if (!panel || !hubData || !selectedGenreId) return;
    var g = (hubData.genres || []).find(function (x) { return x.id === selectedGenreId; });
    if (!g) return;

    document.getElementById('tournamentGenreTitle').textContent = (g.emoji || '') + ' ' + g.label;
    var exp = g.express;
    var wk = g.weekly;
    var sec = exp ? secondsToBattle(exp) : 0;
    var expressOpen = exp && exp.status === 'registration' && sec > 0;
    var expressNeedsId = expressOpen && !exp.id;

    var expressHtml = exp
      ? '<div class="p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5">' +
        '<div class="text-sm font-bold text-cyan-300 mb-3">⚡ Express · siempre activo</div>' +
        (expressOpen
          ? '<div class="mb-4 p-4 rounded-xl border border-cyan-500/25 bg-black/30 text-center" id="genreExpressCountdown">' +
            countdownHtml(sec, 'text-4xl') +
            '<p class="text-xs text-cyan-200/80 mt-3">Inscríbete antes de que termine el cronómetro</p></div>'
          : (exp.status === 'registration' && sec === 0
            ? '<p class="text-sm text-amber-300 mb-3 animate-pulse">⏳ Actualizando slot Express… recarga en unos segundos</p>'
            : '<p class="text-sm text-amber-300 mb-3">' + expressStatusLine(exp) + '</p>')) +
        '<div class="text-xs text-gray-400 space-y-1">' +
        '<div>Entry: <strong class="text-white">' + exp.entry_fee + ' cr</strong></div>' +
        '<div>Jugadores: <strong class="text-white">' + exp.current_participants + '/' + exp.max_participants + '</strong></div>' +
        '<div>Prize pool: <strong class="text-white">' + Number(exp.prize_pool || 0).toFixed(1) + ' cr</strong></div>' +
        '<div class="w-full bg-gray-800 rounded-full h-2 mt-2"><div class="bg-cyan-500 h-2 rounded-full transition-all" style="width:' +
        Math.min(100, (exp.current_participants / exp.max_participants) * 100) + '%"></div></div>' +
        '</div>' +
        (expressOpen
          ? '<button type="button" class="mt-3 w-full py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-cyan-600 to-purple-600 text-white" data-join-express="' + (exp.id || '') + '" data-genre-id="' + g.id + '">' +
            (expressNeedsId ? 'Abrir e inscribirme · ' : '🎵 Elegir canción e inscribirme · ') + exp.entry_fee + ' cr</button>'
          : (exp.status === 'in_progress' || exp.status === 'locked'
            ? '<div class="mt-3 space-y-2">' +
              '<button type="button" class="w-full py-2.5 rounded-lg text-sm font-bold bg-cyan-600/80 text-white border border-cyan-400/30" data-watch-express="' + exp.id + '" data-genre-id="' + g.id + '">👀 Ver batalla en curso</button>' +
              '<button type="button" class="w-full py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-cyan-600 to-purple-600 text-white" data-enroll-next-express data-genre-id="' + g.id + '">🎵 Inscribirme en la próxima ronda</button>' +
              '</div>'
            : '<button type="button" class="mt-3 w-full py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-cyan-600 to-purple-600 text-white" data-enroll-next-express data-genre-id="' + g.id + '">🎵 Abrir inscripción y elegir canción</button>')) +
        '</div>'
      : '<p class="text-sm text-gray-500">Express cargando…</p>';

    var weeklyHtml = wk
      ? '<div class="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5">' +
        '<div class="text-sm font-bold text-purple-300 mb-2">🏆 Grand Prix Semanal</div>' +
        '<div class="text-xs text-gray-400 space-y-1">' +
        '<div>Entry: <strong class="text-white">' + wk.entry_fee + ' cr</strong></div>' +
        '<div>Jugadores: <strong class="text-white">' + wk.current_participants + '/' + wk.max_participants + '</strong></div>' +
        '<div>Prize pool: <strong class="text-white">' + Number(wk.prize_pool || 0).toFixed(1) + ' cr</strong></div>' +
        '<div class="w-full bg-gray-800 rounded-full h-2 mt-2"><div class="bg-purple-500 h-2 rounded-full" style="width:' +
        Math.min(100, (wk.current_participants / wk.max_participants) * 100) + '%"></div></div>' +
        '</div>' +
        (wk.status === 'registration'
          ? '<button type="button" class="mt-3 w-full py-2.5 rounded-lg text-sm font-bold bg-purple-600/80 text-white border border-purple-400/30" data-join-weekly="' + wk.id + '">Inscribirme · ' + wk.entry_fee + ' cr</button>'
          : (wk.status === 'in_progress' || wk.status === 'locked'
            ? '<button type="button" class="mt-3 w-full py-2.5 rounded-lg text-sm font-bold bg-purple-500 text-white" data-watch-weekly="' + wk.id + '">Ver competencia Grand Prix</button>'
            : '<p class="mt-3 text-xs text-amber-300">Inscripción cerrada</p>')) +
        '</div>'
      : '<p class="text-sm text-gray-500">Grand Prix no disponible.</p>';

    document.getElementById('tournamentGenrePanels').innerHTML =
      '<div class="grid md:grid-cols-2 gap-4">' + expressHtml + weeklyHtml + '</div>' +
      '<p class="text-[11px] text-gray-500 mt-4">Cada género tiene Express propio. El cronómetro marca cuándo cierra inscripción e inicia la batalla.</p>';

    var joinExp = panel.querySelector('[data-join-express]');
    if (joinExp) {
      joinExp.addEventListener('click', function () {
        handleExpressJoin(exp, g, joinExp);
      });
    }

    if (expressNeedsId && selectedGenreId && !ensureRequested[selectedGenreId] && !ensureByGenre[selectedGenreId]) {
      ensureRequested[selectedGenreId] = true;
      ensureExpressSlot(selectedGenreId).then(function (ensured) {
        if (ensured && ensured.id) renderGenreDetail();
        else ensureRequested[selectedGenreId] = false;
      }).catch(function () {
        ensureRequested[selectedGenreId] = false;
      });
    }
    var watchExp = panel.querySelector('[data-watch-express]');
    if (watchExp && window.TournamentBracket && exp.id) {
      watchExp.addEventListener('click', function () {
        window.TournamentBracket.watch(exp.id, g.id);
      });
    }
    panel.querySelectorAll('[data-enroll-next-express]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        handleExpressJoin(null, g, btn);
      });
    });
    var joinWk = panel.querySelector('[data-join-weekly]');
    if (joinWk) {
      joinWk.addEventListener('click', function () {
        beginEnrollment(wk, g, 'weekly');
      });
    }
    var watchWk = panel.querySelector('[data-watch-weekly]');
    if (watchWk && window.TournamentBracket) {
      watchWk.addEventListener('click', function () {
        window.TournamentBracket.watch(wk.id);
      });
    }
  }

  function pauseTimers() {
    if (pollTimer) clearInterval(pollTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    pollTimer = null;
    countdownTimer = null;
  }

  function resumeHubTimers() {
    var hub = document.getElementById('tournamentHub');
    if (!hub || hub.classList.contains('hidden') || isArenaVisible()) return;
    startCountdownLoop();
    if (!pollTimer) {
      pollTimer = setInterval(function () {
        refresh(false).catch(function (e) {
          if (!e || e.name !== 'AbortError') {
            console.warn('[tournament-hub] poll refresh:', e);
          }
        });
      }, 15000);
    }
  }

  function abortHubFetches() {
    if (hubPollController) {
      try { hubPollController.abort(); } catch (e) { /* ignore */ }
      hubPollController = null;
    }
    if (hubEnsureController) {
      try { hubEnsureController.abort(); } catch (e) { /* ignore */ }
      hubEnsureController = null;
    }
    hubSyncInFlight = false;
  }

  function stopEnrollmentCountdown() {
    if (enrollmentCountdownTimer) clearInterval(enrollmentCountdownTimer);
    enrollmentCountdownTimer = null;
  }

  function startEnrollmentCountdown(genreLabel, type, tournament) {
    stopEnrollmentCountdown();
    if (type !== 'express' || !tournament?.registration_closes_at) return;
    enrollmentCountdownTimer = setInterval(function () {
      var enrollment = window.tournamentEnrollment;
      if (!enrollment) {
        stopEnrollmentCountdown();
        return;
      }
      updateEnrollmentSubtitle(genreLabel, type, {
        entry_fee: enrollment.entryFee,
        registration_closes_at: enrollment.closesAt || tournament.registration_closes_at
      });
    }, 1000);
  }

  function tickCountdowns() {
    if (!hubData) return;
    if (isArenaVisible()) return;
    renderRotationBanner();
    if (selectedGenreId) {
      var cd = document.getElementById('genreExpressCountdown');
      if (cd) {
        var g = (hubData.genres || []).find(function (x) { return x.id === selectedGenreId; });
        if (g && g.express && g.express.status === 'registration') {
          cd.innerHTML = countdownHtml(secondsToBattle(g.express), 'text-4xl') +
            '<p class="text-xs text-cyan-200/80 mt-3">Inscríbete antes de que termine el cronómetro</p>';
        }
      }
    } else {
      renderGenreGrid(document.getElementById('tournamentGenreFilter')?.value || 'all');
    }
    var anyZero = (hubData.genres || []).some(function (g) {
      return g.express && g.express.status === 'registration' && secondsToBattle(g.express) === 0;
    });
    if (anyZero) {
      if (!zeroSinceLocal) zeroSinceLocal = Date.now();
      if (
        Date.now() - zeroSinceLocal > 5000 &&
        Date.now() - lastHubSyncAt > HUB_SYNC_COOLDOWN_MS &&
        !hubSyncInFlight
      ) {
        refresh(false).catch(function (e) {
          console.warn('[tournament-hub] zero refresh:', e);
        });
      }
    } else {
      zeroSinceLocal = null;
    }
  }

  function updateEnrollmentSubtitle(genreLabel, type, tournament) {
    var sub = document.getElementById('socialChallengeSubtitle');
    if (!sub) return;
    var sec = '';
    if (type === 'express' && tournament && tournament.registration_closes_at) {
      var closes = new Date(tournament.registration_closes_at).getTime();
      var left = Math.max(0, Math.floor((closes - serverNowMs()) / 1000));
      sec = fmtClock(left);
    }
    sub.textContent = (type === 'express' ? 'Express' : 'Grand Prix') +
      ' · Entry ' + (tournament?.entry_fee || 3) + ' cr' +
      (sec ? ' · Batalla en ' + sec : '') +
      ' · Elige canción de ' + genreLabel;
  }

  async function beginEnrollment(tournament, genre, type) {
    if (!tournament || !genre) return;
    pauseTimers();
    closeArenaForEnrollment();
    clearStaleWatchState();
    if (type === 'express' && (!tournament.id || tournament.status === 'in_progress' || tournament.status === 'locked' || tournament.status === 'completed')) {
      var fresh = await ensureExpressSlot(genre.id, { force: true });
      if (fresh && fresh.id) tournament = fresh;
    }
    if (!tournament.id) {
      toast('Express no disponible todavía. Espera unos segundos y pulsa de nuevo.', 'error');
      return;
    }
    if (tournament.status && tournament.status !== 'registration') {
      toast('Esta ronda ya no acepta inscripciones. Abriendo la siguiente…', 'info');
      var nextSlot = await ensureExpressSlot(genre.id, { force: true });
      if (!nextSlot || !nextSlot.id || nextSlot.status !== 'registration') {
        toast('Inscripción cerrada. Espera la próxima ronda Express.', 'warning');
        return;
      }
      tournament = nextSlot;
    }
    window.tournamentEnrollment = {
      id: tournament.id,
      genreId: genre.id,
      genreLabel: genre.label,
      deezerQuery: genre.deezerQuery || genre.label,
      entryFee: Number(tournament.entry_fee),
      type: type,
      name: tournament.name,
      closesAt: tournament.registration_closes_at || null
    };
    window.currentMode = 'tournament';

    var hub = document.getElementById('tournamentHub');
    var song = document.getElementById('songSelection');
    var modeSelector = document.getElementById('modeSelector');
    if (hub) hub.classList.add('hidden');
    if (modeSelector) modeSelector.classList.add('hidden');
    if (song) song.classList.remove('hidden');
    window.currentMode = 'tournament';

    var title = document.getElementById('modeTitle');
    var sub = document.getElementById('socialChallengeSubtitle');
    if (title) title.textContent = 'Torneo · ' + genre.label;
    if (sub) {
      updateEnrollmentSubtitle(genre.label, type, tournament);
    }

    var betInput = document.getElementById('betAmount');
    if (betInput) {
      betInput.value = String(tournament.entry_fee);
      betInput.readOnly = true;
      betInput.classList.add('opacity-70');
    }

    if (typeof updateActionButtons === 'function') updateActionButtons('tournament');
    startEnrollmentCountdown(genre.label, type, tournament);
    toast('Elige tu canción (' + genre.label + ') y confirma inscripción', 'info');
  }

  async function openGenreRoom(genreId) {
    selectedGenreId = genreId;
    document.getElementById('tournamentGenreListView').classList.add('hidden');
    document.getElementById('tournamentGenreDetail').classList.remove('hidden');
    renderGenreDetail();
    var g = (hubData?.genres || []).find(function (x) { return x.id === genreId; });
    if (g && g.express && g.express.status === 'registration' && !g.express.id) {
      await ensureExpressSlot(genreId);
      renderGenreDetail();
    }
  }

  function showGenreList() {
    selectedGenreId = null;
    document.getElementById('tournamentGenreDetail').classList.add('hidden');
    document.getElementById('tournamentGenreListView').classList.remove('hidden');
  }

  async function refresh(forceSync) {
    try {
      if (forceSync) {
        await syncHubSlots();
      } else {
        await fetchHub(false);
      }
      renderRotationBanner();
      if (selectedGenreId) renderGenreDetail();
      else renderGenreGrid(document.getElementById('tournamentGenreFilter')?.value || 'all');
    } catch (e) {
      console.error('[tournament-hub]', e);
      if (!hubData || !hubData.genres?.length) {
        applyHubData(buildFallbackHubData());
      }
      renderRotationBanner();
      renderGenreGrid(document.getElementById('tournamentGenreFilter')?.value || 'all');
      renderHubError('Servidor lento. Mostrando categorías locales — pulsa Reintentar.');
      toast('Torneos: conexión lenta, reintentando…', 'warning');
    }
  }

  function startCountdownLoop() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(tickCountdowns, 1000);
  }

  function beginEnrollmentFromArena(tournament, genreId) {
    var genre = findGenre(genreId);
    if (!genre) {
      toast('Categoría no encontrada. Vuelve al hub.', 'error');
      return;
    }
    var slot = {
      id: tournament.id,
      entry_fee: tournament.entry_fee,
      registration_closes_at: tournament.registration_closes_at,
      name: tournament.name,
      status: tournament.status
    };
    beginEnrollment(slot, genre, tournament.tournament_type === 'weekly' ? 'weekly' : 'express');
  }

  function open() {
    clearStaleWatchState();
    if (isArenaVisible() && !localStorage.getItem('mtr_joined_tournament')) {
      closeArenaForEnrollment();
    }
    var hub = document.getElementById('tournamentHub');
    if (hub) hub.classList.remove('hidden');
    showGenreList();
    zeroSinceLocal = null;
    applyHubData(buildFallbackHubData());
    renderHubLoading('Cargando 14 categorías…');
    renderGenreGrid('all');
    startCountdownLoop();
    refresh(false).then(function () {
      return syncHubSlots();
    }).then(function () {
      renderRotationBanner();
      renderGenreGrid(document.getElementById('tournamentGenreFilter')?.value || 'all');
    }).catch(function (e) {
      if (!e || e.name !== 'AbortError') {
        console.warn('[tournament-hub] open refresh:', e);
      }
    });
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      refresh(false).catch(function (e) {
        if (!e || e.name !== 'AbortError') {
          console.warn('[tournament-hub] poll refresh:', e);
        }
      });
    }, 15000);
  }

  function close() {
    pauseTimers();
    stopEnrollmentCountdown();
    abortHubFetches();
    var hub = document.getElementById('tournamentHub');
    if (hub) hub.classList.add('hidden');
    window.tournamentEnrollment = null;
    var betInput = document.getElementById('betAmount');
    if (betInput) {
      betInput.readOnly = false;
      betInput.classList.remove('opacity-70');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var filter = document.getElementById('tournamentGenreFilter');
    if (filter) {
      filter.addEventListener('change', function () {
        renderGenreGrid(filter.value);
      });
    }
    var backBtn = document.getElementById('tournamentGenreBackBtn');
    if (backBtn) backBtn.addEventListener('click', showGenreList);
  });

  window.TournamentHub = {
    open: open,
    close: close,
    pauseTimers: pauseTimers,
    resumeHubTimers: resumeHubTimers,
    stopEnrollmentCountdown: stopEnrollmentCountdown,
    ensureExpressSlot: ensureExpressSlot,
    refresh: refresh,
    beginEnrollment: beginEnrollment,
    beginEnrollmentFromArena: beginEnrollmentFromArena,
    secondsToBattle: secondsToBattle
  };
})();
