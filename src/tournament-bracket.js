/**
 * Vista de torneo Express: lobby, bracket y reproducción de duelos.
 */
(function () {
  'use strict';

  var pollTimer = null;
  var watchId = null;
  var playing = false;

  function backendUrl() {
    return (window.CONFIG && window.CONFIG.BACKEND_API) || 'https://musictoken-ring.onrender.com';
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
    var arena = document.getElementById('tournamentArena');
    if (arena) arena.classList.remove('hidden');
  }

  function renderLobby(data) {
    showArena();
    var title = document.getElementById('tournamentArenaTitle');
    var sub = document.getElementById('tournamentArenaSubtitle');
    var grid = document.getElementById('tournamentBracketGrid');
    var status = document.getElementById('tournamentArenaStatus');
    var t = data.tournament || {};
    var b = data.bracket;

    if (title) title.textContent = t.name || 'Torneo Express';
    if (sub) {
      sub.textContent = t.status === 'registration'
        ? 'Inscripción abierta · esperando cierre del slot'
        : (b ? b.humanCount + ' humanos · ' + b.cpuCount + ' CPU' : '');
    }

    if (status) {
      var statusMap = {
        registration: '⏳ Esperando cierre de inscripción…',
        locked: '🔒 Inscripción cerrada · preparando bracket…',
        in_progress: '⚔️ Competencia en curso',
        completed: '🏁 Torneo finalizado'
      };
      status.textContent = statusMap[t.status] || t.status;
    }

    if (!grid || !b || !b.participants) return;
    grid.innerHTML = b.participants.map(function (p) {
      return (
        '<div class="p-3 rounded-xl border ' + (p.isCpu ? 'border-gray-600/40 bg-gray-900/40' : 'border-cyan-500/30 bg-cyan-500/5') + '">' +
        '<div class="flex items-center gap-3">' +
        '<img src="' + (p.songImage || '') + '" alt="" class="w-12 h-12 rounded-lg object-cover bg-black/40" onerror="this.style.display=\'none\'">' +
        '<div class="min-w-0 flex-1">' +
        '<div class="text-xs ' + (p.isCpu ? 'text-gray-500' : 'text-cyan-400') + '">' + (p.isCpu ? '🤖 CPU' : '👤 Humano') + ' · ' + p.displayName + '</div>' +
        '<div class="text-sm font-bold text-white truncate">' + p.songName + '</div>' +
        '<div class="text-[11px] text-gray-500 truncate">' + p.songArtist + '</div>' +
        '</div></div></div>'
      );
    }).join('');
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

  async function fetchBracket(id) {
    var res = await fetch(backendUrl() + '/api/tournaments/' + id + '/bracket', { cache: 'no-store' });
    return res.json();
  }

  async function advancePlayback(id, duelIndex) {
    await fetch(backendUrl() + '/api/tournaments/' + id + '/advance-playback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duelIndex: duelIndex })
    });
  }

  function playDuelsSequentially(data) {
    if (playing || !data.bracket || !data.bracket.duels) return;
    if (!window.GameEngine || typeof window.GameEngine.startTournamentPlayback !== 'function') {
      toast('Motor de batalla no disponible. Recarga la página.', 'error');
      return;
    }

    playing = true;
    var duels = data.bracket.duels;
    var startIdx = data.currentDuelIndex || 0;
    var tournamentId = data.tournament.id;

    function playNext(idx) {
      if (idx >= duels.length) {
        playing = false;
        renderResult(data.bracket);
        if (window.CreditsSystem && window.connectedAddress) {
          window.CreditsSystem.loadBalance(window.connectedAddress);
        }
        return;
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
            setTimeout(function () { playNext(idx + 1); }, 1200);
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
      if (!data.ok) return;

      renderLobby(data);

      if (data.tournament.status === 'in_progress' && data.bracket) {
        if (data.bracket.playbackStatus === 'ready' && !playing) {
          playDuelsSequentially(data);
        } else if (data.bracket.playbackStatus === 'completed') {
          renderResult(data.bracket);
        }
      }

      if (data.tournament.status === 'completed' && data.bracket) {
        renderResult(data.bracket);
      }
    } catch (e) {
      console.error('[tournament-bracket]', e);
    }
  }

  function watch(tournamentId) {
    watchId = tournamentId;
    localStorage.setItem('mtr_watch_tournament', tournamentId);
    showArena();
    refresh();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 4000);
  }

  function close() {
    watchId = null;
    playing = false;
    localStorage.removeItem('mtr_watch_tournament');
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
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
    if (saved) watch(saved);
  });

  window.TournamentBracket = { watch: watch, close: close, refresh: refresh };
})();
