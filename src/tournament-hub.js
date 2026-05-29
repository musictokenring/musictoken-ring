/**
 * Hub de torneos — 14 Express activos + Grand Prix + cronómetro en vivo.
 */
(function () {
  'use strict';

  var pollTimer = null;
  var countdownTimer = null;
  var hubData = null;
  var selectedGenreId = null;
  var serverSkewMs = 0;
  var fetchedAtLocal = 0;
  var hubSyncInFlight = false;
  var zeroSinceLocal = null;
  var API_TIMEOUT_MS = 55000;

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
    if (!exp || exp.status !== 'registration' || !exp.registration_closes_at) return 0;
    var closes = new Date(exp.registration_closes_at).getTime();
    if (closes <= serverNowMs()) return 0;
    return Math.max(0, Math.floor((closes - serverNowMs()) / 1000));
  }

  function isOpenRegistration(exp) {
    return exp && exp.status === 'registration' && secondsToBattle(exp) > 0;
  }

  async function fetchApi(path, options, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || API_TIMEOUT_MS);
    try {
      var res = await fetch(backendUrl() + path, Object.assign({}, options || {}, {
        signal: controller.signal,
        cache: 'no-store'
      }));
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
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
    var path = forceSync ? '/api/tournaments/hub/sync' : '/api/tournaments/hub';
    var res = await fetchApi(path, { method: forceSync ? 'POST' : 'GET' });
    var data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Error cargando torneos');
    hubData = data;
    if (data.serverTime) {
      serverSkewMs = Date.now() - new Date(data.serverTime).getTime();
      fetchedAtLocal = Date.now();
    }
    var anyOpen = (data.genres || []).some(function (g) {
      return isOpenRegistration(g.express);
    });
    if (anyOpen) zeroSinceLocal = null;
    return data;
  }

  async function syncHubSlots() {
    if (hubSyncInFlight) return;
    hubSyncInFlight = true;
    try {
      await wakeBackend();
      await fetchHub(true);
    } catch (e) {
      console.error('[tournament-hub] sync:', e);
    } finally {
      hubSyncInFlight = false;
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
    var minSec = rot.secondsToBattle || 0;
    (hubData.genres || []).forEach(function (g) {
      if (isOpenRegistration(g.express)) {
        var s = secondsToBattle(g.express);
        if (s > 0 && (minSec <= 0 || s < minSec)) minSec = s;
      }
    });
    if (!minSec || minSec <= 0) {
      minSec = rot.secondsToBattle || rot.secondsToNextSlot || 0;
    }

    el.innerHTML =
      '<div class="flex flex-wrap items-center justify-between gap-4">' +
      '<div class="flex-1 min-w-[200px]">' +
      '<div class="text-purple-300 font-semibold mb-1">⚡ ' + active + '/' + total + ' Express activos · todas las categorías</div>' +
      '<div class="text-xs text-gray-400">Inscripción 5 min por ronda · CPU llena vacantes · batalla al cerrar</div></div>' +
      '<div class="flex-shrink-0 text-center px-4 py-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5">' +
      '<div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Próxima batalla (más cercana)</div>' +
      countdownHtml(minSec, 'text-3xl') +
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
    if (!grid || !hubData) return;
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
    var expressOpen = exp && exp.status === 'registration' && exp.id && sec > 0;

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
          ? '<button type="button" class="mt-3 w-full py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-cyan-600 to-purple-600 text-white" data-join-express="' + exp.id + '">Inscribirme · ' + exp.entry_fee + ' cr</button>'
          : (exp.status === 'in_progress' || exp.status === 'locked'
            ? '<button type="button" class="mt-3 w-full py-2.5 rounded-lg text-sm font-bold bg-cyan-600 text-white" data-watch-express="' + exp.id + '">Ver batalla Express</button>'
            : '<p class="mt-3 text-xs text-amber-300">Esperando nuevo slot…</p>')) +
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
        beginEnrollment(exp, g, 'express');
      });
    }
    var watchExp = panel.querySelector('[data-watch-express]');
    if (watchExp && window.TournamentBracket && exp.id) {
      watchExp.addEventListener('click', function () {
        window.TournamentBracket.watch(exp.id);
      });
    }
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

  function tickCountdowns() {
    if (!hubData) return;
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
      if (Date.now() - zeroSinceLocal > 3000 && !hubSyncInFlight) {
        syncHubSlots().then(function () {
          renderRotationBanner();
          if (selectedGenreId) renderGenreDetail();
          else renderGenreGrid(document.getElementById('tournamentGenreFilter')?.value || 'all');
        });
      }
    } else {
      zeroSinceLocal = null;
    }
  }

  function beginEnrollment(tournament, genre, type) {
    if (!tournament || !genre || !tournament.id) return;
    window.tournamentEnrollment = {
      id: tournament.id,
      genreId: genre.id,
      genreLabel: genre.label,
      deezerQuery: genre.deezerQuery || genre.label,
      entryFee: Number(tournament.entry_fee),
      type: type,
      name: tournament.name
    };
    window.currentMode = 'tournament';

    var hub = document.getElementById('tournamentHub');
    var song = document.getElementById('songSelection');
    if (hub) hub.classList.add('hidden');
    if (song) song.classList.remove('hidden');

    var title = document.getElementById('modeTitle');
    var sub = document.getElementById('socialChallengeSubtitle');
    if (title) title.textContent = 'Torneo · ' + genre.label;
    if (sub) {
      var sec = type === 'express' && tournament.registration_closes_at
        ? fmtClock(secondsToBattle(tournament))
        : '';
      sub.textContent = (type === 'express' ? 'Express' : 'Grand Prix') +
        ' · Entry ' + tournament.entry_fee + ' cr' +
        (sec ? ' · Batalla en ' + sec : '') +
        ' · Elige canción de ' + genre.label;
    }

    var betInput = document.getElementById('betAmount');
    if (betInput) {
      betInput.value = String(tournament.entry_fee);
      betInput.readOnly = true;
      betInput.classList.add('opacity-70');
    }

    if (typeof updateActionButtons === 'function') updateActionButtons('tournament');
    toast('Elige tu canción (' + genre.label + ') y confirma inscripción', 'info');
  }

  function openGenreRoom(genreId) {
    selectedGenreId = genreId;
    document.getElementById('tournamentGenreListView').classList.add('hidden');
    document.getElementById('tournamentGenreDetail').classList.remove('hidden');
    renderGenreDetail();
  }

  function showGenreList() {
    selectedGenreId = null;
    document.getElementById('tournamentGenreDetail').classList.add('hidden');
    document.getElementById('tournamentGenreListView').classList.remove('hidden');
  }

  async function refresh(forceSync) {
    try {
      if (forceSync) await syncHubSlots();
      else await fetchHub(false);
      renderRotationBanner();
      if (selectedGenreId) renderGenreDetail();
      else renderGenreGrid(document.getElementById('tournamentGenreFilter')?.value || 'all');
    } catch (e) {
      console.error('[tournament-hub]', e);
    }
  }

  function startCountdownLoop() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(tickCountdowns, 1000);
  }

  function open() {
    var hub = document.getElementById('tournamentHub');
    if (hub) hub.classList.remove('hidden');
    showGenreList();
    zeroSinceLocal = null;
    wakeBackend().then(function () { return refresh(true); });
    startCountdownLoop();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      var stuck = (hubData?.genres || []).every(function (g) {
        return !isOpenRegistration(g.express);
      });
      refresh(stuck);
    }, 8000);
  }

  function close() {
    if (pollTimer) clearInterval(pollTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    pollTimer = null;
    countdownTimer = null;
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
    refresh: refresh,
    beginEnrollment: beginEnrollment,
    secondsToBattle: secondsToBattle
  };
})();
