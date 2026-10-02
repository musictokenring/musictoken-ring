/**
 * Torneos Express (4) y Grand Prix semanal (16): CPU fill, bracket, premios.
 */
const {
  getGenreById,
  EXPRESS_MAX_PLAYERS,
  WEEKLY_MAX_PLAYERS
} = require('./tournament-genres');
const { recordTournamentBattles } = require('./player-battle-history');
const crypto = require('crypto');
const FanPlaysScoring = require('../src/fan-plays-scoring.js');

/*
 * RONDA DE DESTREZA (2026-10-01). Antes cada duelo se sorteaba con
 * Math.random() y el premio se pagaba al instante -- con inscripción y
 * premio en dinero real. Ahora, al cerrar la inscripción, todos los
 * inscritos juegan el mismo mini-juego de la estrella (misma semilla, la
 * misma mecánica que las batallas 1 vs 1) y el servidor recalcula cada
 * puntaje desde los toques crudos con src/fan-plays-scoring.js.
 * Reglas de dinero:
 *   - Nunca empezó a jugar           -> se le devuelve la inscripción.
 *   - Empezó y no mandó a tiempo     -> puntaje 0 (sin devolución: si no,
 *     cualquiera podría jugar, ver que le fue mal y retirarse gratis).
 *   - Menos de 2 jugadores reales    -> se devuelve todo a todos.
 *   - Gana el mejor jugador REAL: 92% de lo que pusieron los que jugaron
 *     (empate exacto: se reparte). Los bots solo completan la llave en
 *     pantalla, con el mismo puntaje simulado documentado de Modo
 *     Práctica, y nunca cobran.
 *   - Se mantiene la descalificación por género (campeón < 80% -> se
 *     devuelve la inscripción a todos).
 */
const SKILL_LEAD_MS = 20 * 1000;          // aviso previo para que todos lleguen
const SKILL_START_WINDOW_MS = 20 * 1000;  // hasta cuándo se puede empezar a jugar
const SKILL_DURATION_MS = 60 * 1000;      // mismo largo que una batalla 1 vs 1
const SKILL_SUBMIT_GRACE_MS = 20 * 1000;  // margen de red para mandar los toques
const PLATFORM_RATE = 0.08;

function skillTiming(bracket) {
  const startsAt = Date.parse(bracket.skillRoundStartsAt);
  const durationMs = Number(bracket.skillRoundDurationMs) || SKILL_DURATION_MS;
  return {
    startsAt,
    durationMs,
    startClosesAt: startsAt + SKILL_START_WINDOW_MS,
    submitDeadline: startsAt + SKILL_START_WINDOW_MS + durationMs + SKILL_SUBMIT_GRACE_MS
  };
}

function isSkillBracket(bracket) {
  return Boolean(bracket && bracket.version === 3);
}

// Mismo PRNG que fan-plays-scoring.js (mulberry32), para que el puntaje
// de cada bot sea fijo y verificable a partir de la semilla del torneo.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Puntaje de un bot: la MISMA curva documentada de Modo Práctica
 * (FanPlaysMinigame.simulateCpuScore: 62 ± 22 por ronda, 10% de perfectos
 * que duplican), ronda por ronda, promediada. Determinística por semilla.
 */
function cpuSkillScore(seed, slot) {
  const rng = mulberry32((seed ^ Math.imul(slot + 101, 0x9E3779B1)) >>> 0);
  const rounds = FanPlaysScoring.totalRoundsFor(SKILL_DURATION_MS);
  let sum = 0;
  for (let i = 0; i < rounds; i++) {
    let sc = Math.max(5, Math.min(97, Math.round(62 + (rng() * 2 - 1) * 22)));
    if (rng() < 0.10) sc = Math.min(200, sc * 2);
    sum += sc;
  }
  return Math.round((sum / rounds) * 10) / 10;
}

const CPU_NAME_POOL = [
  'DJ Arena Bot', 'Beat Machine', 'Stream Master', 'Vinyl CPU',
  'Bass Phantom', 'Drop Commander', 'Mix Bot X', 'Chart Riser',
  'Wave Runner', 'Hit Factory', 'Groove AI', 'Peak Hunter',
  'Tempo Ghost', 'Vibe Synth', 'Pulse Engine', 'Echo Unit'
];

function cpuUserId(index) {
  const suffix = String(index + 1).padStart(12, '0');
  return '00000000-0000-4000-8000-' + suffix;
}

function isCpuParticipantRow(row) {
  if (!row) return false;
  if (row.is_cpu === true) return true;
  return String(row.user_id || '').indexOf('00000000-0000-4000-8000-') === 0;
}

function isHumanParticipantRow(row) {
  return !isCpuParticipantRow(row);
}

function pickPayoutMode(humanCount, cpuCount) {
  if (humanCount < 2 || humanCount <= cpuCount) return 'no_payout';
  return 'human_pool';
}

function roundLabel(playerCount) {
  if (playerCount === 16) return 'Octavos de final';
  if (playerCount === 8) return 'Cuartos de final';
  if (playerCount === 4) return 'Semifinal';
  if (playerCount === 2) return 'Final';
  return 'Ronda';
}

