/**
 * Torneos Express (4) y Grand Prix semanal (16): CPU fill, bracket, premios.
 */
const {
  getGenreById,
  EXPRESS_MAX_PLAYERS,
  WEEKLY_MAX_PLAYERS
} = require('./tournament-genres');

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

function pickPayoutMode(humanCount, cpuCount) {
  if (humanCount < 2 || humanCount <= cpuCount) return 'no_payout';
  return 'human_pool';
}

function buildResultMessage(tournamentType, payoutMode, humanCount, cpuCount, winnerIsHuman, prizeAwarded) {
  const label = tournamentType === 'weekly' ? 'Grand Prix' : 'Express';
  if (payoutMode === 'no_payout') {
    if (humanCount < 2) {
      return 'No hubo otros jugadores reales en este ' + label + '. '
        + 'La CPU completó el bracket. Sin premio acreditado.';
    }
    return 'La CPU ocupó la mayoría de plazas (' + cpuCount + ' vs ' + humanCount
      + ' humanos). Pasaste sin acreditación de premio.';
  }
  if (winnerIsHuman && prizeAwarded > 0) {
    return '¡Ganaste el ' + label + '! Premio acreditado: ' + prizeAwarded.toFixed(1)
      + ' cr (solo apuestas de jugadores reales).';
  }
  return label + ' completado. El premio fue para otro jugador humano.';
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
    return {
      song_id: String(track.id),
      song_name: track.title || 'CPU Track',
      song_artist: track.artist?.name || 'CPU Artist',
      song_image: track.album?.cover_medium || track.album?.cover || '',
      song_preview: track.preview || ''
    };
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

function simulateDuel(p1, p2) {
  const base1 = Math.floor(Math.random() * 600000) + 250000;
  const base2 = Math.floor(Math.random() * 600000) + 250000;
  let plays1 = 0;
  let plays2 = 0;
  for (let i = 0; i < 55; i++) {
    plays1 += Math.max(1, Math.floor((base1 / 55) * (0.75 + Math.random() * 0.5)));
    plays2 += Math.max(1, Math.floor((base2 / 55) * (0.75 + Math.random() * 0.5)));
  }
  const winner = plays1 >= plays2 ? p1 : p2;
  return {
    plays1,
    plays2,
    winnerParticipantId: winner.id,
    winnerIsCpu: Boolean(winner.isCpu)
  };
}

function participantPayload(row) {
  return {
    id: row.id,
    userId: row.user_id,
    isCpu: Boolean(row.is_cpu),
    displayName: row.display_name || (row.is_cpu ? 'CPU' : 'Jugador'),
    songId: row.song_id,
    songName: row.song_name || 'Sin título',
    songArtist: row.song_artist || '',
    songImage: row.song_image || '',
    songPreview: row.song_preview || '',
    bracketSlot: row.bracket_slot
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
      const result = simulateDuel(p1, p2);
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
    const { data: humans } = await this.supabase
      .from('tournament_participants')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('is_cpu', false)
      .order('joined_at', { ascending: true });
    return humans || [];
  }

  async fillCpuSlots(tournament, humanRows, maxPlayers) {
    const genre = getGenreById(tournament.genre_id);
    const query = genre?.deezerQuery || genre?.label || 'pop';
    const slotsNeeded = maxPlayers - humanRows.length;
    const cpuRows = [];

    for (let i = 0; i < slotsNeeded; i++) {
      const track = await fetchDeezerTrack(query, i + humanRows.length);
      const cpuIndex = i;
      const { data: inserted, error } = await this.supabase
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
        }])
        .select()
        .single();

      if (error) {
        console.error('[tournament-battle] CPU insert error:', error.message);
        continue;
      }
      cpuRows.push(inserted);
    }

    return humanRows.concat(cpuRows).slice(0, maxPlayers);
  }

  async assignBracketSlots(allParticipants) {
    for (let s = 0; s < allParticipants.length; s++) {
      await this.supabase
        .from('tournament_participants')
        .update({ bracket_slot: s })
        .eq('id', allParticipants[s].id);
      allParticipants[s].bracket_slot = s;
    }
    return allParticipants;
  }

  async cancelTournament(tournamentId, reason) {
    console.error('[tournament-battle] Cancelado:', tournamentId, reason);
    await this.supabase.from('tournaments').update({
      status: 'cancelled',
      updated_at: new Date().toISOString()
    }).eq('id', tournamentId);
  }

  async finalizeTournament(tournament, allParticipants, humanCount, bracketResult) {
    const cpuCount = allParticipants.length - humanCount;
    const payoutMode = pickPayoutMode(humanCount, cpuCount);
    const champion = bracketResult.champion;
    const duels = bracketResult.duels;

    let prizeAwarded = 0;
    if (payoutMode === 'human_pool' && champion && !champion.isCpu) {
      const humanPool = humanCount * Number(tournament.entry_fee || 3);
      const platformRate = 0.08;
      prizeAwarded = Math.round(humanPool * (1 - platformRate) * 10) / 10;
      const { error: awardError } = await this.supabase.rpc('increment_user_credits', {
        user_id_param: champion.userId,
        credits_to_add: prizeAwarded
      });
      if (awardError) {
        console.error('[tournament-battle] Prize award error:', awardError.message);
        prizeAwarded = 0;
      }
    }

    const resultMessage = buildResultMessage(
      tournament.tournament_type,
      payoutMode,
      humanCount,
      cpuCount,
      champion && !champion.isCpu,
      prizeAwarded
    );

    const payloads = allParticipants
      .slice()
      .sort(function (a, b) { return (a.bracket_slot || 0) - (b.bracket_slot || 0); })
      .map(participantPayload);

    const bracketState = {
      version: 2,
      tournamentType: tournament.tournament_type,
      humanCount,
      cpuCount,
      payoutMode,
      participants: payloads,
      duels,
      totalDuels: duels.length,
      currentDuelIndex: 0,
      playbackStatus: 'ready',
      resultMessage,
      winnerParticipantId: champion?.id,
      winnerIsHuman: champion ? !champion.isCpu : false,
      prizeAwarded,
      championName: champion?.displayName,
      championSong: champion?.songName
    };

    if (champion?.id) {
      await this.supabase
        .from('tournament_participants')
        .update({ placement: 2, eliminated: true })
        .eq('tournament_id', tournament.id)
        .neq('id', champion.id);

      await this.supabase
        .from('tournament_participants')
        .update({ placement: 1, eliminated: false })
        .eq('id', champion.id);
    }

    await this.supabase.from('tournaments').update({
      status: 'in_progress',
      current_participants: allParticipants.length,
      human_participants: humanCount,
      payout_mode: payoutMode,
      bracket_state: bracketState,
      updated_at: new Date().toISOString()
    }).eq('id', tournament.id);

    console.log('[tournament-battle] ✅', tournament.tournament_type, 'iniciado:',
      tournament.name, 'humanos:', humanCount, 'CPU:', cpuCount);

    return bracketState;
  }

  async startTournament(tournament, maxPlayers) {
    if (!tournament) return null;

    if (tournament.status === 'in_progress' && tournament.bracket_state) {
      return tournament.bracket_state;
    }

    const isExpress = tournament.tournament_type === 'express';
    if (tournament.status === 'registration') {
      const closesMs = new Date(tournament.registration_closes_at).getTime();
      if (closesMs > Date.now()) return null;
      await this.supabase.from('tournaments').update({
        status: 'locked',
        updated_at: new Date().toISOString()
      }).eq('id', tournament.id);
      tournament = { ...tournament, status: 'locked' };
    }

    if (tournament.status !== 'locked') return null;

    const humanRows = await this.loadHumans(tournament.id);
    if (!humanRows.length && !isExpress) {
      await this.cancelTournament(tournament.id, 'sin humanos');
      return null;
    }

    let allParticipants = await this.fillCpuSlots(tournament, humanRows, maxPlayers);
    allParticipants = await this.assignBracketSlots(allParticipants);

    if (allParticipants.length < maxPlayers) {
      await this.cancelTournament(
        tournament.id,
        'plazas incompletas ' + allParticipants.length + '/' + maxPlayers +
        ' (¿migración 016 en Supabase?)'
      );
      return null;
    }

    const payloads = allParticipants
      .slice()
      .sort(function (a, b) { return (a.bracket_slot || 0) - (b.bracket_slot || 0); })
      .map(participantPayload);

    const bracketResult = runSingleEliminationBracket(payloads);
    return this.finalizeTournament(
      tournament,
      allParticipants,
      humanRows.length,
      bracketResult
    );
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

    const bracket = tournament.bracket_state || null;
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
      await this.supabase.from('tournaments').update({
        status: 'completed',
        bracket_state: bracket,
        updated_at: new Date().toISOString()
      }).eq('id', tournamentId);
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

module.exports = { TournamentBattleEngine, duelToMatchShape, pickPayoutMode };
