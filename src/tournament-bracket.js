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
  var battleKickInFlight = false;
  var startBattleAttempts = 0;
  var lastLifecycleError = null;
  var stuckAtZeroSince = null;
  var watchGenreId = null;
  var zeroKickSent = false;
  var redirecting = false;
  var kickCooldownUntil = 0;
  var arenaBlocked = false;
  var arenaPollController = null;
  var arenaKickController = null;
  var kickInFlightPromise = null;
  var KICK_TIMEOUT_MS = 120000;
  var POLL_TIMEOUT_MS = 45000;
  var KICK_COOLDOWN_MS = 25000;
  var API_TIMEOUT_MS = 55000;
  var MAX_KICK_ATTEMPTS = 8;

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

  function secondsLeft() {
    if (!lobbyClosesAt) return 0;
    return Math.max(0, Math.floor((lobbyClosesAt - serverNowMs()) / 1000));
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
  }

  function isPinnedWatch(id) {
    return !!(id && localStorage.getItem('mtr_joined_tournament') === id);
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

  function isMigrationBlockError(msg) {
    if (!msg) return false;
    var m = String(msg).toLowerCase();
    return m.indexOf('016') !== -1 || m.indexOf('017') !== -1 ||
      m.indexOf('migraci') !== -1 || m.indexOf('status_check') !== -1 ||
      m.indexOf('bracket') !== -1 || m.indexOf('is_cpu') !== -1;
  }

  function applyLobbyTiming(data) {
    var t = data.tournament;
    if (!t || !t.registration_closes_at) return;
    var newCloses = new Date(t.registration_closes_at).getTime();
    if (t.id && t.id !== watchId && redirecting) {
      watchId = t.id;
      localStorage.setItem('mtr_watch_tournament', watchId);
      lobbyClosesAt = newCloses;
      startBattleAttempts = 0;
      zeroKickSent = false;
      return;
    }
    if (!lobbyClosesAt) {
      lobbyClosesAt = newCloses;
      return;
    }
    if (t.status !== 'registration') {
      lobbyClosesAt = newCloses;
      return;
    }
    if (secondsLeft() === 0 && startBattleAttempts > 0) {
      return;
    }
    if (newCloses >= lobbyClosesAt) {
      lobbyClosesAt = newCloses;
    }
  }

  function renderLobby(data) {
    if (!playing) showArena();
    var title = document.getElementById('tournamentArenaTitle');
    var sub = document.getElementById('tournamentArenaSubtitle');
    var grid = document.getElementById('tournamentBracketGrid');
    var status = document.getElementById('tournamentArenaStatus');
    var t = data.tournament || {};
    var b = data.bracket;
    var sec = secondsLeft();

    if (title) title.textContent = t.name || (t.tournament_type === 'weekly' ? 'Grand Prix' : 'Torneo Express');
    if (sub) {
      var typeLabel = t.tournament_type === 'weekly' ? 'Grand Prix semanal' : 'Express';
      if (t.status === 'registration' && sec > 0) {
        sub.textContent = typeLabel + ' · inscripción abierta · batalla en ' + fmtClock(sec);
      } else if (t.status === 'registration') {
        sub.textContent = typeLabel + ' · cerrando inscripción…';
      } else if (t.status === 'locked') {
        sub.textContent = typeLabel + ' · preparando batalla…';
      } else if (t.status === 'in_progress') {
        sub.textContent = typeLabel + ' · ⚔️ batalla en curso';
      } else {
        sub.textContent = typeLabel;
      }
    }

    if (status) {
      if (arenaBlocked && lastLifecycleError) {
        status.innerHTML =
          '<div class="text-center p-4">' +
          '<div class="text-sm text-red-300 font-bold mb-2">⚠️ Configuración de torneos incompleta</div>' +
          '<p class="text-xs text-gray-300 mb-3">' + lastLifecycleError + '</p>' +
          '<p class="text-xs text-amber-200 mb-3">Aplica migraciones 016 y 017 en Supabase SQL Editor.</p>' +
          '<button type="button" id="tournamentForceHubBtn" class="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm">Volver al hub</button>' +
          '</div>';
        var blockBtn = document.getElementById('tournamentForceHubBtn');
        if (blockBtn) {
          blockBtn.onclick = function () {
            close();
            if (typeof selectMode === 'function') selectMode('tournament');
          };
        }
      } else if (battleKickInFlight || (lobbyStatus === 'registration' && sec === 0)) {
        status.innerHTML =
          '<div class="text-center p-4">' +
          '<div class="text-sm text-amber-300 animate-pulse mb-2">⏳ Iniciando batalla (CPU + jugadores)…</div>' +
          '<div class="text-4xl font-black tabular-nums text-cyan-400 mb-2">00:00</div>' +
          '<p class="text-xs text-gray-400">Intento ' + startBattleAttempts + '/' + MAX_KICK_ATTEMPTS +
          ' · el servidor espera confirmar inscripciones (~15 s)</p>' +
          (lastLifecycleError
            ? '<p class="text-xs text-red-300 mt-2">' + lastLifecycleError + '</p>'
            : '') +
          '<button type="button" id="tournamentForceHubBtn" class="mt-3 px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm">Volver al hub</button>' +
          '</div>';
        var btn = document.getElementById('tournamentForceHubBtn');
        if (btn) {
          btn.onclick = function () {
            close();
            if (typeof selectMode === 'function') selectMode('tournament');
          };
        }
      } else if (lobbyStatus === 'registration' && lobbyClosesAt && sec > 0) {
        status.innerHTML =
          '<div class="text-center">' +
          '<div class="text-xs text-gray-400 mb-2">Batalla inicia cuando el cronómetro llegue a 0</div>' +
          '<div class="text-4xl font-black tabular-nums text-cyan-400 ' + (sec <= 60 ? 'animate-pulse text-red-400' : '') + '">' +
          fmtClock(sec) + '</div></div>';
      } else if (lobbyStatus === 'locked') {
        status.innerHTML =
          '<div class="text-center text-amber-300 animate-pulse">🔒 Generando bracket y rival CPU…</div>';
      } else if (lobbyStatus === 'cancelled') {
        status.innerHTML =
          '<div class="text-center text-red-400">' +
          '<p class="font-bold mb-2">❌ Torneo cancelado</p>' +
          '<p class="text-sm text-gray-400">' + (lastLifecycleError || 'Error al iniciar.') + '</p></div>';
      } else if (lobbyStatus === 'in_progress') {
        status.innerHTML =
          '<div class="text-center text-cyan-300">⚔️ Competencia en curso</div>';
      } else if (lastLifecycleError) {
        status.innerHTML =
          '<div class="text-center text-red-400 text-sm">' + lastLifecycleError + '</div>';
      }
    }

    if (b && b.participants && b.participants.length) {
      renderBracketRoster(b);
    } else if (grid && !playing) {
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
    var isKick = kind === 'kick';
    if (isKick && kickInFlightPromise) return kickInFlightPromise;

    var controller = new AbortController();
    var run = (async function () {
      if (isKick) {
        arenaKickController = controller;
      } else if (battleKickInFlight) {
        return null;
      } else {
        if (arenaPollController) {
          try { arenaPollController.abort(); } catch (e) { /* ignore */ }
        }
        arenaPollController = controller;
      }
      var timer = setTimeout(function () { controller.abort(); }, timeoutMs || API_TIMEOUT_MS);
      try {
        var res = await fetch(backendUrl() + path, Object.assign({}, options || {}, {
          signal: controller.signal,
          cache: 'no-store'
        }));
        clearTimeout(timer);
        if (isKick && arenaKickController === controller) arenaKickController = null;
        if (!isKick && arenaPollController === controller) arenaPollController = null;
        return res;
      } catch (err) {
        clearTimeout(timer);
        if (isKick && arenaKickController === controller) arenaKickController = null;
        if (!isKick && arenaPollController === controller) arenaPollController = null;
        if (err && err.name === 'AbortError') return null;
        throw err;
      }
    })();

    if (isKick) {
      kickInFlightPromise = run.finally(function () {
        kickInFlightPromise = null;
      });
      return kickInFlightPromise;
    }
    return run;
  }

  function abortArenaFetches() {
    if (arenaPollController) {
      try { arenaPollController.abort(); } catch (e) { /* ignore */ }
      arenaPollController = null;
    }
    if (arenaKickController) {
      try { arenaKickController.abort(); } catch (e) { /* ignore */ }
      arenaKickController = null;
    }
  }

  async function wakeBackend() {
    try {
      await fetchApi('/api/health', { method: 'GET' }, 60000, 'kick');
    } catch (e) {
      console.warn('[tournament-bracket] wake:', e.message || e);
    }
  }

  async function fetchBracket(id) {
    var res = await fetchApi('/api/tournaments/' + id + '/bracket', { method: 'GET' }, POLL_TIMEOUT_MS, 'poll');
    if (!res) return { ok: false, error: 'timeout' };
    var data = await safeJson(res);
    if (!data) return { ok: false, error: 'timeout' };
    return data;
  }

  async function triggerStartBattle(id) {
    try {
      var res = await fetchApi('/api/tournaments/' + id + '/start-battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, KICK_TIMEOUT_MS, 'kick');
      if (!res) return { ok: false, error: 'timeout' };
      var data = await safeJson(res);
      if (!data) return { ok: false, error: 'timeout' };
      return data;
    } catch (e) {
      console.error('[tournament-bracket] start-battle:', e);
      return { ok: false, error: e.message || 'error' };
    }
  }

  async function resolveLiveExpressId(genreId) {
    if (!genreId) return null;
    if (watchId && (lobbyStatus === 'locked' || lobbyStatus === 'in_progress')) {
      return watchId;
    }
    var res = await fetchApi(
      '/api/tournaments/genre/' + genreId + '/ensure-express',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      30000,
      'poll'
    );
    if (!res) return null;
    var data = await res.json().catch(function () { return {}; });
    return data.ok && data.express && data.express.id ? data.express.id : null;
  }

  async function redirectToActiveExpress(genreId) {
    if (!genreId || redirecting || arenaBlocked || battleKickInFlight) return false;
    if (lobbyStatus === 'locked' || lobbyStatus === 'in_progress') return false;
    if (isPinnedWatch(watchId)) return false;
    redirecting = true;
    try {
      var newId = await resolveLiveExpressId(genreId);
      if (!newId) return false;
      if (newId === watchId) return false;
      watchId = newId;
      localStorage.setItem('mtr_watch_tournament', newId);
      startBattleAttempts = 0;
      zeroKickSent = false;
      stuckAtZeroSince = null;
      lastLifecycleError = null;
      await refresh();
      toast('Nueva ronda Express lista', 'info');
      return true;
    } catch (e) {
      console.warn('[tournament-bracket] redirect:', e);
      return false;
    } finally {
      redirecting = false;
    }
  }

  function isStaleRegistration(t) {
    if (!t || t.status !== 'registration' || !t.registration_closes_at) return false;
    var closes = new Date(t.registration_closes_at).getTime();
    return closes <= serverNowMs() - 120000;
  }

  function handleStaleSlot() {
    lastLifecycleError =
      'Esta ronda expiró. Elige el Express activo en el hub.';
    toast(lastLifecycleError, 'warning');
    close();
    if (typeof selectMode === 'function') selectMode('tournament');
  }

  async function kickBattleOnce() {
    if (!watchId || battleKickInFlight || arenaBlocked || Date.now() < kickCooldownUntil) return;
    if (startBattleAttempts >= MAX_KICK_ATTEMPTS) {
      lastLifecycleError =
        lastLifecycleError ||
        'No se pudo iniciar la batalla tras ' + MAX_KICK_ATTEMPTS + ' intentos.';
      arenaBlocked = isMigrationBlockError(lastLifecycleError);
      toast(lastLifecycleError, 'error');
      if (!arenaBlocked && watchGenreId) await redirectToActiveExpress(watchGenreId);
      if (lastLobbyData) renderLobby(lastLobbyData);
      return;
    }
    battleKickInFlight = true;
    startBattleAttempts += 1;
    kickCooldownUntil = Date.now() + KICK_COOLDOWN_MS;
    if (lastLobbyData) renderLobby(lastLobbyData);
    try {
      if (startBattleAttempts === 1) await wakeBackend();
      var result = await triggerStartBattle(watchId);
      if (result && result.lifecycleError) {
        lastLifecycleError = result.lifecycleError;
        if (isMigrationBlockError(result.lifecycleError)) arenaBlocked = true;
      } else if (result && result.error && !result.ok) {
        lastLifecycleError = result.error;
        if (isMigrationBlockError(result.error)) arenaBlocked = true;
      }
      var battleReady = result && result.ok && result.tournament &&
        (result.tournament.status === 'in_progress' || result.tournament.status === 'locked');
      if (result && result.bracketStale) {
        zeroKickSent = false;
      }
      if (battleReady && result.tournament.status === 'in_progress') {
        zeroKickSent = true;
        stuckAtZeroSince = null;
        startBattleAttempts = 0;
        lastLifecycleError = null;
        lastLobbyData = result;
        lobbyStatus = result.tournament.status;
        if (result.bracket && result.bracket.participants && result.bracket.participants.length) {
          renderBracketRoster(result.bracket);
        }
        if (!playing && result.bracket && result.bracket.duels && result.bracket.duels.length &&
            result.bracket.playbackStatus !== 'completed') {
          playDuelsSequentially(result);
        }
      } else if (!battleReady) {
        zeroKickSent = false;
        if (lastLifecycleError) toast(lastLifecycleError, 'error');
      }
    } catch (e) {
      console.error('[tournament-bracket] kick:', e);
      lastLifecycleError = e.message || 'Error al iniciar batalla';
      zeroKickSent = false;
    }
    try {
      await refresh();
    } finally {
      battleKickInFlight = false;
    }
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
        if (champPreview) toast('🏆 Campeón: ' + champPreview, 'success');
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
          fetchApi('/api/tournaments/' + tournamentId + '/advance-playback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duelIndex: idx })
          }, API_TIMEOUT_MS, 'kick').then(function () {
            setTimeout(function () { playNext(idx + 1); }, duels.length > 5 ? 600 : 1200);
          });
        }
      });
    }

    playNext(startIdx);
  }

  async function refresh() {
    if (!watchId) return;
    if (battleKickInFlight) return;
    try {
      var data = await fetchBracket(watchId);
      if (!data.ok) {
        if (data.error) {
          lastLifecycleError = data.error;
          if (startBattleAttempts >= 2) toast(data.error, 'error');
        }
        if (lobbyStatus === 'registration' && secondsLeft() === 0 && !battleKickInFlight) {
          await kickBattleOnce();
        }
        return;
      }
      if (data.lifecycleError) lastLifecycleError = data.lifecycleError;
      if (data.bracketStale) zeroKickSent = false;
      applyLobbyTiming(data);
      lobbyStatus = data.tournament?.status || null;
      if (data.serverTime) {
        serverSkewMs = Date.now() - new Date(data.serverTime).getTime();
      }
      lastLobbyData = data;

      if (isStaleRegistration(data.tournament) && !isPinnedWatch(watchId)) {
        if (arenaBlocked || battleKickInFlight) {
          renderLobby(data);
          return;
        }
        if (watchGenreId && lobbyStatus !== 'locked' && lobbyStatus !== 'in_progress') {
          await redirectToActiveExpress(watchGenreId);
          return;
        }
        handleStaleSlot();
        return;
      }

      renderLobby(data);

      if (data.tournament.status === 'cancelled') {
        lastLifecycleError = data.lifecycleError || 'Ronda cancelada';
        toast(lastLifecycleError, 'warning');
        renderLobby(data);
        return;
      }

      if (data.tournament.genre_id) {
        watchGenreId = data.tournament.genre_id;
        localStorage.setItem('mtr_watch_genre', watchGenreId);
      }

      if (data.tournament.status === 'registration') {
        var secLeft = secondsLeft();
        if (arenaBlocked) {
          renderLobby(data);
          return;
        }
        if (secLeft === 0 && !battleKickInFlight && (!zeroKickSent || startBattleAttempts < MAX_KICK_ATTEMPTS)) {
          if (!stuckAtZeroSince) stuckAtZeroSince = Date.now();
          zeroKickSent = true;
          await kickBattleOnce();
        } else if (secLeft > 0 && !stuckAtZeroSince) {
          zeroKickSent = false;
          startBattleAttempts = 0;
        }
        return;
      }

      if (data.tournament.status === 'locked') {
        await kickBattleOnce();
        return;
      }

      if (data.tournament.status === 'in_progress' && data.bracket) {
        startBattleAttempts = 0;
        zeroKickSent = true;
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
        return;
      }

      if (data.tournament.status === 'completed' && data.bracket) {
        renderResult(data.bracket);
      }
    } catch (e) {
      console.error('[tournament-bracket]', e);
      lastLifecycleError = 'Conexión lenta con el servidor';
      if (lastLobbyData) renderLobby(lastLobbyData);
    }
  }

  function startArenaTimers() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 6000);
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(function () {
      if (!watchId || !lastLobbyData || playing || arenaBlocked) return;
      if (lobbyStatus === 'registration') {
        renderLobby(lastLobbyData);
        var sec = secondsLeft();
        if (sec === 0 && !battleKickInFlight && (!zeroKickSent || startBattleAttempts < MAX_KICK_ATTEMPTS)) {
          zeroKickSent = true;
          kickBattleOnce();
        }
      }
    }, 1000);
  }

  function watch(tournamentId, genreId) {
    if (window.TournamentHub && window.TournamentHub.pauseTimers) {
      window.TournamentHub.pauseTimers();
    }
    watchGenreId = genreId || localStorage.getItem('mtr_watch_genre') || null;
    startBattleAttempts = 0;
    zeroKickSent = false;
    stuckAtZeroSince = null;
    lastLifecycleError = null;
    arenaBlocked = false;
    if (watchGenreId) localStorage.setItem('mtr_watch_genre', watchGenreId);
    showArena();
    var status = document.getElementById('tournamentArenaStatus');
    if (status) {
      status.innerHTML = '<div class="text-center text-purple-200 animate-pulse">Cargando torneo…</div>';
    }

    (async function () {
      try {
        if (watchGenreId && tournamentId && !isPinnedWatch(tournamentId)) {
          var probe = await fetchBracket(tournamentId);
          if (probe.ok && isStaleRegistration(probe.tournament)) {
            var liveId = await resolveLiveExpressId(watchGenreId);
            if (liveId && liveId !== tournamentId) tournamentId = liveId;
          }
        }
        watchId = tournamentId;
        localStorage.setItem('mtr_watch_tournament', watchId);
        await refresh();
        startArenaTimers();
      } catch (e) {
        console.error('[tournament-bracket] watch:', e);
        toast('No se pudo cargar la arena. Reintenta desde el hub.', 'error');
      }
    })();
  }

  function close() {
    watchId = null;
    playing = false;
    lobbyClosesAt = null;
    zeroKickSent = false;
    abortArenaFetches();
    localStorage.removeItem('mtr_watch_tournament');
    localStorage.removeItem('mtr_joined_tournament');
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
    watch(saved, savedGenre);
  });

  window.TournamentBracket = { watch: watch, close: close, refresh: refresh };
})();