async function fetchDeezerTrack(query, index) {
  try {
    const url = 'https://api.deezer.com/search?q=' + encodeURIComponent(query) + '&limit=40';
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('Deezer HTTP ' + res.status);
    const data = await res.json();
    const tracks = (data.data || []).filter(function (t) { return t.preview; });
    if (!tracks.length) return null;
    const track = tracks[index % tracks.length];
    if (!track.preview && tracks.length > 1) {
      const alt = tracks.find(function (t) { return t.preview; });
      if (alt) return formatDeezerTrack(alt, query, index);
    }
    return formatDeezerTrack(track, query, index);
  } catch (err) {
    console.warn('[tournament-battle] Deezer fallback:', err.message);
    return {
      song_id: 'cpu-' + index,
      song_name: query + ' Mix',
      song_artist: 'Arena CPU',
      song_image: 'https://e-cdns-images.dzcdn.net/images/cover/2646329172/250x250-000000-80-0-0.jpg',
      song_preview: ''
    };
  }
}

function formatDeezerTrack(track, query, index) {
  return {
    song_id: String(track.id),
    song_name: track.title || 'CPU Track',
    song_artist: track.artist?.name || 'CPU Artist',
    song_image: track.album?.cover_medium || track.album?.cover || '',
    song_preview: track.preview || ''
  };
}

/**
 * Duelo de la llave decidido por los puntajes reales de la ronda de
 * destreza. Empate exacto: pasa el humano sobre el bot; entre iguales, el
 * de menor posición en la llave (regla fija, nada al azar).
 * plays1/plays2 = puntaje x100: la arena los usa solo para la proporción
 * de las barras (ya no se muestran como "reproducciones").
 */
function scoreDuel(p1, p2) {
  const s1 = Number(p1.skillScore) || 0;
  const s2 = Number(p2.skillScore) || 0;
  let winner;
  if (s1 !== s2) winner = s1 > s2 ? p1 : p2;
  else if (p1.isCpu !== p2.isCpu) winner = p1.isCpu ? p2 : p1;
  else winner = p1;
  return {
    plays1: Math.max(1, Math.round(s1 * 100)),
    plays2: Math.max(1, Math.round(s2 * 100)),
    winnerParticipantId: winner.id,
    winnerIsCpu: Boolean(winner.isCpu)
  };
}

function participantStableId(row) {
  if (row?.id) return row.id;
  return String(row.tournament_id || '') + ':' + String(row.user_id || '');
}

function participantPayload(row) {
  return {
    id: participantStableId(row),
    userId: row.user_id,
    isCpu: isCpuParticipantRow(row),
    displayName: row.display_name || (isCpuParticipantRow(row) ? 'CPU' : 'Jugador'),
    songId: row.song_id,
    songName: row.song_name || 'Sin título',
    songArtist: row.song_artist || '',
    songImage: row.song_image || '',
    songPreview: row.song_preview || '',
    bracketSlot: row.bracket_slot,
    genreMatchConfidence: row.genre_match_confidence,
    genreMatchVerdict: row.genre_match_verdict,
    genreMatchReason: row.genre_match_reason
  };
}

function duelToMatchShape(duel, tournament) {
  const p1 = duel.player1;
  const p2 = duel.player2;
  return {
    id: duel.id,
    tournament_id: tournament.id,
    match_type: 'tournament',
    player1_song_name: p1.songName,
    player1_song_artist: p1.songArtist,
    player1_song_image: p1.songImage,
    player1_song_preview: p1.songPreview,
    player2_song_name: p2.songName,
    player2_song_artist: p2.songArtist,
    player2_song_image: p2.songImage,
    player2_song_preview: p2.songPreview,
    player1_bet: tournament.entry_fee,
    player2_bet: tournament.entry_fee,
    player1_label: p1.displayName,
    player2_label: p2.displayName,
    player1_is_cpu: p1.isCpu,
    player2_is_cpu: p2.isCpu,
    preset_plays1: duel.plays1,
    preset_plays2: duel.plays2,
    duel_label: duel.label
  };
}

function runSingleEliminationBracket(payloads) {
  const duels = [];
  let roundPlayers = payloads.slice();
  let roundNum = 1;

  while (roundPlayers.length > 1) {
    const label = roundLabel(roundPlayers.length);
    const nextRound = [];

    for (let i = 0; i < roundPlayers.length; i += 2) {
      const p1 = roundPlayers[i];
      const p2 = roundPlayers[i + 1];
      const result = scoreDuel(p1, p2);
      const winner = result.winnerParticipantId === p1.id ? p1 : p2;
      nextRound.push(winner);

      duels.push({
        id: 'r' + roundNum + 'm' + (Math.floor(i / 2) + 1),
        round: roundNum,
        label: label + ' · Duelo ' + (Math.floor(i / 2) + 1),
        player1: p1,
        player2: p2,
        plays1: result.plays1,
        plays2: result.plays2,
        winnerParticipantId: result.winnerParticipantId
      });
    }

    roundPlayers = nextRound;
    roundNum++;
  }

  return { duels, champion: roundPlayers[0] };
}

