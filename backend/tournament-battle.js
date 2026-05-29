/**
 * Express bracket: CPU fill, simulación de duelos, premios humanos.
 */
const { getGenreById, EXPRESS_MAX_PLAYERS } = require('./tournament-genres');

const CPU_USER_IDS = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004'
];

const CPU_NAMES = ['DJ Arena Bot', 'Beat Machine', 'Stream Master', 'Vinyl CPU'];

function pickPayoutMode(humanCount, cpuCount) {
  if (humanCount < 2 || humanCount <= cpuCount) return 'no_payout';
  return 'human_pool';
}

function buildResultMessage(payoutMode, humanCount, cpuCount, winnerIsHuman, prizeAwarded) {
  if (payoutMode === 'no_payout') {
    if (humanCount < 2) {
      return 'No hubo otros jugadores reales. La CPU completó el slot. '
        + 'Tu inscripción no genera premio: conservas tu saldo sin ganancia extra.';
    }
    return 'La CPU ocupó la mayoría de plazas (' + cpuCount + ' vs ' + humanCount
      + ' humanos). Pasaste la ronda sin acreditación de premio.';
  }
  if (winnerIsHuman && prizeAwarded > 0) {
    return '¡Ganaste el Express! Premio acreditado: ' + prizeAwarded.toFixed(1) + ' cr '
      + '(solo apuestas de jugadores reales).';
  }
  return 'Torneo completado. El premio fue para otro jugador humano.';
}

async function fetchDeezerTrack(query, index) {
  try {
    const url = 'https://api.deezer.com/search?q=' + encodeURIComponent(query) + '&limit=25';
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
    winnerIsCpu: Boolean(winner.is_cpu)
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

class TournamentBattleEngine {
  constructor(supabase) {
    this.supabase = supabase;
  }

  async startExpressTournament(tournament) {
    if (!tournament || tournament.tournament_type !== 'express') return null;
    if (tournament.status !== 'locked') return null;

    const { data: humans } = await this.supabase
      .from('tournament_participants')
      .select('*')
      .eq('tournament_id', tournament.id)
      .eq('is_cpu', false)
      .order('joined_at', { ascending: true });

    const humanRows = humans || [];
    if (!humanRows.length) {
      await this.supabase.from('tournaments').update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      }).eq('id', tournament.id);
      return null;
    }

    const genre = getGenreById(tournament.genre_id);
    const query = genre?.deezerQuery || genre?.label || 'pop';
    const slotsNeeded = EXPRESS_MAX_PLAYERS - humanRows.length;
    const cpuRows = [];

    for (let i = 0; i < slotsNeeded; i++) {
      const track = await fetchDeezerTrack(query, i + humanRows.length);
      const cpuUserId = CPU_USER_IDS[i % CPU_USER_IDS.length];
      const { data: inserted, error } = await this.supabase
        .from('tournament_participants')
        .insert([{
          tournament_id: tournament.id,
          user_id: cpuUserId,
          is_cpu: true,
          display_name: CPU_NAMES[i % CPU_NAMES.length],
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

    const allParticipants = humanRows.concat(cpuRows).slice(0, EXPRESS_MAX_PLAYERS);
    for (let s = 0; s < allParticipants.length; s++) {
      await this.supabase
        .from('tournament_participants')
        .update({ bracket_slot: s })
        .eq('id', allParticipants[s].id);
      allParticipants[s].bracket_slot = s;
    }

    if (allParticipants.length < EXPRESS_MAX_PLAYERS) {
      console.error('[tournament-battle] No se pudieron llenar 4 plazas:', allParticipants.length);
      await this.supabase.from('tournaments').update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      }).eq('id', tournament.id);
      return null;
    }

    const humanCount = humanRows.length;
    const cpuCount = allParticipants.length - humanCount;
    const payoutMode = pickPayoutMode(humanCount, cpuCount);

    const bySlot = allParticipants.slice().sort(function (a, b) {
      return (a.bracket_slot || 0) - (b.bracket_slot || 0);
    });
    const payloads = bySlot.map(participantPayload);

    const sf1p1 = payloads[0];
    const sf1p2 = payloads[1];
    const sf2p1 = payloads[2];
    const sf2p2 = payloads[3];

    const sf1 = simulateDuel(sf1p1, sf1p2);
    const sf2 = simulateDuel(sf2p1, sf2p2);

    const finalP1 = sf1.winnerParticipantId === sf1p1.id ? sf1p1 : sf1p2;
    const finalP2 = sf2.winnerParticipantId === sf2p1.id ? sf2p1 : sf2p2;
    const finalResult = simulateDuel(finalP1, finalP2);
    const champion = finalResult.winnerParticipantId === finalP1.id ? finalP1 : finalP2;

    const duels = [
      {
        id: 'sf1',
        round: 1,
        label: 'Semifinal 1',
        player1: sf1p1,
        player2: sf1p2,
        plays1: sf1.plays1,
        plays2: sf1.plays2,
        winnerParticipantId: sf1.winnerParticipantId
      },
      {
        id: 'sf2',
        round: 1,
        label: 'Semifinal 2',
        player1: sf2p1,
        player2: sf2p2,
        plays1: sf2.plays1,
        plays2: sf2.plays2,
        winnerParticipantId: sf2.winnerParticipantId
      },
      {
        id: 'final',
        round: 2,
        label: 'Final Express',
        player1: finalP1,
        player2: finalP2,
        plays1: finalResult.plays1,
        plays2: finalResult.plays2,
        winnerParticipantId: finalResult.winnerParticipantId
      }
    ];

    let prizeAwarded = 0;
    let resultMessage = '';

    if (payoutMode === 'human_pool' && !champion.isCpu) {
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

    resultMessage = buildResultMessage(
      payoutMode,
      humanCount,
      cpuCount,
      !champion.isCpu,
      prizeAwarded
    );

    const bracketState = {
      version: 1,
      humanCount,
      cpuCount,
      payoutMode,
      participants: payloads,
      duels,
      currentDuelIndex: 0,
      playbackStatus: 'ready',
      resultMessage,
      winnerParticipantId: champion.id,
      winnerIsHuman: !champion.isCpu,
      prizeAwarded,
      championName: champion.displayName,
      championSong: champion.songName
    };

    await this.supabase
      .from('tournament_participants')
      .update({ placement: 2, eliminated: true })
      .eq('tournament_id', tournament.id)
      .neq('id', champion.id);

    await this.supabase
      .from('tournament_participants')
      .update({ placement: 1, eliminated: false })
      .eq('id', champion.id);

    const nowIso = new Date().toISOString();
    await this.supabase
      .from('tournaments')
      .update({
        status: 'in_progress',
        current_participants: allParticipants.length,
        human_participants: humanCount,
        payout_mode: payoutMode,
        bracket_state: bracketState,
        updated_at: nowIso
      })
      .eq('id', tournament.id);

    console.log('[tournament-battle] ✅ Express iniciado:', tournament.name,
      'humanos:', humanCount, 'CPU:', cpuCount, 'modo:', payoutMode);

    return bracketState;
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
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        tournament_type: tournament.tournament_type,
        genre_id: tournament.genre_id,
        entry_fee: tournament.entry_fee,
        prize_pool: tournament.prize_pool,
        human_participants: tournament.human_participants,
        payout_mode: tournament.payout_mode
      },
      bracket,
      currentMatch,
      currentDuelIndex: bracket?.currentDuelIndex || 0,
      totalDuels: bracket?.duels?.length || 0
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
