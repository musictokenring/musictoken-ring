/**
 * Registro unificado de batallas para estadísticas de perfil.
 */

function isCpuUserId(userId) {
  return String(userId || '').indexOf('00000000-0000-4000-8000-') === 0;
}

async function upsertBattleRow(supabase, row) {
  if (!row?.user_id || isCpuUserId(row.user_id)) {
    return { ok: true, skipped: true, isNew: false };
  }

  const { data: existing } = await supabase
    .from('player_battle_history')
    .select('id')
    .eq('user_id', row.user_id)
    .eq('battle_kind', row.battle_kind)
    .eq('source_id', row.source_id)
    .maybeSingle();

  const { error } = await supabase
    .from('player_battle_history')
    .upsert(row, { onConflict: 'user_id,battle_kind,source_id', ignoreDuplicates: false });
  if (error) {
    console.error('[player-battle-history] upsert error:', error.message, row);
    return { ok: false, error, isNew: false };
  }
  return { ok: true, isNew: !existing };
}

async function bumpUserStats(supabase, userId, won, creditsWon, wagered) {
  if (!userId || isCpuUserId(userId)) return;
  const { data: current } = await supabase
    .from('users')
    .select('total_matches, total_wins, total_losses, total_credits_won, total_wagered')
    .eq('id', userId)
    .maybeSingle();

  const updates = {
    total_matches: (current?.total_matches || 0) + 1,
    total_wins: (current?.total_wins || 0) + (won ? 1 : 0),
    total_losses: (current?.total_losses || 0) + (won ? 0 : 1),
    total_credits_won: parseFloat(current?.total_credits_won || 0) + (won ? creditsWon : 0),
    total_wagered: parseFloat(current?.total_wagered || 0) + wagered,
    updated_at: new Date().toISOString()
  };

  await supabase.from('users').update(updates).eq('id', userId);
}

async function recordMatchBattles(supabase, match, winner, creditsWon) {
  if (!match?.id || match.match_type === 'practice') return { ok: true, skipped: true };

  const p1Won = winner === 1;
  const p2Won = winner === 2;
  const mode = match.match_type || 'quick';
  const playedAt = match.finished_at || new Date().toISOString();
  const prize = parseFloat(creditsWon || 0);

  const rows = [];

  if (match.player1_id) {
    rows.push({
      user_id: match.player1_id,
      battle_kind: 'match',
      battle_mode: mode,
      source_id: match.id,
      result: p1Won ? 'win' : 'loss',
      opponent_label: 'Rival',
      song_name: match.player1_song_name || null,
      song_artist: match.player1_song_artist || null,
      credits_wagered: parseFloat(match.player1_bet || 0),
      credits_won: p1Won ? prize : 0,
      event_label: String(mode).toUpperCase(),
      played_at: playedAt
    });
  }

  if (match.player2_id) {
    rows.push({
      user_id: match.player2_id,
      battle_kind: 'match',
      battle_mode: mode,
      source_id: match.id,
      result: p2Won ? 'win' : 'loss',
      opponent_label: 'Rival',
      song_name: match.player2_song_name || null,
      song_artist: match.player2_song_artist || null,
      credits_wagered: parseFloat(match.player2_bet || 0),
      credits_won: p2Won ? prize : 0,
      event_label: String(mode).toUpperCase(),
      played_at: playedAt
    });
  }

  for (const row of rows) {
    await upsertBattleRow(supabase, row);
  }

  return { ok: true, count: rows.length };
}

async function recordTournamentBattles(supabase, tournament, bracket) {
  if (!tournament?.id || !bracket?.participants?.length) {
    return { ok: true, skipped: true };
  }

  const winnerId = bracket.winnerParticipantId;
  const prizeAwarded = parseFloat(bracket.prizeAwarded || 0);
  const entryFee = parseFloat(tournament.entry_fee || 0);
  const mode = tournament.tournament_type || 'express';
  const playedAt = tournament.updated_at || new Date().toISOString();
  const eventLabel = tournament.name || (mode === 'weekly' ? 'Grand Prix' : 'Express');

  const humans = bracket.participants.filter(function (p) {
    return p && !p.isCpu && p.userId && !isCpuUserId(p.userId);
  });

  for (const p of humans) {
    const isChampion = p.id === winnerId && bracket.winnerIsHuman;
    const row = {
      user_id: p.userId,
      battle_kind: 'tournament',
      battle_mode: mode,
      source_id: tournament.id,
      result: isChampion ? 'win' : 'loss',
      opponent_label: 'Torneo',
      song_name: p.songName || null,
      song_artist: p.songArtist || null,
      credits_wagered: entryFee,
      credits_won: isChampion ? prizeAwarded : 0,
      placement: isChampion ? 1 : 2,
      event_label: eventLabel,
      played_at: playedAt
    };

    const { ok, isNew } = await upsertBattleRow(supabase, row);
    if (ok && isNew) {
      await bumpUserStats(
        supabase,
        p.userId,
        isChampion,
        isChampion ? prizeAwarded : 0,
        entryFee
      );
    }
  }

  return { ok: true, count: humans.length };
}

module.exports = {
  recordMatchBattles,
  recordTournamentBattles,
  upsertBattleRow,
  bumpUserStats,
  isCpuUserId
};