class TournamentBattleEngine {
  constructor(supabase) {
    this.supabase = supabase;
  }

  async loadHumans(tournamentId) {
    const cols =
      'user_id, tournament_id, song_id, song_name, song_artist, song_image, song_preview, display_name, bracket_slot, is_cpu, genre_match_confidence, genre_match_verdict, genre_match_reason';
    let { data, error } = await this.supabase
      .from('tournament_participants')
      .select(cols)
      .eq('tournament_id', tournamentId);
    if (error && String(error.message || '').indexOf('genre_match') !== -1) {
      // Fallback si la migración 024_tournament_genre_curation.sql todavía
      // no corrió en Supabase — no debe tumbar la carga de TODOS los
      // torneos por columnas que aún no existen.
      const fallbackCols =
        'user_id, tournament_id, song_id, song_name, song_artist, song_image, song_preview, display_name, bracket_slot, is_cpu';
      ({ data, error } = await this.supabase
        .from('tournament_participants')
        .select(fallbackCols)
        .eq('tournament_id', tournamentId));
    }
    if (error) {
      console.error('[tournament-battle] loadHumans:', error.message);
      return [];
    }
    const humans = (data || []).filter(isHumanParticipantRow);
    humans.sort(function (a, b) {
      const ja = a.joined_at ? Date.parse(a.joined_at) : 0;
      const jb = b.joined_at ? Date.parse(b.joined_at) : 0;
      return ja - jb;
    });
    return humans;
  }

  async clearCpuParticipants(tournamentId) {
    const { error } = await this.supabase
      .from('tournament_participants')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('is_cpu', true);
    if (!error) return;

    console.warn('[tournament-battle] clearCpu is_cpu:', tournamentId, error.message);
    const { data: rows, error: readErr } = await this.supabase
      .from('tournament_participants')
      .select('user_id')
      .eq('tournament_id', tournamentId);
    if (readErr) {
      console.warn('[tournament-battle] clearCpu read:', tournamentId, readErr.message);
      return;
    }
    for (const row of (rows || []).filter(isCpuParticipantRow)) {
      await this.supabase
        .from('tournament_participants')
        .delete()
        .eq('tournament_id', tournamentId)
        .eq('user_id', row.user_id);
    }
  }

  /** Filas en users(id) para bots CPU — requerido si existe FK user_id en participantes. */
  async ensureCpuUsersExist(maxIndex) {
    const count = Math.min(Math.max(maxIndex, 1), WEEKLY_MAX_PLAYERS);
    for (let i = 0; i < count; i += 1) {
      const id = cpuUserId(i);
      const { data: existing } = await this.supabase
        .from('users')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (existing) continue;

      const { error } = await this.supabase.from('users').insert([{
        id,
        wallet_address: null,
        email: 'cpu-bot-' + String(i + 1).padStart(2, '0') + '@arena.musictokenring.internal',
        auth_provider: 'cpu',
        saldo_fiat: 0,
        saldo_onchain: 0,
        updated_at: new Date().toISOString()
      }]);

      if (error && error.code !== '23505') {
        console.warn('[tournament-battle] ensureCpuUser:', id, error.message);
      }
    }
  }

  async fillCpuSlots(tournament, humanRows, maxPlayers) {
    const genre = getGenreById(tournament.genre_id);
    const query = genre?.deezerQuery || genre?.label || 'pop';
    const slotsNeeded = maxPlayers - humanRows.length;
    if (slotsNeeded <= 0) return humanRows.slice(0, maxPlayers);

    await this.clearCpuParticipants(tournament.id);
    await this.ensureCpuUsersExist(maxPlayers);

    const tracks = await Promise.all(
      Array.from({ length: slotsNeeded }, function (_, i) {
        return fetchDeezerTrack(query, i + humanRows.length);
      })
    );

    const cpuRows = [];
    const insertErrors = [];
    for (let i = 0; i < slotsNeeded; i++) {
      const track = tracks[i] || await fetchDeezerTrack(query, i + humanRows.length);
      const cpuIndex = i;
      const { error } = await this.supabase
        .from('tournament_participants')
        .insert([{
          tournament_id: tournament.id,
          user_id: cpuUserId(cpuIndex),
          is_cpu: true,
          display_name: CPU_NAME_POOL[cpuIndex % CPU_NAME_POOL.length],
          song_id: track.song_id,
          song_name: track.song_name,
          song_artist: track.song_artist,
          song_image: track.song_image,
          song_preview: track.song_preview
        }]);

      if (error) {
        console.error('[tournament-battle] CPU insert error:', error.message);
        insertErrors.push(error.message);
        continue;
      }
      cpuRows.push({
        tournament_id: tournament.id,
        user_id: cpuUserId(cpuIndex),
        is_cpu: true,
        display_name: CPU_NAME_POOL[cpuIndex % CPU_NAME_POOL.length],
        song_id: track.song_id,
        song_name: track.song_name,
        song_artist: track.song_artist,
        song_image: track.song_image,
        song_preview: track.song_preview,
        bracket_slot: null
      });
    }

    if (cpuRows.length < slotsNeeded && insertErrors.length) {
      const err = new Error(
        'CPU fill ' + cpuRows.length + '/' + slotsNeeded + ': ' + insertErrors[0]
      );
      err.cpuFillErrors = insertErrors;
      throw err;
    }

    return humanRows.concat(cpuRows).slice(0, maxPlayers);
  }

