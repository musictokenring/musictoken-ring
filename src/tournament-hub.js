/**
 * Hub de torneos — 14 géneros, Express 10 min, Grand Prix semanal.
 */
(function () {
  'use strict';

  var pollTimer = null;
  var hubData = null;
  var selectedGenreId = null;
  var activeTab = 'express';

  function backendUrl() {
    return (window.CONFIG && window.CONFIG.BACKEND_API) || 'https://musictoken-ring.onrender.com';
  }

  function fmtTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
    else console.log('[tournament-hub]', msg);
  }

  async function fetchHub() {
    var res = await fetch(backendUrl() + '/api/tournaments/hub', { cache: 'no-store' });
    var data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Error cargando torneos');
    hubData = data;
    return data;
  }

  function renderRotationBanner() {
    var el = document.getElementById('tournamentRotationBanner');
    if (!el || !hubData) return;
    var rot = hubData.expressRotation || {};
    var cur = rot.currentGenre || {};
    var nxt = rot.nextGenre || {};
    el.innerHTML =
      '<div class="flex flex-wrap items-center justify-between gap-3">' +
      '<div><span class="text-purple-300 font-semibold">Express activo:</span> ' +
      (cur.emoji || '🏆') + ' <strong class="text-white">' + (cur.label || '') + '</strong>' +
      ' · cierra inscripción en <span class="text-cyan-400 font-mono">' + fmtTime(rot.secondsToClose) + '</span></div>' +
      '<div class="text-xs text-gray-500">Siguiente slot (10 min): ' + (nxt.emoji || '') + ' ' + (nxt.label || '') +
      ' en <span class="text-gray-400 font-mono">' + fmtTime(rot.secondsToNextSlot) + '</span></div></div>';
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
        ? (exp.current_participants + '/' + exp.max_participants + ' · Pool ' + Number(exp.prize_pool || 0).toFixed(0) + ' cr')
        : 'Sin express abierto';
      var wkLine = wk
        ? (wk.current_participants + '/' + wk.max_participants + ' · Pool ' + Number(wk.prize_pool || 0).toFixed(0) + ' cr')
        : '—';
      return (
        '<button type="button" data-genre="' + g.id + '" class="tournament-genre-card group text-left p-4 rounded-xl border border-purple-500/20 bg-gray-900/60 hover:border-purple-400/40 hover:bg-purple-500/5 transition-all">' +
        '<div class="text-2xl mb-2">' + g.emoji + '</div>' +
        '<div class="font-bold text-white group-hover:text-purple-300">' + g.label + '</div>' +
        '<div class="text-[11px] text-gray-500 mt-2">Express: ' + expLine + '</div>' +
        '<div class="text-[11px] text-gray-500">Semanal: ' + wkLine + '</div>' +
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
    var cfg = hubData.config || {};

    var expressHtml = exp
      ? '<div class="p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5">' +
        '<div class="text-sm font-bold text-cyan-300 mb-2">⚡ Express (cada 10 min)</div>' +
        '<div class="text-xs text-gray-400 space-y-1">' +
        '<div>Entry: <strong class="text-white">' + exp.entry_fee + ' cr</strong></div>' +
        '<div>Jugadores: <strong class="text-white">' + exp.current_participants + '/' + exp.max_participants + '</strong></div>' +
        '<div>Prize pool: <strong class="text-white">' + Number(exp.prize_pool || 0).toFixed(1) + ' cr</strong></div>' +
        '<div class="w-full bg-gray-800 rounded-full h-2 mt-2"><div class="bg-cyan-500 h-2 rounded-full transition-all" style="width:' +
        Math.min(100, (exp.current_participants / exp.max_participants) * 100) + '%"></div></div>' +
        '</div>' +
        (exp.status === 'registration'
          ? '<button type="button" class="mt-3 w-full py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-cyan-600 to-purple-600 text-white" data-join-express="' + exp.id + '">Inscribirme · ' + exp.entry_fee + ' cr</button>'
          : '<p class="mt-3 text-xs text-amber-300">Inscripción cerrada</p>') +
        '</div>'
      : '<p class="text-sm text-gray-500">No hay Express abierto para este género ahora.</p>';

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
      '<p class="text-[11px] text-gray-500 mt-4">Express: 4 jugadores, CPU llena vacantes. Grand Prix: 16 jugadores, bracket completo con CPU. Premio solo entre humanos si hay mayoría real.</p>';

    var joinExp = panel.querySelector('[data-join-express]');
    if (joinExp) {
      joinExp.addEventListener('click', function () {
        beginEnrollment(exp, g, 'express');
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

  function beginEnrollment(tournament, genre, type) {
    if (!tournament || !genre) return;
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
      sub.textContent = (type === 'express' ? 'Express' : 'Grand Prix') +
        ' · Entry ' + tournament.entry_fee + ' cr · Elige una canción de ' + genre.label;
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

  async function refresh() {
    try {
      await fetchHub();
      renderRotationBanner();
      if (selectedGenreId) renderGenreDetail();
      else renderGenreGrid(document.getElementById('tournamentGenreFilter')?.value || 'all');
    } catch (e) {
      console.error('[tournament-hub]', e);
    }
  }

  function open() {
    var hub = document.getElementById('tournamentHub');
    if (hub) hub.classList.remove('hidden');
    showGenreList();
    refresh();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 15000);
  }

  function close() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
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
    beginEnrollment: beginEnrollment
  };
})();
