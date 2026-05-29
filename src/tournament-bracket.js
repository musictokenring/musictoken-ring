/**
 * Vista de torneo Express: lobby, bracket y reproducción de duelos.
 */
(function () {
  'use strict';

  var pollTimer = null;
  var countdownTimer = null;
  var watchId = null;
  var playing = false;
  var lobbyClosesAt = null;
  var lobbyStatus = null;
  var serverSkewMs = 0;
  var lastLobbyData = null;

  function backendUrl() {
    return (window.CONFIG && window.CONFIG.BACKEND_API) || 'https://musictoken-ring.onrender.com';
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

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
  }

  function hideSections() {
    ['modeSelector', 'songSelection', 'tournamentHub'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }

  function showArena() {
    hideSections();
    document.getElementById('depositSectionMain')?.classList.add('hidden');
    document.getElementById('contactSection')?.classList.add('hidden');
    var arena = document.getElementById('tournamentArena');
    if (arena) arena.classList.remove('hidden');
  }

  function renderBracketRoster(b) {
    var grid = document.getElementById('tournamentBracketGrid');
    if (!grid || !b || !b.participants || !b.participants.length) return;
    var cols = b.participants.length > 6
      ? 'grid-cols-2 sm:grid-cols-4'
      : 'grid-cols-2 sm:grid-cols-2';
    grid.className = 'grid ' + cols + ' gap-4 mb-6';
    grid.innerHTML =
      '<div class="col-span-full text-center mb-2">' +
      '<h3 class="text-lg font-bold text-white">⚔️ Competidores del torneo</h3>' +
      '<p class="text-xs text-gray-400">' + b.humanCount + ' humanos · ' + b.cpuCount + ' CPU</p></div>' +
      b.participants.map(function (p) {
        return (
          '<div class="p-4 rounded-2xl border-2 ' +
          (p.isCpu ? 'border-gray-600/50 bg-gray-900/60' : 'border-cyan-500/40 bg-cyan-500/10') + '">' +
          '<div class="flex flex-col items-center text-center gap-2">' +
          '<img src="' + (p.songImage || '') + '" alt="" class="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-cover shadow-lg bg-black/50" onerror="this.src=\'https://e-cdns-images.dzcdn.net/images/cover/2646329172/250x250-000000-80-0-0.jpg\'">' +
          '<div class="text-xs font-bold ' + (p.isCpu ? 'text-gray-400' : 'text-cyan-400') + '">' +
          (p.isCpu ? '🤖 ' : '👤 ') + (p.displayName || 'Jugador') + '</div>' +
          '<div class="text-sm font-bold text-white leading-tight">' + (p.songName || '—') + '</div>' +
          '<div class="text-[11px] text-gray-500">' + (p.songArtist || '') + '</div>' +
          '</div></div>'
        );
      }).join('');
  }

  function renderLobby(data) {
    if (!playing) showArena();
    var title = document.getElementById('tournamentArenaTitle');
    var sub = document.getElementById('tournamentArenaSubtitle');
    var grid = document.getElementById('tournamentBracketGrid');
    var status = document.getElementById('tournamentArenaStatus');
    var t = data.tournament || {};
    var b = data.bracket;

    if (title) title.textContent = t.name || (t.tournament_type === 'weekly' ? 'Grand Prix' : 'Torneo Express');
    if (sub) {
      var typeLabel = t.tournament_type === 'weekly' ? 'Grand Prix semanal' : 'Express';
      var secSub = lobbyClosesAt ? Math.max(0, Math.floor((lobbyClosesAt - serverNowMs()) / 1000)) : 0;
      if (t.status === 'registration' && secSub > 0) {
        sub.textContent = typeLabel + ' · inscripción abierta · batalla en ' + fmtClock(secSub);
      } else if (t.status === 'registration') {
        sub.textContent = typeLabel + ' · cerrando inscripción…';
      } else if (t.status === 'locked') {
        sub.textContent = typeLabel + ' · preparando batalla…';
      } else {
        sub.textContent = b
          ? (b.humanCount + ' humanos · ' + b.cpuCount + ' CPU · ' + (b.totalDuels || b.duels?.length || 0) + ' duelos')
          : typeLabel;
      }
    }

    if (status) {
      if (lobbyStatus === 'registration' && lobbyClosesAt) {
        var sec = Math.max(0, Math.floor((lobbyClosesAt - serverNowMs()) / 1000));
        if (sec > 0) {
          status.innerHTML =
            '<div class="text-center">' +
            '<div class="text-xs text-gray-400 mb-2">Batalla inicia cuando el cronómetro llegue a 0</div>' +
            '<div class="text-4xl font-black tabular-nums text-cyan-400 ' + (sec <= 60 ? 'animate-pulse text-red-400' : '') + '">' +
            fmtClock(sec) + '</div></div>';
        } else {
          status.innerHTML =
            '<div class="text-center">' +
            '<div class="text-sm text-amber-300 animate-pulse mb-2">⏳ Cerrando inscripción e iniciando batalla…</div>' +
            '<div class="text-4xl font-black tabular-nums text-cyan-400">00:00</div></div>';
        }
      } else if (lobbyStatus === 'locked') {
        status.innerHTML =
          '<div class="text-center text-amber-300 animate-pulse">🔒 Generando bracket y rival CPU…</div>';
      } else if (lobbyStatus === 'cancelled') {
        status.innerHTML =
          '<div class="text-center text-red-400">' +
          '<p class="font-bold mb-2">❌ Torneo cancelado</p>' +
          '<p class="text-sm text-gray-400">' +
          (lastLifecycleError || 'Sin participantes o error al iniciar.') +
          '</p></div>';
      } else if (lastLifecycleError) {
        status.innerHTML =
          '<div class="text-center text-red-400 text-sm">' + lastLifecycleError + '</div>';
      } else if (lobbyStatus) {
        var statusMap = {
          registration: '⏳ Esperando cierre de inscripción…',
          locked: '🔒 Inscripción cerrada · preparando bracket…',
          in_progress: '⚔️ Competencia en curso',
          completed: '🏁 Torneo finalizado'
        };
        status.textContent = statusMap[lobbyStatus] || lobbyStatus;
      }
    }

    if (b && b.participants && b.participants.length) {
      renderBracketRoster(b);
    } else if (grid) {
      grid.innerHTML = '';
    }
  }

  function renderResult(b) {
    var panel = document.getElementById('tournamentResultPanel');
    if (!panel || !b) return;
    panel.classList.remove('hidden');
    panel.innerHTML =
      '<div class="p-6 rounded-2xl border border-purple-500/30 bg-purple-500/10 text-center">' +
      '<div class="text-3xl mb-2">🏆</div>' +
      '<h3 class="text-xl font-bold text-white mb-2">' + (b.championName || 'Campeón') + '</h3>' +
      '<p class="text-sm text-purple-200 mb-3">' + (b.championSong || '') + '</p>' +
      '<p class="text-sm text-gray-300 mb-4">' + (b.resultMessage || '') + '</p>' +
      (b.prizeAwarded > 0
        ? '<p class="text-cyan-400 font-bold">+' + b.prizeAwarded + ' cr acreditados</p>'
        : '<p class="text-amber-300 text-sm">Sin premio acreditado en este slot</p>') +
      '<button type="button" id="tournamentBackHubBtn" class="mt-4 px-4 py-2 rounded-lg bg-white/10 text-white text-sm">Volver al hub</button>' +
      '</div>';
    var back = document.getElementById('tournamentBackHubBtn');
    if (back) {
      back.addEventListener('click', function () {
        close();
        if (typeof selectMode === 'function') selectMode('tournament');
      });
    }
  }

  async function advancePlayback(id, duelIndex) {
    await fetchApi('/api/tournaments/' + id + '/advance-playback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duelIndex: duelIndex })
    }, API_TIMEOUT_MS);
  }

  function isStaleRegistration(t) {
    if (!t || t.status !== 'registration' || !t.registration_closes_at) return false;
    var closes = new Date(t.registration_closes_at).getTime();
    return closes <= serverNowMs() - 30000;
  }

  function handleStaleSlot() {
    lastLifecycleError =
      'Este torneo expiró. Vuelve al hub y elige el Express activo (cronómetro en marcha).';
    toast(lastLifecycleError, 'warning');
    close();
    if (typeof selectMode === 'function') selectMode('tournament');
  }

  var startingBattle = false;
  var startBattleAttempts = 0;
  var lastLifecycleError = null;
  var stuckAtZeroSince = null;
  var watchGenreId = null;
  var API_TIMEOUT_MS = 55000;

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
      console.warn('[tournament-bracket] wake backend:', e.message || e);
    }
  }

  async function fetchBracket(id) {
    var res = await fetchApi('/api/tournaments/' + id + '/bracket', { method: 'GET' });
    return res.json();
  }

  async function triggerStartBattle(id) {
    try {
      var res = await fetchApi('/api/tournaments/' + id + '/start-battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, API_TIMEOUT_MS);
      if (res.status === 404) {
        var kickRes = await fetchApi('/api/tournaments/' + id + '/kick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, API_TIMEOUT_MS);
        var kicked = await kickRes.json().catch(function () { return {}; });
        if (kicked.tournament) {
          return fetchBracket(id);
        }
        return fetchBracket(id);
      }
      return res.json();
    } catch (e) {
      console.error('[tournament-bracket] start-battle:', e);
      return { ok: false, error: e.message || 'timeout' };
    }
  }

  function renderStuckAtZero() {
    var status = document.getElementById('tournamentArenaStatus');
    if (!status) return;
    status.innerHTML =
      '<div class="text-center p-4">' +
      '<div class="text-sm text-amber-300 animate-pulse mb-2">⏳ Activando servidor y batalla…</div>' +
      '<div class="text-4xl font-black tabular-nums text-cyan-400 mb-2">00:00</div>' +
      '<p class="text-xs text-gray-400">Intento ' + startBattleAttempts + ' · Render puede tardar ~1 min en despertar</p>' +
      '<button type="button" id="tournamentForceHubBtn" class="mt-3 px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm">Ir al Express activo</button>' +
      '</div>';
    var btn = document.getElementById('tournamentForceHubBtn');
    if (btn) {
      btn.onclick = function () {
        if (watchGenreId) redirectToActiveExpress(watchGenreId);
        else if (typeof selectMode === 'function') selectMode('tournament');
      };
    }
  }

  async function ensureBattleStarted() {
    if (!watchId || startingBattle) return;
    if (startBattleAttempts >= 25) return;
    startingBattle = true;
    startBattleAttempts += 1;
    renderStuckAtZero();
    try {
      if (startBattleAttempts === 1) {
        await wakeBackend();
      }
      var result = await triggerStartBattle(watchId);
      if (result && result.lifecycleError) {
        lastLifecycleError = result.lifecycleError;
      }
      if (result && result.ok && result.tournament && result.tournament.status === 'in_progress') {
        stuckAtZeroSince = null;
      }
      await refresh();
    } finally {
      startingBattle = false;
    }
  }

  async function syncWatchToLiveExpress() {
    if (!watchGenreId) return false;
    return redirectToActiveExpress(watchGenreId);
  }

  function playDuelsSequentially(data) {
    if (playing || !data.bracket || !data.bracket.duels || !data.bracket.duels.length) return;
    if (!window.GameEngine || typeof window.GameEngine.startTournamentPlayback !== 'function') {
      toast('Motor de batalla no disponible. Recarga la página.', 'error');
      return;
    }

    playing = true;
    var duels = data.bracket.duels;
    var startIdx = data.currentDuelIndex || 0;
    var tournamentId = data.tournament.id;
    var bracket = data.bracket;

    function playNext(idx) {
      if (idx >= duels.length) {
        playing = false;
        var champPreview = '';
        if (bracket.participants && bracket.winnerParticipantId) {
          var champ = bracket.participants.find(function (p) {
            return p.id === bracket.winnerParticipantId;
          });
          if (champ && champ.songPreview && window.GameEngine.playVictorySong) {
            window.GameEngine.playVictorySong(champ.songPreview);
            champPreview = champ.songName;
          }
        }
        renderResult(data.bracket);
        if (champPreview) {
          toast('🏆 Campeón: ' + champPreview, 'success');
        }
        if (window.CreditsSystem && window.connectedAddress) {
          window.CreditsSystem.loadBalance(window.connectedAddress);
        }
        document.getElementById('depositSectionMain')?.classList.remove('hidden');
        document.getElementById('contactSection')?.classList.remove('hidden');
        return;
      }

      showArena();
      var progress = document.getElementById('tournamentArenaStatus');
      if (progress) {
        progress.innerHTML =
          '<div class="text-center py-2">' +
          '<div class="text-sm text-cyan-300 font-bold">⚔️ Duelo ' + (idx + 1) + ' / ' + duels.length + '</div>' +
          '<div class="text-xs text-gray-400">' + (duels[idx].label || '') + '</div></div>';
      }

      var duel = duels[idx];
      var match = {
        id: duel.id,
        tournament_id: tournamentId,
        match_type: 'tournament',
        player1_song_name: duel.player1.songName,
        player1_song_artist: duel.player1.songArtist,
        player1_song_image: duel.player1.songImage,
        player1_song_preview: duel.player1.songPreview,
        player2_song_name: duel.player2.songName,
        player2_song_artist: duel.player2.songArtist,
        player2_song_image: duel.player2.songImage,
        player2_song_preview: duel.player2.songPreview,
        player1_bet: data.tournament.entry_fee,
        player2_bet: data.tournament.entry_fee,
        player1_label: duel.player1.displayName,
        player2_label: duel.player2.displayName,
        preset_plays1: duel.plays1,
        preset_plays2: duel.plays2,
        duel_label: duel.label
      };

      window.GameEngine.startTournamentPlayback(match, {
        onComplete: function () {
          advancePlayback(tournamentId, idx).then(function () {
            setTimeout(function () { playNext(idx + 1); }, duels.length > 5 ? 600 : 1200);
          });
        }
      });
    }

    playNext(startIdx);
  }

  async function refresh() {
    if (!watchId) return;
    try {
      var data = await fetchBracket(watchId);
      if (!data.ok) {
        if (data.error) {
          lastLifecycleError = data.error;
          toast(data.error, 'error');
        }
        return;
      }
      if (data.lifecycleError) {
        lastLifecycleError = data.lifecycleError;
      }
      if (data.tournament?.registration_closes_at) {
        lobbyClosesAt = new Date(data.tournament.registration_closes_at).getTime();
      }
      lobbyStatus = data.tournament?.status || null;
      if (data.serverTime) {
        serverSkewMs = Date.now() - new Date(data.serverTime).getTime();
      }
      lastLobbyData = data;

      if (isStaleRegistration(data.tournament)) {
        handleStaleSlot();
        return;
      }

      renderLobby(data);

      if (data.tournament.status === 'cancelled') {
        lastLifecycleError = data.lifecycleError || 'Ronda cerrada. Abriendo nueva…';
        toast(lastLifecycleError, 'warning');
        var gidCancel = data.tournament.genre_id || watchGenreId;
        if (gidCancel) {
          await redirectToActiveExpress(gidCancel);
        }
        return;
      }

      if (data.tournament.genre_id) {
        watchGenreId = data.tournament.genre_id;
        localStorage.setItem('mtr_watch_genre', watchGenreId);
      }

      if (data.tournament.status === 'registration' && lobbyClosesAt) {
        var secLeft = Math.max(0, Math.floor((lobbyClosesAt - serverNowMs()) / 1000));
        if (secLeft === 0) {
          if (!stuckAtZeroSince) stuckAtZeroSince = Date.now();
          await ensureBattleStarted();
          if (startBattleAttempts >= 4 && lobbyStatus === 'registration') {
            var gid = data.tournament.genre_id || watchGenreId;
            if (gid) await redirectToActiveExpress(gid);
          }
          return;
        }
        stuckAtZeroSince = null;
        startBattleAttempts = 0;
      }

      if (data.tournament.status === 'locked') {
        await ensureBattleStarted();
        return;
      }

      if (data.tournament.status === 'in_progress' && data.bracket) {
        startBattleAttempts = 0;
        lastLifecycleError = null;
        if (data.bracket.participants && data.bracket.participants.length) {
          renderBracketRoster(data.bracket);
        }
        if (!playing && data.bracket.duels && data.bracket.duels.length) {
          if (data.bracket.playbackStatus !== 'completed') {
            playDuelsSequentially(data);
          }
        } else if (data.bracket.playbackStatus === 'completed') {
          renderResult(data.bracket);
        }
      }

      if (data.tournament.status === 'completed' && data.bracket) {
        renderResult(data.bracket);
      }
    } catch (e) {
      console.error('[tournament-bracket]', e);
      if (startBattleAttempts >= 2) {
        lastLifecycleError =
          'Servidor lento o dormido. Reintentando… (Render puede tardar ~1 min)';
        renderStuckAtZero();
      }
    }
  }

  function watch(tournamentId, genreId) {
    if (window.TournamentHub && window.TournamentHub.pauseTimers) {
      window.TournamentHub.pauseTimers();
    }
    watchId = tournamentId;
    watchGenreId = genreId || localStorage.getItem('mtr_watch_genre') || null;
    startBattleAttempts = 0;
    stuckAtZeroSince = null;
    lastLifecycleError = null;
    localStorage.setItem('mtr_watch_tournament', tournamentId);
    if (watchGenreId) localStorage.setItem('mtr_watch_genre', watchGenreId);
    showArena();
    refresh();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 3000);
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(function () {
      if (!watchId || !lastLobbyData) return;
      if (!playing) renderLobby(lastLobbyData);
      var sec = lobbyClosesAt
        ? Math.max(0, Math.floor((lobbyClosesAt - serverNowMs()) / 1000))
        : 0;
      if (
        startBattleAttempts < 25 &&
        ((lobbyStatus === 'registration' && sec === 0) || lobbyStatus === 'locked')
      ) {
        ensureBattleStarted();
      }
      if (
        lobbyStatus === 'registration' &&
        sec === 0 &&
        stuckAtZeroSince &&
        Date.now() - stuckAtZeroSince > 20000 &&
        watchGenreId
      ) {
        syncWatchToLiveExpress();
      }
    }, 1000);
  }

  async function redirectToActiveExpress(genreId) {
    try {
      await wakeBackend();
      var hub = await fetchApi('/api/tournaments/hub', { method: 'GET' }, API_TIMEOUT_MS);
      var h = await hub.json();
      if (!h.ok || !genreId) return false;
      var g = (h.genres || []).find(function (x) { return x.id === genreId; });
      if (g && g.express && g.express.id) {
        localStorage.setItem('mtr_watch_tournament', g.express.id);
        watch(g.express.id);
        toast('Slot Express actualizado', 'info');
        return true;
      }
    } catch (e) {
      console.warn('[tournament-bracket] redirect hub:', e);
    }
    return false;
  }

  function close() {
    watchId = null;
    playing = false;
    lobbyClosesAt = null;
    localStorage.removeItem('mtr_watch_tournament');
    document.getElementById('depositSectionMain')?.classList.remove('hidden');
    document.getElementById('contactSection')?.classList.remove('hidden');
    if (pollTimer) clearInterval(pollTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    pollTimer = null;
    countdownTimer = null;
    var arena = document.getElementById('tournamentArena');
    if (arena) arena.classList.add('hidden');
    var panel = document.getElementById('tournamentResultPanel');
    if (panel) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var saved = localStorage.getItem('mtr_watch_tournament');
    var savedGenre = localStorage.getItem('mtr_watch_genre');
    if (!saved) return;
    wakeBackend().then(function () {
      return fetchBracket(saved);
    }).then(function (data) {
      if (data.ok && data.tournament) {
        if (data.tournament.genre_id) {
          savedGenre = data.tournament.genre_id;
          localStorage.setItem('mtr_watch_genre', savedGenre);
        }
        if (isStaleRegistration(data.tournament) && savedGenre) {
          redirectToActiveExpress(savedGenre);
          return;
        }
        if (data.tournament.status === 'in_progress' && data.bracket) {
          watch(saved, savedGenre);
          return;
        }
      }
      watch(saved, savedGenre);
    }).catch(function () {
      watch(saved, savedGenre);
    });
  });

  window.TournamentBracket = { watch: watch, close: close, refresh: refresh };
})();