  async assignBracketSlots(tournamentId, allParticipants) {
    await Promise.all(allParticipants.map(function (participant, slot) {
      participant.bracket_slot = slot;
      return this.supabase
        .from('tournament_participants')
        .update({ bracket_slot: slot })
        .eq('tournament_id', tournamentId)
        .eq('user_id', participant.user_id);
    }, this));
    return allParticipants;
  }

  /**
   * Cancela y DEVUELVE la inscripción a los humanos inscritos. Antes solo
   * cambiaba el estado: quien había pagado perdía la inscripción aunque el
   * torneo nunca se jugara. El cambio de estado es condicional (solo desde
   * un estado activo), así que la devolución corre una sola vez.
   */
  async cancelTournament(tournamentId, reason) {
    console.error('[tournament-battle] Cancelado:', tournamentId, reason);
    const { data: claimed } = await this.supabase.from('tournaments').update({
      status: 'cancelled',
      updated_at: new Date().toISOString()
    }).eq('id', tournamentId)
      .in('status', ['registration', 'locked', 'in_progress'])
      .select('id, entry_fee');
    if (!claimed || !claimed.length) return;
    const humans = await this.loadHumans(tournamentId);
    const ids = humans.map(function (h) { return h.user_id; }).filter(Boolean);
    if (ids.length) {
      await this.refundEntry(ids, Number(claimed[0].entry_fee || 3), 'torneo cancelado');
      console.warn('[tournament-battle] ↩️ Inscripción devuelta a', ids.length, 'jugador(es) por cancelación:', tournamentId);
    }
  }

  async startTournament(tournament, maxPlayers) {
    if (!tournament) return null;

    if (isSkillBracket(tournament.bracket_state) && tournament.bracket_state.phase !== 'opening') {
      // Los inscritos tarde ya cuentan: la resolución lee los participantes
      // de la base, no de este snapshot. Reconstruir borraría la semilla.
      return tournament.bracket_state;
    }
    if (tournament.status === 'in_progress' && tournament.bracket_state) {
      const humanRows = await this.loadHumans(tournament.id);
      const bracketHumans = Number(tournament.bracket_state.humanCount) || 0;
      if (humanRows.length > bracketHumans) {
        console.warn('[tournament-battle] Rebuild bracket: DB humanos',
          humanRows.length, 'bracket', bracketHumans);
        await this.clearCpuParticipants(tournament.id);
        await this.supabase.from('tournaments').update({
          status: 'locked',
          bracket_state: null,
          updated_at: new Date().toISOString()
        }).eq('id', tournament.id);
        tournament = Object.assign({}, tournament, {
          status: 'locked',
          bracket_state: null
        });
      } else {
        return tournament.bracket_state;
      }
    }

    const isExpress = tournament.tournament_type === 'express';
    if (tournament.status === 'registration') {
      const closesMs = Date.parse(tournament.registration_closes_at || '');
      if (!Number.isFinite(closesMs) || closesMs > Date.now()) return null;
      const { error: lockErr } = await this.supabase.from('tournaments').update({
        status: 'locked',
        updated_at: new Date().toISOString()
      }).eq('id', tournament.id).eq('status', 'registration');
      if (lockErr) {
        console.warn('[tournament-battle] lock DB skip:', tournament.id, lockErr.message);
      }
      tournament = { ...tournament, status: 'locked' };
    }

    if (tournament.status !== 'locked' && tournament.status !== 'registration') return null;

    // CANDADO: el inicio se dispara desde varios lados a la vez (scheduler
    // cada 10 s, el "kick" del navegador de cada jugador, rutas de limpieza).
    // Antes daba igual; con la ronda de destreza, dos inicios juntos
    // reabrían la ronda con OTRA semilla (los toques de quien ya jugaba se
    // calificaban contra otro patrón) o chocaban al recrear los bots y el
    // torneo terminaba cancelado. Solo quien gana este UPDATE condicional
    // arma la ronda; un candado colgado (>2 min) se puede retomar.
    const claimed = await this.claimSkillOpening(tournament.id);
    if (!claimed) return null;

    let humanRows = await this.loadHumans(tournament.id);
    for (let attempt = 0; attempt < 5 && !humanRows.length; attempt += 1) {
      await new Promise(function (resolve) { setTimeout(resolve, 700); });
      humanRows = await this.loadHumans(tournament.id);
    }

    if (humanRows.length) {
      console.log('[tournament-battle] Humanos cargados:', humanRows.length,
        'torneo:', tournament.id);
    }
    if (!humanRows.length && !isExpress) {
      await this.cancelTournament(tournament.id, 'sin humanos');
      return null;
    }

    let allParticipants;
    try {
      allParticipants = await this.fillCpuSlots(tournament, humanRows, maxPlayers);
    } catch (fillErr) {
      await this.cancelTournament(tournament.id, fillErr.message);
      throw fillErr;
    }
    allParticipants = await this.assignBracketSlots(tournament.id, allParticipants);

    if (allParticipants.length < maxPlayers) {
      const reason =
        'plazas incompletas ' + allParticipants.length + '/' + maxPlayers +
        ' (¿migración 016 en Supabase?)';
      await this.cancelTournament(tournament.id, reason);
      const err = new Error(reason);
      err.stage = 'cpu_fill_failed';
      throw err;
    }

    const payloads = allParticipants
      .slice()
      .sort(function (a, b) { return (a.bracket_slot || 0) - (b.bracket_slot || 0); })
      .map(participantPayload);

    return this.openSkillRound(tournament, payloads, humanRows.length, maxPlayers);
  }

