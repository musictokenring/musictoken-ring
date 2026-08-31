/**
 * Vista de torneo Express: lobby, bracket y reproducción de duelos.
 */
(function () {
  'use strict';

  var pollTimer = null;
  var countdownTimer = null;
  var watchId = null;
  var playing = false;
  var showingResult = false;
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

  var CREDITS_LABEL = 'MTR créditos';

  function fmtClock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function lobbyCountdownHtml(sec, maxSec) {
    maxSec = maxSec || 300;
    var urgent = sec <= 60;
    var pct = Math.min(100, Math.max(0, (sec / maxSec) * 100));
    return (
      '<div class="tournament-lobby-stage">' +
      '<div class="tournament-lobby-rings' + (urgent ? ' urgent' : '') + '">' +
      '<div class="ring ring-1"></div><div class="ring ring-2"></div><div class="ring ring-3"></div>' +
      '</div>' +
      '<div class="tournament-lobby-core">' +
      '<div class="tournament-lobby-label">Batalla en</div>' +
      '<div class="tournament-lobby-time' + (urgent ? ' urgent' : '') + '" data-lobby-clock>' + fmtClock(sec) + '</div>' +
      '</div>' +
      '<div class="tournament-lobby-bar"><span style="width:' + pct + '%"></span></div>' +
      '<p class="tournament-lobby-hint">La arena se activará automáticamente al llegar a 00:00</p>' +
      '</div>'
    );
  }

  function updateAbandonButtonVisibility() {
    var btn = document.getElementById('tournamentAbandonBtn');
    if (!btn) return;
    var canAbandon = isEnrolledInCurrentWatch() &&
      watchId &&
      !playing &&
      !showingResult &&
      lobbyStatus !== 'completed' &&
      lobbyStatus !== 'cancelled';
    btn.classList.toggle('hidden', !canAbandon);
  }

  function openAbandonModal() {
    var modal = document.getElementById('tournamentAbandonModal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeAbandonModal() {
    var modal = document.getElementById('tournamentAbandonModal');
    if (modal) modal.classList.add('hidden');
  }

  async function confirmAbandonTournament() {
    if (!watchId || !isEnrolledInCurrentWatch()) {
      toast('No estás inscrito en esta ronda', 'warning');
      return;
    }
    var confirmBtn = document.getElementById('tournamentAbandonConfirmBtn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Procesando…';
    }
    try {
      var headers = { 'Content-Type': 'application/json' };
      if (window.GameEngine && typeof window.GameEngine.getBackendAuthHeaders === 'function') {
        headers = await window.GameEngine.getBackendAuthHeaders(headers);
      }
      var res = await fetch(backendUrl() + '/api/tournaments/' + watchId + '/abandon', {
        method: 'POST',
        headers: headers
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.ok) {
        toast(data.error || 'No se pudo abandonar el torneo', 'error');
        return;
      }
      closeAbandonModal();
      toast(data.message || 'Has abandonado el torneo. Perdiste tu apuesta.', 'warning');
      close({ keepEnrollment: false });
      // Sin wallet conectada (login por email/Google), connectedAddress es
      // falsy -- antes eso hacía que el saldo NUNCA se refrescara solo acá,
      // dejando el numero viejo hasta que el usuario recargaba la página a
      // mano (reportado en vivo: tuvo que hacer F5 después de un torneo).
      // loadBalance(null, userId) resuelve igual el saldo real por sesión.
      if (window.CreditsSystem) {
        window.CreditsSystem.loadBalance(window.connectedAddress || null, window.CreditsSystem.currentUserId || null);
      }
      if (typeof selectMode === 'function') selectMode('tournament');
    } catch (e) {
      console.error('[tournament-bracket] abandon:', e);
      toast('Error al abandonar. Reintenta.', 'error');
    } finally {
      closeAbandonModal();
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Sí, abandonar y perder apuesta';
      }
    }
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

  // Ícono SVG chico para HTML generado en este archivo -- nunca para toast(),
  // que reenvía a showToast() (textContent por seguridad, no HTML).
  function svgIcon(name, size, extraClass) {
    return window.MTRIcons ? window.MTRIcons.svg(name, { size: size || 14, className: 'inline-block align-[-2px] mr-1' + (extraClass ? ' ' + extraClass : '') }) : '';
  }

  function isPinnedWatch(id) {
    return !!(id && localStorage.getItem('mtr_joined_tournament') === id);
  }

  function isEnrolledInCurrentWatch() {
    return isPinnedWatch(watchId);
  }

  function hideSections() {
    ['modeSelector', 'songSelection', 'tournamentHub'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }

  function scrollArenaIntoView() {
    setTimeout(function () {
      var arena = document.getElementById('tournamentArena');
      if (!arena) return;
      var header = document.querySelector('header');
      var headerH = header ? header.offsetHeight : 72;
      var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      var top = arena.getBoundingClientRect().top + scrollY - headerH - 12;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, 140);
  }

  function showArena() {
    hideSections();
    document.getElementById('depositSectionMain')?.classList.add('hidden');
    document.getElementById('contactSection')?.classList.add('hidden');
    var arena = document.getElementById('tournamentArena');
    if (!arena) return;
    var wasHidden = arena.classList.contains('hidden');
    arena.classList.remove('hidden');
    if (wasHidden) scrollArenaIntoView();
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
      '<h3 class="text-lg font-bold text-white">' + svgIcon('swords', 18) + 'Competidores del torneo</h3>' +
      '<p class="text-xs text-gray-400">' + b.humanCount + ' humanos · ' + b.cpuCount + ' CPU</p></div>' +
      b.participants.map(function (p) {
        return (
          '<div class="p-4 rounded-2xl border-2 ' +
          (p.isCpu ? 'border-gray-600/50 bg-gray-900/60' : 'border-cyan-500/40 bg-cyan-500/10') + '">' +
          '<div class="flex flex-col items-center text-center gap-2">' +
          '<img src="' + (p.songImage || '') + '" alt="" class="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-cover shadow-lg bg-black/50" onerror="this.src=\'https://e-cdns-images.dzcdn.net/images/cover/2646329172/250x250-000000-80-0-0.jpg\'">' +
          '<div class="text-xs font-bold ' + (p.isCpu ? 'text-gray-400' : 'text-cyan-400') + '">' +
          (p.isCpu ? svgIcon('robot', 13) : svgIcon('user', 13)) + (p.displayName || 'Jugador') + '</div>' +
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

  function shouldClearJoinedPin(t) {
    if (!t) return false;
    if (t.status === 'cancelled' || t.status === 'completed') return true;
    if (t.status === 'registration' && t.registration_closes_at) {
      var closes = new Date(t.registration_closes_at).getTime();
      if (closes <= serverNowMs() - 180000) return true;
    }
    return false;
  }

  function applyLobbyTiming(data) {
    var t = data.tournament;
    if (!t || !t.registration_closes_at) return;
    var newCloses = new Date(t.registration_closes_at).getTime();
    if (!Number.isFinite(newCloses)) return;
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
    if (newCloses >= lobbyClosesAt) {
      lobbyClosesAt = newCloses;
      return;
    }
    if (lobbyClosesAt - newCloses > 45000) {
      lobbyClosesAt = newCloses;
    }
  }

  function tickLobbyCountdownDisplay() {
    if (!watchId || playing || arenaBlocked || lobbyStatus !== 'registration' || !lobbyClosesAt) {
      return;
    }
    var sec = secondsLeft();
    var sub = document.getElementById('tournamentArenaSubtitle');
    if (sub) {
      var typeLabel = (lastLobbyData && lastLobbyData.tournament &&
        lastLobbyData.tournament.tournament_type === 'weekly') ? 'Grand Prix semanal' : 'Express';
      if (sec > 0) {
        sub.textContent = typeLabel + ' · inscripción abierta · batalla en ' + fmtClock(sec);
      } else {
        sub.textContent = typeLabel + ' · cerrando inscripción…';
      }
    }
    var status = document.getElementById('tournamentArenaStatus');
    if (!status || battleKickInFlight || sec === 0) return;
    status.innerHTML = lobbyCountdownHtml(sec, 300);
    updateAbandonButtonVisibility();
  }

  function recoverStuckPlaybackState() {
    var battleArena = document.getElementById('battleArena');
    if (playing && !battleArena) {
      playing = false;
    }
  }

  function renderLobby(data) {
    if (showingResult) return;
    if (!playing) showArena();
    if (playing) {
      return;
    }
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
        sub.textContent = typeLabel + ' · batalla en curso';
      } else {
        sub.textContent = typeLabel;
      }
    }

    if (status) {
      if (arenaBlocked && lastLifecycleError) {
        status.innerHTML =
          '<div class="text-center p-4">' +
          '<div class="text-sm text-red-300 font-bold mb-2">' + svgIcon('warning', 14) + 'Configuración de torneos incompleta</div>' +
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
          '<div class="text-sm text-amber-300 animate-pulse mb-2">' + svgIcon('clock', 14) + 'Iniciando batalla (CPU + jugadores)…</div>' +
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
        var enrollCta = '';
        if (!isEnrolledInCurrentWatch()) {
          enrollCta =
            '<button type="button" id="tournamentEnrollFromArenaBtn" class="tournament-btn-primary" style="max-width:280px;margin:1rem auto 0">' +
            svgIcon('music', 14) + 'Elegir canción e inscribirme</button>' +
            '<p class="tournament-lobby-hint">Debes elegir tu canción antes de participar</p>';
        }
        status.innerHTML = lobbyCountdownHtml(sec, 300) + enrollCta;
        var enrollBtn = document.getElementById('tournamentEnrollFromArenaBtn');
        if (enrollBtn) {
          enrollBtn.onclick = function () {
            openEnrollmentFromArena();
          };
        }
      } else if (lobbyStatus === 'locked') {
        status.innerHTML =
          '<div class="tournament-lobby-stage">' +
          '<div class="tournament-lobby-rings urgent"><div class="ring ring-1"></div><div class="ring ring-2"></div></div>' +
          '<div class="tournament-lobby-core">' +
          '<div class="tournament-lobby-label">Preparando arena</div>' +
          '<div class="text-lg font-bold text-amber-300 animate-pulse">' + svgIcon('lock', 16) + 'Generando bracket y rivales CPU…</div>' +
          '</div></div>';
      } else if (lobbyStatus === 'cancelled') {
        status.innerHTML =
          '<div class="text-center text-red-400">' +
          '<p class="font-bold mb-2">' + svgIcon('circleX', 15) + 'Torneo cancelado</p>' +
          '<p class="text-sm text-gray-400">' + (lastLifecycleError || 'Error al iniciar.') + '</p></div>';
      } else if (lobbyStatus === 'in_progress') {
        var duelTotal = (b && b.duels && b.duels.length) || 0;
        var duelIdx = (b && b.currentDuelIndex) || 0;
        status.innerHTML =
          '<div class="text-center p-4">' +
          '<div class="text-sm text-cyan-300 font-bold animate-pulse mb-2">' + svgIcon('swords', 14) + 'Batalla automática en curso</div>' +
          '<p class="text-xs text-gray-400">Duelo ' + (duelIdx + 1) + ' de ' + duelTotal +
          ' · iniciando según el cronómetro del torneo</p></div>';
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
    updateAbandonButtonVisibility();
  }

  function finishTournamentPresentation(b) {
    showingResult = true;
    playing = false;
    var battleArena = document.getElementById('battleArena');
    if (battleArena) battleArena.remove();
    if (window.GameEngine && typeof window.GameEngine.stopUserSong === 'function') {
      window.GameEngine.stopUserSong();
    }
    if (window.GameEngine && typeof window.GameEngine.stopVictorySong === 'function') {
      window.GameEngine.stopVictorySong();
    }
    localStorage.removeItem('mtr_watch_tournament');
    localStorage.removeItem('mtr_joined_tournament');
    if (typeof window.loadPlayerProfile === 'function' && typeof supabaseClient !== 'undefined') {
      supabaseClient.auth.getSession().then(function (res) {
        var session = res && res.data && res.data.session;
        var profileModal = document.getElementById('profileModal');
        if (session && session.user && profileModal && !profileModal.classList.contains('hidden')) {
          window.loadPlayerProfile(session.user);
        }
      }).catch(function () {});
    }
    showArena();
    renderResult(b);
    var title = document.getElementById('tournamentArenaTitle');
    if (title) title.textContent = 'Torneo finalizado';
    var sub = document.getElementById('tournamentArenaSubtitle');
    if (sub) sub.textContent = 'Resultados oficiales de la ronda';
    var status = document.getElementById('tournamentArenaStatus');
    if (status) {
      status.innerHTML =
        '<div class="text-center text-purple-200 font-bold">' + svgIcon('circleCheck', 14) + 'Competencia completada</div>';
    }
    var panel = document.getElementById('tournamentResultPanel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function localUserId() {
    if (window.CreditsSystem && window.CreditsSystem.currentUserId) {
      return window.CreditsSystem.currentUserId;
    }
    return null;
  }

  /** Ranking real desde la eliminatoria: campeón → eliminado más tarde primero. */
  function computeRanking(b) {
    var parts = (b.participants || []).slice();
    if (!parts.length) return [];
    var lostRound = {};
    (b.duels || []).forEach(function (d) {
      var p1 = d.player1 && d.player1.id;
      var p2 = d.player2 && d.player2.id;
      var loserId = d.winnerParticipantId === p1 ? p2 : p1;
      if (loserId != null && lostRound[loserId] == null) {
        lostRound[loserId] = d.round || 0;
      }
    });
    var champId = b.winnerParticipantId;
    parts.sort(function (a, c) {
      if (a.id === champId && c.id !== champId) return -1;
      if (c.id === champId && a.id !== champId) return 1;
      var ra = lostRound[a.id] || 0;
      var rc = lostRound[c.id] || 0;
      if (rc !== ra) return rc - ra;
      return 0;
    });
    return parts;
  }

  function podiumSpotHtml(p, place) {
    if (!p) {
      return '<div class="mtr-podium-spot mtr-podium-spot--' + place + '"></div>';
    }
    var medalColor = place === 'first' ? '#fbbf24' : (place === 'second' ? '#cbd5e1' : '#d97706');
    var medal = '<span style="color:' + medalColor + '">' + svgIcon('medal', 22) + '</span>';
    var num = place === 'first' ? '1' : (place === 'second' ? '2' : '3');
    var fallback = 'https://e-cdns-images.dzcdn.net/images/cover/2646329172/250x250-000000-80-0-0.jpg';
    return (
      '<div class="mtr-podium-spot mtr-podium-spot--' + place + '">' +
      '<div class="mtr-podium-medal">' + medal + '</div>' +
      '<img class="mtr-podium-avatar" src="' + escapeHtml(p.songImage || fallback) + '" ' +
      'onerror="this.src=\'' + fallback + '\'" alt="">' +
      '<div class="mtr-podium-name">' + (p.isCpu ? svgIcon('robot', 12) : '') + escapeHtml(p.displayName || 'Jugador') + '</div>' +
      '<div class="mtr-podium-song">' + escapeHtml(p.songName || '') + '</div>' +
      '<div class="mtr-podium-base">' + num + '</div>' +
      '</div>'
    );
  }

  function confettiHtml() {
    var colors = ['#fbbf24', '#22d3ee', '#ec4899', '#a855f7', '#34d399', '#f97316'];
    var pieces = '';
    for (var i = 0; i < 36; i++) {
      var left = Math.round(Math.random() * 100);
      var color = colors[i % colors.length];
      var delay = (Math.random() * 1.2).toFixed(2);
      var dur = (2.4 + Math.random() * 1.4).toFixed(2);
      var w = 5 + Math.round(Math.random() * 6);
      pieces +=
        '<i style="left:' + left + '%;background:' + color +
        ';width:' + w + 'px;animation-delay:' + delay +
        's;animation-duration:' + dur + 's"></i>';
    }
    return '<div class="mtr-confetti">' + pieces + '</div>';
  }

  function renderResult(b) {
    var panel = document.getElementById('tournamentResultPanel');
    if (!panel || !b) return;
    showingResult = true;
    showArena();

    var ranking = computeRanking(b);
    var meId = localUserId();

    var podiumHtml = '';
    if (ranking.length) {
      podiumHtml =
        '<div class="mtr-podium">' +
        podiumSpotHtml(ranking[1] || null, 'second') +
        podiumSpotHtml(ranking[0] || null, 'first') +
        podiumSpotHtml(ranking[2] || null, 'third') +
        '</div>';
    }

    var standingsHtml = '';
    if (ranking.length) {
      standingsHtml =
        '<div class="mtr-standings">' +
        '<div class="mtr-standings-title">Clasificación final</div>' +
        ranking.map(function (p, i) {
          var isChamp = i === 0;
          var isYou = meId && p.userId === meId;
          var fallback = 'https://e-cdns-images.dzcdn.net/images/cover/2646329172/250x250-000000-80-0-0.jpg';
          var tag = isYou
            ? '<span class="mtr-standing-tag mtr-standing-tag--you">TÚ</span>'
            : (p.isCpu ? '<span class="mtr-standing-tag mtr-standing-tag--cpu">CPU</span>' : '');
          var delay = (0.5 + i * 0.08).toFixed(2);
          return (
            '<div class="mtr-standing-row' + (isChamp ? ' mtr-standing-row--champion' : '') +
            '" style="animation-delay:' + delay + 's">' +
            '<span class="mtr-standing-rank">' + (isChamp ? svgIcon('trophy', 16) : '#' + (i + 1)) + '</span>' +
            '<img class="mtr-standing-avatar" src="' + escapeHtml(p.songImage || fallback) + '" ' +
            'onerror="this.src=\'' + fallback + '\'" alt="">' +
            '<div class="mtr-standing-copy">' +
            '<div class="mtr-standing-name">' + escapeHtml(p.displayName || 'Jugador') + '</div>' +
            '<div class="mtr-standing-song">' + svgIcon('music', 12) + escapeHtml(p.songName || 'Sin título') + '</div>' +
            '</div>' + tag +
            '</div>'
          );
        }).join('') +
        '</div>';
    }

    var prizeHtml = b.prizeAwarded > 0
      ? '<div class="mtr-prize-chip">' + svgIcon('cash', 13) + '+' + Number(b.prizeAwarded).toFixed(1) + ' MTR créditos acreditados</div>'
      : '<div class="mtr-prize-chip mtr-prize-chip--empty">Sin premio acreditado en este slot</div>';

    panel.classList.remove('hidden');
    panel.innerHTML =
      '<div class="mtr-result">' +
      confettiHtml() +
      '<div class="mtr-result-inner text-center">' +
      '<div class="mtr-result-crown" style="color:#fbbf24">' + (window.MTRIcons ? window.MTRIcons.svg('crown', { size: 40 }) : '') + '</div>' +
      '<div class="mtr-result-title">Campeón del torneo</div>' +
      '<h3 class="mtr-champion-name mt-1">' + escapeHtml(b.championName || 'Campeón') + '</h3>' +
      '<p class="mtr-champion-song">' + svgIcon('music', 13) + escapeHtml(b.championSong || '') + '</p>' +
      podiumHtml +
      '<p class="text-sm text-gray-300 mt-4 mb-1">' + escapeHtml(b.resultMessage || 'Torneo completado.') + '</p>' +
      prizeHtml +
      standingsHtml +
      '<div class="flex flex-wrap gap-2 justify-center mt-6">' +
      '<button type="button" id="tournamentBackHubBtn" class="tournament-btn-primary" style="width:auto;padding:0.65rem 1.4rem">' + svgIcon('trophy', 15) + 'Hub de torneos</button>' +
      '<button type="button" id="tournamentBackModesBtn" class="tournament-btn-secondary" style="width:auto;margin-top:0;padding:0.65rem 1.4rem">Otros modos</button>' +
      '</div>' +
      '</div></div>';

    var back = document.getElementById('tournamentBackHubBtn');
    if (back) {
      back.onclick = function () {
        showingResult = false;
        close();
        if (typeof selectMode === 'function') selectMode('tournament');
      };
    }
    var modes = document.getElementById('tournamentBackModesBtn');
    if (modes) {
      modes.onclick = function () {
        showingResult = false;
        close();
        if (typeof backToModes === 'function') backToModes();
      };
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
        if (!playing && result.bracket && result.bracket.duels &&
            result.bracket.duels.length && result.bracket.playbackStatus !== 'completed') {
          playDuelsSequentially(result);
          return;
        }
      } else if (!battleReady) {
        zeroKickSent = false;
        if (lastLifecycleError) toast(lastLifecycleError, 'error');
      }
    } catch (e) {
      console.error('[tournament-bracket] kick:', e);
      lastLifecycleError = e.message || 'Error al iniciar batalla';
      zeroKickSent = false;
    } finally {
      battleKickInFlight = false;
    }
    if (!playing) {
      await refresh();
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

    if (window.GameEngine && typeof window.GameEngine.releaseBattleAudioSession === 'function') {
      window.GameEngine.releaseBattleAudioSession();
    }

    function playNext(idx) {
      if (idx >= duels.length) {
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
        finishTournamentPresentation(data.bracket);
        if (champPreview) toast('Campeón: ' + champPreview, 'success');
        // Mismo fix que en abandonTournament(): sin wallet conectada, esto
        // nunca refrescaba el saldo -- justo el caso que reportó el usuario
        // (tuvo que recargar la página a mano después de un torneo).
        if (window.CreditsSystem) {
          window.CreditsSystem.loadBalance(window.connectedAddress || null, window.CreditsSystem.currentUserId || null);
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
          '<div class="text-sm text-cyan-300 font-bold">' + svgIcon('swords', 14) + 'Duelo ' + (idx + 1) + ' / ' + duels.length + '</div>' +
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

      var startDelay = idx === startIdx ? 600 : (duels.length > 5 ? 500 : 900);
      setTimeout(function () {
        window.GameEngine.startTournamentPlayback(match, {
          victoryDelayMs: 2800,
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
      }, startDelay);
    }

    playNext(startIdx);
  }

  async function refresh() {
    if (!watchId) return;
    if (battleKickInFlight) return;
    if (showingResult) return;
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

      if (shouldClearJoinedPin(data.tournament)) {
        localStorage.removeItem('mtr_joined_tournament');
      }

      if (isStaleRegistration(data.tournament) && !isPinnedWatch(watchId) && !showingResult) {
        if (arenaBlocked || battleKickInFlight) {
          if (!playing) renderLobby(data);
          return;
        }
        if (watchGenreId && lobbyStatus !== 'locked' && lobbyStatus !== 'in_progress') {
          await redirectToActiveExpress(watchGenreId);
          return;
        }
        handleStaleSlot();
        return;
      }

      if (data.tournament.status === 'cancelled') {
        lastLifecycleError = data.lifecycleError || 'Ronda cancelada';
        toast(lastLifecycleError, 'warning');
        if (!playing) renderLobby(data);
        return;
      }

      if (data.tournament.genre_id) {
        watchGenreId = data.tournament.genre_id;
        localStorage.setItem('mtr_watch_genre', watchGenreId);
      }

      if (data.tournament.status === 'registration') {
        if (!playing) renderLobby(data);
        var secLeft = secondsLeft();
        if (arenaBlocked) {
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
        if (!playing) renderLobby(data);
        await kickBattleOnce();
        return;
      }

      if (data.tournament.status === 'in_progress' && data.bracket) {
        recoverStuckPlaybackState();
        startBattleAttempts = 0;
        zeroKickSent = true;
        lastLifecycleError = null;
        if (data.bracket.participants && data.bracket.participants.length && !playing) {
          renderBracketRoster(data.bracket);
        }
        if (!playing && data.bracket.duels && data.bracket.duels.length) {
          if (data.bracket.playbackStatus !== 'completed') {
            playDuelsSequentially(data);
            return;
          }
        }
        if (data.bracket.playbackStatus === 'completed') {
          finishTournamentPresentation(data.bracket);
          return;
        }
        if (!playing) renderLobby(data);
        return;
      }

      if (data.tournament.status === 'completed' && data.bracket) {
        finishTournamentPresentation(data.bracket);
        return;
      }

      if (!playing) renderLobby(data);
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
      if (!watchId || playing || arenaBlocked) return;
      if (lobbyStatus === 'registration' && lobbyClosesAt) {
        tickLobbyCountdownDisplay();
        if (lastLobbyData) renderLobby(lastLobbyData);
        var sec = secondsLeft();
        if (sec === 0 && !battleKickInFlight && (!zeroKickSent || startBattleAttempts < MAX_KICK_ATTEMPTS)) {
          zeroKickSent = true;
          kickBattleOnce();
        }
      }
    }, 1000);
  }

  function openEnrollmentFromArena() {
    if (!lastLobbyData || !lastLobbyData.tournament) {
      toast('No hay torneo activo para inscribirte. Vuelve al hub.', 'warning');
      close({ keepEnrollment: false });
      if (typeof selectMode === 'function') selectMode('tournament');
      return;
    }
    var t = lastLobbyData.tournament;
    if (t.status !== 'registration' || secondsLeft() <= 0) {
      toast('La inscripción de esta ronda ya cerró. Elige el Express activo en el hub.', 'warning');
      close({ keepEnrollment: false });
      if (typeof selectMode === 'function') selectMode('tournament');
      return;
    }
    var genreId = watchGenreId || t.genre_id || null;
    if (!genreId) {
      toast('No se detectó la categoría. Vuelve al hub y elige tu género.', 'warning');
      close({ keepEnrollment: false });
      if (typeof selectMode === 'function') selectMode('tournament');
      return;
    }
    if (window.TournamentHub && typeof window.TournamentHub.beginEnrollmentFromArena === 'function') {
      close({ keepEnrollment: false, keepWatch: false });
      window.TournamentHub.beginEnrollmentFromArena(t, genreId);
      return;
    }
    toast('Abre el hub de torneos para elegir tu canción.', 'info');
    close({ keepEnrollment: false });
    if (typeof selectMode === 'function') selectMode('tournament');
  }

  function watch(tournamentId, genreId) {
    if (window.GameEngine && typeof window.GameEngine.bindAudioUnlockGestures === 'function') {
      window.GameEngine.bindAudioUnlockGestures();
    }
    if (window.TournamentHub && window.TournamentHub.pauseTimers) {
      window.TournamentHub.pauseTimers();
    }
    lobbyClosesAt = null;
    lastLobbyData = null;
    playing = false;
    watchGenreId = genreId || localStorage.getItem('mtr_watch_genre') || null;
    showingResult = false;
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

  function close(opts) {
    opts = opts || {};
    watchId = null;
    playing = false;
    showingResult = false;
    lobbyClosesAt = null;
    if (window.TournamentHub && typeof window.TournamentHub.resumeHubTimers === 'function') {
      window.TournamentHub.resumeHubTimers();
    }
    zeroKickSent = false;
    abortArenaFetches();
    localStorage.removeItem('mtr_watch_tournament');
    if (!opts.keepEnrollment) {
      localStorage.removeItem('mtr_joined_tournament');
    }
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
    var abandonBtn = document.getElementById('tournamentAbandonBtn');
    if (abandonBtn) {
      abandonBtn.addEventListener('click', openAbandonModal);
    }
    var abandonCancel = document.getElementById('tournamentAbandonCancelBtn');
    if (abandonCancel) {
      abandonCancel.addEventListener('click', closeAbandonModal);
    }
    var abandonConfirm = document.getElementById('tournamentAbandonConfirmBtn');
    if (abandonConfirm) {
      abandonConfirm.addEventListener('click', confirmAbandonTournament);
    }
    var abandonOverlay = document.getElementById('tournamentAbandonModal');
    if (abandonOverlay) {
      abandonOverlay.addEventListener('click', function (e) {
        if (e.target === abandonOverlay) closeAbandonModal();
      });
    }

    var saved = localStorage.getItem('mtr_watch_tournament');
    var savedGenre = localStorage.getItem('mtr_watch_genre');
    var joined = localStorage.getItem('mtr_joined_tournament');
    if (!saved || !joined || joined !== saved) {
      if (saved && (!joined || joined !== saved)) {
        localStorage.removeItem('mtr_watch_tournament');
      }
      return;
    }
    watch(saved, savedGenre);
  });

  window.TournamentBracket = {
    watch: watch,
    close: close,
    refresh: refresh,
    openAbandonModal: openAbandonModal,
    confirmAbandonTournament: confirmAbandonTournament
  };
})();