  async claimSkillOpening(tournamentId) {
    const fresh = await this.loadTournamentRow(tournamentId);
    if (!fresh || (fresh.status !== 'locked' && fresh.status !== 'registration')) return false;
    const bs = fresh.bracket_state;
    const nowIso = new Date().toISOString();
    const lock = { version: 3, phase: 'opening', openingAt: nowIso, openingToken: crypto.randomUUID() };
    let q = this.supabase.from('tournaments')
      .update({ bracket_state: lock, updated_at: nowIso })
      .eq('id', tournamentId)
      .in('status', ['locked', 'registration']);
    if (isSkillBracket(bs)) {
      if (bs.phase !== 'opening') return false;
      if (Date.now() - Date.parse(bs.openingAt || 0) < 2 * 60 * 1000) return false;
      q = q.eq('bracket_state->>openingToken', bs.openingToken);
    } else if (bs) {
      // Restos de una llave vieja (formato anterior) en un torneo sin
      // arrancar: se reemplazan solo si siguen siendo exactamente esos.
      q = q.eq('updated_at', fresh.updated_at);
    } else {
      q = q.is('bracket_state', null);
    }
    const { data } = await q.select('id');
    return Boolean(data && data.length);
  }

  /** Cierra la inscripción y abre la ronda de destreza (todavía no se decide nada). */
  async openSkillRound(tournament, payloads, humanCount, maxPlayers) {
    const now = Date.now();
    const bracketState = {
      version: 3,
      phase: 'skill_round',
      seed: crypto.randomInt(1, 2147483647),
      skillRoundStartsAt: new Date(now + SKILL_LEAD_MS).toISOString(),
      skillRoundDurationMs: SKILL_DURATION_MS,
      maxPlayers,
      tournamentType: tournament.tournament_type,
      humanCount,
      cpuCount: payloads.length - humanCount,
      participants: payloads,
      duels: [],
      totalDuels: 0,
      currentDuelIndex: 0,
      playbackStatus: 'skill_round'
    };
    await this.supabase.from('tournaments').update({
      status: 'in_progress',
      current_participants: payloads.length,
      human_participants: humanCount,
      bracket_state: bracketState,
      updated_at: new Date().toISOString()
    }).eq('id', tournament.id);
    console.log('[tournament-battle] 🎯 Ronda de destreza abierta:', tournament.name,
      'humanos:', humanCount, 'arranca:', bracketState.skillRoundStartsAt);
    return bracketState;
  }

  async loadTournamentRow(tournamentId) {
    const { data } = await this.supabase.from('tournaments').select('*').eq('id', tournamentId).maybeSingle();
    return data || null;
  }

  async loadSkillParticipant(tournamentId, userId) {
    return this.supabase
      .from('tournament_participants')
      .select('user_id, is_cpu, fanplay_started_at, fanplay_score')
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .maybeSingle();
  }

  /**
   * El jugador empieza su ronda: queda registrado que empezó (desde acá ya
   * no hay devolución por no presentarse) y recién ahí recibe la semilla.
   */
  async startSkillForUser(tournamentId, userId) {
    const t = await this.loadTournamentRow(tournamentId);
    if (!t || !isSkillBracket(t.bracket_state)) return { ok: false, error: 'Este torneo no tiene ronda de destreza abierta.' };
    const b = t.bracket_state;
    if (b.phase !== 'skill_round') return { ok: false, error: 'La ronda de destreza ya terminó.', closed: true };
    const timing = skillTiming(b);
    const now = Date.now();
    if (now < timing.startsAt - 3000) return { ok: false, error: 'Todavía no arranca.', notYet: true, startsAt: b.skillRoundStartsAt };

    const { data: row, error } = await this.loadSkillParticipant(tournamentId, userId);
    if (error) {
      console.error('[tournament-battle] skill start:', error.message);
      return { ok: false, error: 'Falta la migración sql/tournament-skill-round.sql en Supabase.' };
    }
    if (!row || isCpuParticipantRow(row)) return { ok: false, error: 'No estás inscrito en este torneo.' };
    if (row.fanplay_score != null) return { ok: false, error: 'Ya jugaste esta ronda.', alreadySubmitted: true, score: Number(row.fanplay_score) };

    if (!row.fanplay_started_at) {
      if (now > timing.startClosesAt) {
        return { ok: false, error: 'Llegaste tarde: la ronda ya empezó. Te devolvemos la inscripción al cerrar.', tooLate: true };
      }
      await this.supabase.from('tournament_participants')
        .update({ fanplay_started_at: new Date(now).toISOString() })
        .eq('tournament_id', tournamentId)
        .eq('user_id', userId)
        .is('fanplay_started_at', null);
    }
    return {
      ok: true,
      seed: b.seed,
      durationMs: timing.durationMs,
      startsAt: b.skillRoundStartsAt,
      submitDeadline: new Date(timing.submitDeadline).toISOString()
    };
  }

  /** Toques crudos -> puntaje recalculado acá. Se anota una sola vez. */
  async submitSkillScore(tournamentId, userId, taps) {
    if (!Array.isArray(taps)) return { ok: false, error: 'Faltan los toques.' };
    const t = await this.loadTournamentRow(tournamentId);
    if (!t || !isSkillBracket(t.bracket_state)) return { ok: false, error: 'Este torneo no tiene ronda de destreza.' };
    const b = t.bracket_state;
    const timing = skillTiming(b);
    if (b.phase !== 'skill_round' || Date.now() > timing.submitDeadline) {
      return { ok: false, error: 'Se cerró el tiempo para mandar tu resultado.', late: true };
    }
    const { data: row, error } = await this.loadSkillParticipant(tournamentId, userId);
    if (error) return { ok: false, error: 'Falta la migración sql/tournament-skill-round.sql en Supabase.' };
    if (!row || isCpuParticipantRow(row)) return { ok: false, error: 'No estás inscrito en este torneo.' };
    if (!row.fanplay_started_at) return { ok: false, error: 'No empezaste la ronda.' };
    if (row.fanplay_score != null) return { ok: true, alreadySubmitted: true, score: Number(row.fanplay_score) };

    const result = FanPlaysScoring.computeScoreFromTaps(taps.slice(0, 2000), Number(b.seed), timing.durationMs);
    const score = Math.round(Number(result.average || 0) * 10) / 10;
    const { data: claimed } = await this.supabase.from('tournament_participants')
      .update({ fanplay_score: score, fanplay_submitted_at: new Date().toISOString() })
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .is('fanplay_score', null)
      .select('user_id');
    if (!claimed || !claimed.length) {
      const { data: fresh } = await this.loadSkillParticipant(tournamentId, userId);
      return { ok: true, alreadySubmitted: true, score: fresh && fresh.fanplay_score != null ? Number(fresh.fanplay_score) : null };
    }
    return { ok: true, score };
  }

  /**
   * Si ya pasó el plazo (o todos los que empezaron ya mandaron y terminó
   * el tiempo de juego), arma la llave con los puntajes y paga. Solo una
   * llamada gana el "claim" (phase skill_round -> resolving en un UPDATE
   * condicional), así que nunca se paga dos veces.
   */
  async resolveSkillRoundIfDue(tournamentId) {
    const t = await this.loadTournamentRow(tournamentId);
    if (!t || t.status !== 'in_progress' || !isSkillBracket(t.bracket_state)) return null;
    const b = t.bracket_state;
    if (b.phase !== 'skill_round') return null;
    const timing = skillTiming(b);
    const now = Date.now();
    if (now < timing.startsAt + timing.durationMs) return null;

    const { data: rows, error } = await this.supabase
      .from('tournament_participants')
      .select('*')
      .eq('tournament_id', tournamentId);
    if (error) {
      console.error('[tournament-battle] resolve load:', error.message);
      return null;
    }
    const humans = (rows || []).filter(isHumanParticipantRow);
    const pending = humans.some(function (h) {
      return (h.fanplay_started_at && h.fanplay_score == null) ||
        (!h.fanplay_started_at && now <= timing.startClosesAt);
    });
    if (pending && now <= timing.submitDeadline) return null;

    const claimedState = Object.assign({}, b, { phase: 'resolving', resolvingAt: new Date(now).toISOString() });
    const { data: claim } = await this.supabase.from('tournaments')
      .update({ bracket_state: claimedState, updated_at: new Date(now).toISOString() })
      .eq('id', tournamentId)
      .eq('bracket_state->>phase', 'skill_round')
      .select('id');
    if (!claim || !claim.length) return null;

    try {
      return await this.finalizeSkillTournament(t, b, rows || []);
    } catch (err) {
      // No se reintenta solo: si algo se pagó antes de fallar, otro intento
      // podría pagar dos veces. Queda en "resolving" para revisar a mano.
      console.error('[tournament-battle] ❌ resolveSkillRound falló, revisar a mano:', tournamentId, err.message);
      return null;
    }
  }

  async refundEntry(userIds, entryFee, why) {
    await Promise.all(userIds.map((uid) =>
      this.supabase.rpc('increment_user_credits', { user_id_param: uid, credits_to_add: entryFee })
        .then(({ error }) => {
          if (error) console.error('[tournament-battle] Reembolso (' + why + ') falló para', uid, error.message);
        })
    ));
  }

  async finalizeSkillTournament(tournament, b, rows) {
    const entryFee = Number(tournament.entry_fee || 3);
    const maxPlayers = Number(b.maxPlayers) || rows.length;
    const label = tournament.tournament_type === 'weekly' ? 'Grand Prix' : 'Express';

    const humanRows = rows.filter(isHumanParticipantRow);
    const competitors = humanRows.filter(function (h) { return Boolean(h.fanplay_started_at); });
    const noShows = humanRows.filter(function (h) { return !h.fanplay_started_at; });

    // Llave final: todos los humanos (incluso inscritos tarde) + bots hasta
    // completar las plazas, en el orden de la llave original.
    const slotOf = function (r) { return Number.isFinite(Number(r.bracket_slot)) && r.bracket_slot != null ? Number(r.bracket_slot) : 999; };
    const cpuRows = rows.filter(isCpuParticipantRow).sort(function (a, c) { return slotOf(a) - slotOf(c); });
    const field = humanRows.concat(cpuRows.slice(0, Math.max(0, maxPlayers - humanRows.length)));
    field.sort(function (a, c) { return slotOf(a) - slotOf(c); });

    const payloads = field.map(function (row, idx) {
      const p = participantPayload(row);
      p.skillScore = isCpuParticipantRow(row)
        ? cpuSkillScore(b.seed, idx)
        : (row.fanplay_score != null ? Number(row.fanplay_score) : 0);
      p.skillPlayed = isCpuParticipantRow(row) ? true : Boolean(row.fanplay_started_at);
      return p;
    });
    const bracketResult = runSingleEliminationBracket(payloads);

    // Mejor(es) jugador(es) real(es) entre los que jugaron.
    const humanPayloads = payloads.filter(function (p) { return !p.isCpu && p.skillPlayed; });
    const topScore = humanPayloads.reduce(function (m, p) { return Math.max(m, p.skillScore); }, -1);
    const prizeWinners = humanPayloads.filter(function (p) { return p.skillScore === topScore; });
    const bestHuman = prizeWinners[0] || null;

    const championConfidence = bestHuman && bestHuman.genreMatchConfidence != null ? Number(bestHuman.genreMatchConfidence) : null;
    const genreDisqualified = championConfidence != null && !Number.isNaN(championConfidence) && championConfidence < 80;
    const notEnoughHumans = competitors.length < 2;

    let prizeAwarded = 0;
    let resultMessage;
    const allHumanIds = humanRows.map(function (h) { return h.user_id; }).filter(Boolean);

    if (notEnoughHumans) {
      await this.refundEntry(allHumanIds, entryFee, 'menos de 2 jugadores');
      resultMessage = 'Jugaron menos de 2 personas reales en este ' + label +
        ' -- se devolvió la inscripción a todos.';
    } else if (genreDisqualified) {
      await this.refundEntry(allHumanIds, entryFee, 'descalificación por género');
      resultMessage = '"' + bestHuman.songName + '" de ' + bestHuman.songArtist + ' no encajaba con el género del torneo (' +
        championConfidence + '% según la IA) -- se descalificó y se devolvió la inscripción a todos.';
    } else {
      if (noShows.length) {
        await this.refundEntry(noShows.map(function (h) { return h.user_id; }), entryFee, 'no se presentó');
      }
      const pool = competitors.length * entryFee;
      const totalPrize = Math.round(pool * (1 - PLATFORM_RATE) * 10) / 10;
      const each = Math.floor((totalPrize / prizeWinners.length) * 10) / 10;
      for (const w of prizeWinners) {
        const { error: awardError } = await this.supabase.rpc('increment_user_credits', {
          user_id_param: w.userId,
          credits_to_add: each
        });
        if (awardError) console.error('[tournament-battle] Premio falló para', w.userId, awardError.message);
        else prizeAwarded += each;
      }
      prizeAwarded = Math.round(prizeAwarded * 10) / 10;
      resultMessage = prizeWinners.length > 1
        ? 'Empate en la cima con ' + topScore + ' puntos: ' + prizeWinners.map(function (p) { return p.displayName; }).join(' y ') +
          ' se reparten ' + prizeAwarded.toFixed(1) + ' cr.'
        : '¡' + bestHuman.displayName + ' fue el mejor jugador real con ' + topScore + ' puntos y gana ' + prizeAwarded.toFixed(1) + ' cr!' +
          (noShows.length ? ' A quien no se presentó se le devolvió la inscripción.' : '');
    }

    const paid = !notEnoughHumans && !genreDisqualified;
    const prizeWinnerIds = paid ? prizeWinners.map(function (p) { return p.id; }) : [];
    const bracketState = Object.assign({}, b, {
      phase: 'resolved',
      participants: payloads,
      duels: bracketResult.duels,
      totalDuels: bracketResult.duels.length,
      currentDuelIndex: 0,
      playbackStatus: 'ready',
      humanCount: humanRows.length,
      competitorCount: competitors.length,
      cpuCount: payloads.length - humanRows.length,
      payoutMode: paid ? 'best_human' : 'refund',
      resultMessage,
      winnerParticipantId: bracketResult.champion ? bracketResult.champion.id : null,
      winnerIsHuman: bracketResult.champion ? !bracketResult.champion.isCpu : false,
      prizeWinnerIds,
      prizeAwarded,
      championName: bestHuman ? bestHuman.displayName : null,
      championSong: bestHuman ? bestHuman.songName : null,
      genreDisqualified,
      championGenreConfidence: championConfidence,
      refundedNotEnoughHumans: notEnoughHumans,
      resolvedAt: new Date().toISOString()
    });
    delete bracketState.resolvingAt;

    for (const h of humanRows) {
      const won = paid && prizeWinners.some(function (p) { return p.userId === h.user_id; });
      await this.supabase.from('tournament_participants')
        .update({ placement: won ? 1 : 2, eliminated: !won })
        .eq('tournament_id', tournament.id)
        .eq('user_id', h.user_id);
    }

    await this.supabase.from('tournaments').update({
      payout_mode: bracketState.payoutMode,
      human_participants: humanRows.length,
      bracket_state: bracketState,
      updated_at: new Date().toISOString()
    }).eq('id', tournament.id);

    console.log('[tournament-battle] ✅ Ronda de destreza resuelta:', tournament.name,
      'jugaron:', competitors.length, 'premio:', prizeAwarded, '-', resultMessage);
    return bracketState;
  }

  async startExpressTournament(tournament) {
    if (tournament?.tournament_type !== 'express') return null;
    return this.startTournament(tournament, EXPRESS_MAX_PLAYERS);
  }

  async startWeeklyTournament(tournament) {
    if (tournament?.tournament_type !== 'weekly') return null;
    return this.startTournament(tournament, WEEKLY_MAX_PLAYERS);
  }

  async getBracketPayload(tournamentId) {
    const { data: tournament, error } = await this.supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .maybeSingle();

    if (error || !tournament) {
      return { ok: false, error: 'Torneo no encontrado' };
    }

    let bracket = tournament.bracket_state || null;
    if (bracket && bracket.seed != null) {
      // La semilla se entrega solo a quien empieza a jugar (startSkillForUser).
      bracket = Object.assign({}, bracket);
      delete bracket.seed;
    }
    if (bracket && isSkillBracket(bracket) && bracket.skillRoundStartsAt) {
      const timing = skillTiming(bracket);
      bracket.skillRoundStartClosesAt = new Date(timing.startClosesAt).toISOString();
      bracket.skillRoundSubmitDeadline = new Date(timing.submitDeadline).toISOString();
    }
    let currentMatch = null;
    if (bracket && bracket.duels && bracket.duels.length) {
      const idx = bracket.currentDuelIndex || 0;
      const duel = bracket.duels[Math.min(idx, bracket.duels.length - 1)];
      if (duel) currentMatch = duelToMatchShape(duel, tournament);
    }

    return {
      ok: true,
      serverTime: new Date().toISOString(),
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        tournament_type: tournament.tournament_type,
        genre_id: tournament.genre_id,
        entry_fee: tournament.entry_fee,
        prize_pool: tournament.prize_pool,
        human_participants: tournament.human_participants,
        payout_mode: tournament.payout_mode,
        registration_closes_at: tournament.registration_closes_at
      },
      bracket,
      currentMatch,
      currentDuelIndex: bracket?.currentDuelIndex || 0,
      totalDuels: bracket?.totalDuels || bracket?.duels?.length || 0
    };
  }

  async advancePlayback(tournamentId, duelIndex) {
    const { data: tournament } = await this.supabase
      .from('tournaments')
      .select('id, bracket_state, status')
      .eq('id', tournamentId)
      .maybeSingle();

    if (!tournament?.bracket_state) {
      return { ok: false, error: 'Sin bracket' };
    }

    const bracket = { ...tournament.bracket_state };
    const nextIndex = (duelIndex || 0) + 1;
    bracket.currentDuelIndex = nextIndex;

    if (nextIndex >= (bracket.duels?.length || 0)) {
      bracket.playbackStatus = 'completed';
      const { data: fullTournament } = await this.supabase
        .from('tournaments')
        .select('id, name, tournament_type, entry_fee, updated_at')
        .eq('id', tournamentId)
        .maybeSingle();

      await this.supabase.from('tournaments').update({
        status: 'completed',
        bracket_state: bracket,
        updated_at: new Date().toISOString()
      }).eq('id', tournamentId);

      if (fullTournament) {
        try {
          await recordTournamentBattles(this.supabase, fullTournament, bracket);
        } catch (histErr) {
          console.error('[tournament-battle] battle history:', histErr.message);
        }
      }
    } else {
      bracket.playbackStatus = 'playing';
      await this.supabase.from('tournaments').update({
        bracket_state: bracket,
        updated_at: new Date().toISOString()
      }).eq('id', tournamentId);
    }

    return { ok: true, bracket };
  }
}

module.exports = {
  TournamentBattleEngine,
  isSkillBracket,
  skillTiming,
  cpuSkillScore,
  duelToMatchShape,
  pickPayoutMode,
  isCpuParticipantRow,
  isHumanParticipantRow
};
