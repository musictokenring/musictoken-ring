/**
 * Torneos Express (10 min) + Grand Prix semanal — 14 géneros.
 */
const {
  TOURNAMENT_GENRES,
  EXPRESS_MAX_PLAYERS,
  EXPRESS_ENTRY_FEE,
  EXPRESS_REGISTRATION_MS,
  WEEKLY_MAX_PLAYERS,
  WEEKLY_MIN_PLAYERS,
  WEEKLY_ENTRY_FEE,
  getGenreById,
  getExpressSlot,
  getExpressTimingForGenre,
  enrichExpressRow,
  getIsoWeekKey
} = require('./tournament-genres');
const { TournamentBattleEngine } = require('./tournament-battle');
const { deductUnifiedBalance } = require('./unified-balance');

class TournamentService {
  constructor(supabase) {
    this.supabase = supabase;
    this.battleEngine = new TournamentBattleEngine(supabase);
  }

  async ensureSchemaReady() {
    const { error } = await this.supabase.from('tournaments').select('id').limit(1);
    if (error && (error.code === '42P01' || String(error.message).includes('does not exist'))) {
      console.error('[tournament] ⚠️ Tabla tournaments no existe. Ejecuta supabase/migrations/014_tournament_system.sql');
      return false;
    }
    return true;
  }

  async tick() {
    const ready = await this.ensureSchemaReady();
    if (!ready) return;

    await this.ensureAllExpressSlots();
    await this.ensureWeeklyTournaments();
    await this.processExpiredRegistrations();
    await this.processLockedTournaments();
  }

  getExpressSlotInfo(now = new Date()) {
    return getExpressSlot(now);
  }

  expressAlwaysStartsBattle(tournament, humanCount) {
    return tournament?.tournament_type === 'express' || humanCount >= 1;
  }

  async forceCloseStaleRegistration(tournamentId) {
    const nowIso = new Date().toISOString();
    const { data: t } = await this.supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .maybeSingle();
    if (!t) return;

    const humanCount = await this.countHumanParticipants(tournamentId);
    if (this.expressAlwaysStartsBattle(t, humanCount)) {
      await this.supabase
        .from('tournaments')
        .update({ status: 'locked', updated_at: nowIso })
        .eq('id', tournamentId);
      const { data: locked } = await this.supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .maybeSingle();
      if (locked) {
        try {
          if (locked.tournament_type === 'express') {
            await this.battleEngine.startExpressTournament(locked);
          } else if (locked.tournament_type === 'weekly') {
            await this.battleEngine.startWeeklyTournament(locked);
          }
        } catch (err) {
          console.error('[tournament] forceClose start error:', tournamentId, err.message);
        }
      }
      return;
    }
    await this.supabase
      .from('tournaments')
      .update({ status: 'cancelled', updated_at: nowIso })
      .eq('id', tournamentId);
  }

  async clearStaleExpressForGenre(genreId, now = new Date()) {
    const nowMs = now.getTime();
    const nowIso = now.toISOString();
    const { data: staleRegs } = await this.supabase
      .from('tournaments')
      .select('id')
      .eq('tournament_type', 'express')
      .eq('genre_id', genreId)
      .eq('status', 'registration')
      .lt('registration_closes_at', nowIso);

    for (const row of staleRegs || []) {
      await this.forceCloseStaleRegistration(row.id);
    }

    const { data: stuckLocked } = await this.supabase
      .from('tournaments')
      .select('id')
      .eq('tournament_type', 'express')
      .eq('genre_id', genreId)
      .eq('status', 'locked');

    for (const row of stuckLocked || []) {
      const { data: locked } = await this.supabase
        .from('tournaments')
        .select('*')
        .eq('id', row.id)
        .maybeSingle();
      if (!locked) continue;
      try {
        if (locked.tournament_type === 'express') {
          await this.battleEngine.startExpressTournament(locked);
        } else {
          const humans = await this.countHumanParticipants(row.id);
          if (humans < 1) {
            await this.supabase
              .from('tournaments')
              .update({ status: 'cancelled', updated_at: nowIso })
              .eq('id', row.id);
          }
        }
      } catch (err) {
        console.error('[tournament] retry locked:', row.id, err.message);
      }
    }
  }

  async createOpenExpressNow(genre, now = new Date()) {
    const nowMs = now.getTime();
    const regOpens = now.toISOString();
    const regCloses = new Date(nowMs + EXPRESS_REGISTRATION_MS).toISOString();
    const name = `Express ${genre.label}`;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const slotKey = `express_${genre.id}_${nowMs}_${attempt}`;
      const { data: created, error } = await this.supabase
        .from('tournaments')
        .insert([{
          name,
          tournament_type: 'express',
          genre_id: genre.id,
          entry_fee: EXPRESS_ENTRY_FEE,
          prize_pool: 0,
          max_participants: EXPRESS_MAX_PLAYERS,
          min_participants: EXPRESS_MAX_PLAYERS,
          current_participants: 0,
          status: 'registration',
          slot_key: slotKey,
          registration_opens_at: regOpens,
          registration_closes_at: regCloses
        }])
        .select()
        .single();

      if (!error && created) {
        console.log('[tournament] ✅ Express abierto:', name, slotKey);
        return created;
      }

      if (String(error?.message || '').includes('duplicate') || error?.code === '23505') {
        const existing = await this.findOpenExpressForGenre(genre.id, now);
        if (existing) return existing;
      }
      console.error('[tournament] createOpenExpressNow:', genre.id, attempt, error?.message);
    }

    return null;
  }

  async openExpressForJoin(genre, now = new Date()) {
    let open = await this.findOpenExpressForGenre(genre.id, now);
    if (open) return open;

    const activeBattle = await this.findActiveExpressForGenre(genre.id);
    if (activeBattle) return activeBattle;

    await this.clearStaleExpressForGenre(genre.id, now);

    open = await this.findOpenExpressForGenre(genre.id, now);
    if (open) return open;

    const activeAfterClose = await this.findActiveExpressForGenre(genre.id);
    if (activeAfterClose) return activeAfterClose;

    open = await this.createOpenExpressNow(genre, now);
    if (open) return open;
    return this.createOpenExpressNow(genre, now);
  }

  async ensureExpressForGenre(genre, now = new Date()) {
    return this.openExpressForJoin(genre, now);
  }

  async ensureAllExpressSlots() {
    for (const genre of TOURNAMENT_GENRES) {
      await this.ensureExpressForGenre(genre);
    }
  }

  /** @deprecated use ensureAllExpressSlots */
  async ensureCurrentExpress() {
    return this.ensureAllExpressSlots();
  }

  async ensureWeeklyTournaments() {
    const weekKey = getIsoWeekKey();
    for (const genre of TOURNAMENT_GENRES) {
      const slotKey = `weekly_${genre.id}_${weekKey}`;
      const { data: existing } = await this.supabase
        .from('tournaments')
        .select('id')
        .eq('slot_key', slotKey)
        .maybeSingle();

      if (existing) continue;

      const now = new Date();
      const closes = new Date(now);
      closes.setUTCDate(closes.getUTCDate() + (7 - (closes.getUTCDay() || 7)));
      closes.setUTCHours(22, 0, 0, 0);

      const { error } = await this.supabase.from('tournaments').insert([{
        name: `Grand Prix ${genre.label}`,
        tournament_type: 'weekly',
        genre_id: genre.id,
        entry_fee: WEEKLY_ENTRY_FEE,
        prize_pool: 0,
        max_participants: WEEKLY_MAX_PLAYERS,
        min_participants: WEEKLY_MIN_PLAYERS,
        current_participants: 0,
        status: 'registration',
        slot_key: slotKey,
        week_key: weekKey,
        registration_opens_at: now.toISOString(),
        registration_closes_at: closes.toISOString()
      }]);

      if (error && !String(error.message).includes('duplicate')) {
        console.error('[tournament] Error creating weekly:', genre.id, error.message);
      }
    }
  }

  async countHumanParticipants(tournamentId) {
    const { count, error } = await this.supabase
      .from('tournament_participants')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('is_cpu', false);

    if (error) {
      console.error('[tournament] countHumanParticipants:', error.message);
      return 0;
    }
    return count || 0;
  }

  async syncTournamentParticipantCount(tournamentId) {
    const humanCount = await this.countHumanParticipants(tournamentId);
    let cpuCount = 0;
    const cpuRes = await this.supabase
      .from('tournament_participants')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('is_cpu', true);
    if (!cpuRes.error) cpuCount = cpuRes.count || 0;

    const total = humanCount + cpuCount;
    const patch = {
      current_participants: total,
      updated_at: new Date().toISOString()
    };
    if (!cpuRes.error) patch.human_participants = humanCount;

    const { error: updErr } = await this.supabase
      .from('tournaments')
      .update(patch)
      .eq('id', tournamentId);

    if (updErr) {
      console.warn('[tournament] syncParticipantCount:', tournamentId, updErr.message);
    }

    return { humanCount, total };
  }

  async processExpiredRegistrations() {
    const nowIso = new Date().toISOString();
    const { data: expired } = await this.supabase
      .from('tournaments')
      .select('*')
      .eq('status', 'registration')
      .lt('registration_closes_at', nowIso);

    if (!expired?.length) return;

    for (const t of expired) {
      const { humanCount } = await this.syncTournamentParticipantCount(t.id);
      if (this.expressAlwaysStartsBattle(t, humanCount)) {
        await this.supabase
          .from('tournaments')
          .update({ status: 'locked', updated_at: nowIso })
          .eq('id', t.id);
        console.log('[tournament] 🔒 Torneo cerrado (listo):', t.name, 'humanos:', humanCount);
        const { data: locked } = await this.supabase
          .from('tournaments')
          .select('*')
          .eq('id', t.id)
          .maybeSingle();
        if (locked) {
          try {
            if (locked.tournament_type === 'express') {
              await this.battleEngine.startExpressTournament(locked);
            } else if (locked.tournament_type === 'weekly') {
              await this.battleEngine.startWeeklyTournament(locked);
            }
          } catch (err) {
            console.error('[tournament] processExpired start:', t.id, err.message);
          }
        }
      } else {
        await this.supabase
          .from('tournaments')
          .update({ status: 'cancelled', updated_at: nowIso })
          .eq('id', t.id);
        console.log('[tournament] ❌ Torneo cancelado (pocos jugadores):', t.name);
      }
    }
  }

  async processLockedTournaments() {
    const { data: locked } = await this.supabase
      .from('tournaments')
      .select('*')
      .eq('status', 'locked');

    if (!locked?.length) return;

    for (const t of locked) {
      try {
        if (t.tournament_type === 'express') {
          await this.battleEngine.startExpressTournament(t);
        } else if (t.tournament_type === 'weekly') {
          await this.battleEngine.startWeeklyTournament(t);
        }
      } catch (err) {
        console.error('[tournament] Error iniciando torneo:', t.id, err.message);
      }
    }
  }

  /**
   * Cierra inscripción vencida e inicia bracket (no esperar al scheduler).
   */
  async advanceTournamentLifecycle(tournamentId) {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const { data: t, error } = await this.supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .maybeSingle();

    if (error || !t) {
      return { ok: false, error: 'Torneo no encontrado' };
    }

    if (t.status === 'cancelled' || t.status === 'completed') {
      return { ok: true, stage: t.status };
    }

    if (t.status === 'in_progress' && t.bracket_state) {
      return { ok: true, stage: 'in_progress' };
    }

    const { humanCount } = await this.syncTournamentParticipantCount(tournamentId);

    if (t.status === 'registration') {
      const closesMs = Date.parse(t.registration_closes_at || '');
      const expired = Number.isFinite(closesMs) && closesMs <= nowMs;

      if (!expired) {
        return { ok: true, stage: 'registration', humanCount };
      }

      if (!this.expressAlwaysStartsBattle(t, humanCount)) {
        await this.supabase
          .from('tournaments')
          .update({ status: 'cancelled', updated_at: nowIso })
          .eq('id', t.id);
        return { ok: false, error: 'Torneo cancelado sin participantes', stage: 'cancelled' };
      }

      const { data: lockedRows, error: lockErr } = await this.supabase
        .from('tournaments')
        .update({ status: 'locked', updated_at: nowIso })
        .eq('id', t.id)
        .eq('status', 'registration')
        .select('*');

      if (lockErr) {
        console.error('[tournament] lock failed:', t.id, lockErr.message);
        if (String(lockErr.message || '').indexOf('tournaments_status_check') !== -1) {
          console.warn('[tournament] bypass DB lock → inicia batalla directa');
          return this.startLockedTournament(Object.assign({}, t, { status: 'locked' }));
        }
        return {
          ok: false,
          error: 'No se pudo cerrar inscripción. Ejecuta migración 017_tournament_status_check.sql en Supabase.',
          stage: 'registration'
        };
      }

      const locked = lockedRows?.[0] || null;
      if (!locked) {
        const { data: refetch } = await this.supabase
          .from('tournaments')
          .select('*')
          .eq('id', tournamentId)
          .maybeSingle();
        if (refetch && refetch.status !== 'registration') {
          t.status = refetch.status;
        } else {
          console.error('[tournament] lock no rows:', t.id, 'closes', t.registration_closes_at);
          return {
            ok: false,
            error: 'Inscripción vencida pero el torneo no pudo cerrarse. Reintenta en unos segundos.',
            stage: 'registration'
          };
        }
      } else {
        console.log('[tournament] 🔒 Cierre inmediato:', locked.name, 'humanos:', humanCount);
        return this.startLockedTournament(locked);
      }
    }

    const { data: updated } = await this.supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .maybeSingle();

    if (updated?.status === 'locked') {
      return this.startLockedTournament(updated);
    }

    return { ok: true, stage: updated?.status || t.status };
  }

  async startLockedTournament(locked) {
    let bracket = null;
    let startError = null;
    try {
      if (locked.tournament_type === 'express') {
        bracket = await this.battleEngine.startExpressTournament(locked);
      } else if (locked.tournament_type === 'weekly') {
        bracket = await this.battleEngine.startWeeklyTournament(locked);
      }
    } catch (err) {
      startError = err;
      console.error('[tournament] Error iniciando torneo:', locked.id, err.message);
      return { ok: false, error: err.message, stage: 'locked' };
    }

    if (!bracket) {
      const { data: after } = await this.supabase
        .from('tournaments')
        .select('status, bracket_state')
        .eq('id', locked.id)
        .maybeSingle();

      if (after?.status === 'cancelled') {
        return {
          ok: false,
          error: startError?.message ||
            'No se pudo completar el torneo. ¿Migración 016 aplicada en Supabase?',
          stage: 'cancelled'
        };
      }
      if (after?.status === 'in_progress' && after.bracket_state) {
        return { ok: true, stage: 'in_progress' };
      }

      return {
        ok: false,
        error: 'No se pudo generar el bracket. Aplica migración 016 en Supabase (is_cpu, bracket_state).',
        stage: 'locked'
      };
    }

    return { ok: true, stage: 'in_progress' };
  }

  async resolveJoinableTournament(tournament) {
    if (!tournament) return null;
    const nowMs = Date.now();
    const closesMs = new Date(tournament.registration_closes_at).getTime();
    if (tournament.status === 'registration' && closesMs > nowMs) {
      return tournament;
    }

    if (tournament.tournament_type !== 'express' || !tournament.genre_id) {
      return null;
    }

    const genre = getGenreById(tournament.genre_id);
    if (!genre) return null;

    let fresh = await this.ensureExpressForGenre(genre);
    if (fresh?.status === 'registration') {
      const freshCloses = new Date(fresh.registration_closes_at).getTime();
      if (freshCloses > nowMs) return fresh;
    }

    fresh = await this.createOpenExpressNow(genre);
    if (fresh?.status === 'registration') {
      const freshCloses = new Date(fresh.registration_closes_at).getTime();
      if (freshCloses > nowMs) return fresh;
    }

    return null;
  }

  async joinTournament(creditsUserId, tournamentId, song, participantUserId, options = {}) {
    const debitUserId = creditsUserId;
    const playerUserId = participantUserId || creditsUserId;
    const originalTournamentId = tournamentId;
    let tournamentRow = null;

    if (options.genreId) {
      const genre = getGenreById(options.genreId);
      if (genre) {
        tournamentRow = await this.openExpressForJoin(genre);
        if (tournamentRow?.id) tournamentId = tournamentRow.id;
      }
    }

    if (!tournamentRow && tournamentId) {
      const { data, error } = await this.supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .maybeSingle();
      if (!error && data) tournamentRow = data;
    }

    if (!tournamentRow) {
      return { ok: false, error: 'Torneo no encontrado' };
    }

    let tournament = tournamentRow;
    if (tournamentRow.tournament_type === 'express') {
      const genre = getGenreById(tournamentRow.genre_id || options.genreId);
      if (genre) {
        tournament = await this.openExpressForJoin(genre) || tournamentRow;
      } else {
        tournament = await this.resolveJoinableTournament(tournamentRow);
      }
    } else {
      const closesMs = new Date(tournamentRow.registration_closes_at).getTime();
      if (tournamentRow.status !== 'registration' || closesMs <= Date.now()) {
        return { ok: false, error: 'Inscripción cerrada para este torneo' };
      }
      tournament = tournamentRow;
    }

    if (!tournament || !tournament.id) {
      return {
        ok: false,
        error: 'Express no disponible temporalmente. Espera 10 s y pulsa de nuevo.'
      };
    }

    tournamentId = tournament.id;

    const { data: existing } = await this.supabase
      .from('tournament_participants')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('user_id', playerUserId)
      .eq('is_cpu', false)
      .maybeSingle();

    if (existing) {
      return { ok: true, alreadyJoined: true, tournamentId };
    }

    const humanCount = await this.countHumanParticipants(tournamentId);
    if (humanCount >= tournament.max_participants) {
      return { ok: false, error: 'Torneo lleno' };
    }

    const entryFee = Number(tournament.entry_fee) || 3;
    const deduction = await deductUnifiedBalance(this.supabase, debitUserId, entryFee);
    if (!deduction.ok) {
      return {
        ok: false,
        error: 'Saldo insuficiente para la inscripción (' + entryFee + ' cr). Saldo detectado: ' +
          (deduction.total != null ? Number(deduction.total).toFixed(2) : '0') + ' cr',
        total_balance: deduction.total,
        credits_balance: deduction.creditsBal,
        fiat_balance: deduction.fiat,
        onchain_balance: deduction.onchain
      };
    }

    const participantRow = {
      tournament_id: tournamentId,
      user_id: playerUserId,
      is_cpu: false
    };
    if (song) {
      participantRow.song_id = String(song.id || '');
      participantRow.song_name = song.name || '';
      participantRow.song_artist = song.artist || '';
      participantRow.song_image = song.image || '';
      participantRow.song_preview = song.preview || '';
    }

    const { error: insertError } = await this.supabase
      .from('tournament_participants')
      .insert([participantRow]);

    if (insertError) {
      console.error('[tournament] join insert error:', insertError.message);
      return { ok: false, error: insertError.message };
    }

    const newHumanCount = humanCount + 1;
    const platformRate = 0.08;
    const prizeContribution = entryFee * (1 - platformRate);
    const updatePayload = {
      current_participants: newHumanCount,
      prize_pool: Number(tournament.prize_pool || 0) + prizeContribution,
      updated_at: new Date().toISOString()
    };
    updatePayload.human_participants = newHumanCount;
    if (newHumanCount >= tournament.max_participants) {
      updatePayload.status = 'locked';
    }

    await this.supabase
      .from('tournaments')
      .update(updatePayload)
      .eq('id', tournamentId);

    return {
      ok: true,
      tournamentId,
      humanCount: newHumanCount,
      locked: Boolean(updatePayload.status),
      rolledToNewSlot: tournamentId !== originalTournamentId,
      registrationClosesAt: tournament.registration_closes_at
    };
  }

  async getBracketPayload(tournamentId, options = {}) {
    let lifecycle = null;
    if (!options.readOnly) {
      lifecycle = await this.advanceTournamentLifecycle(tournamentId);
    }
    const payload = await this.battleEngine.getBracketPayload(tournamentId);
    if (lifecycle && !lifecycle.ok) {
      payload.lifecycleError = lifecycle.error;
      payload.lifecycleStage = lifecycle.stage;
    } else if (lifecycle?.stage) {
      payload.lifecycleStage = lifecycle.stage;
    }
    return payload;
  }

  async advanceTournamentPlayback(tournamentId, duelIndex) {
    return this.battleEngine.advancePlayback(tournamentId, duelIndex);
  }

  /** Cierra inscripciones vencidas y garantiza un Express abierto por género. */
  async syncExpressHubSlots(now = new Date()) {
    await this.processExpiredRegistrations();
    await this.ensureAllExpressSlots();
    return now;
  }

  async findOpenExpressForGenre(genreId, serverNow = new Date()) {
    const nowIso = serverNow.toISOString();
    const { data } = await this.supabase
      .from('tournaments')
      .select('id, genre_id, entry_fee, prize_pool, max_participants, current_participants, status, registration_opens_at, registration_closes_at, name, slot_key')
      .eq('tournament_type', 'express')
      .eq('genre_id', genreId)
      .eq('status', 'registration')
      .gt('registration_closes_at', nowIso)
      .order('registration_closes_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  }

  /** Express en locked/in_progress: no crear slot nuevo encima de una batalla. */
  async findActiveExpressForGenre(genreId) {
    const { data } = await this.supabase
      .from('tournaments')
      .select('id, genre_id, entry_fee, prize_pool, max_participants, current_participants, status, registration_opens_at, registration_closes_at, name, slot_key, updated_at')
      .eq('tournament_type', 'express')
      .eq('genre_id', genreId)
      .in('status', ['locked', 'in_progress'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  }

  async ensureExpressForGenrePublic(genreId) {
    const genre = getGenreById(genreId);
    if (!genre) {
      return { ok: false, error: 'Género no encontrado' };
    }
    const serverNow = new Date();
    const open = await this.findOpenExpressForGenre(genreId, serverNow);
    if (open) {
      return {
        ok: true,
        express: enrichExpressRow(open, serverNow)
      };
    }
    const active = await this.findActiveExpressForGenre(genreId);
    if (active) {
      return {
        ok: true,
        express: enrichExpressRow(active, serverNow)
      };
    }
    const row = await this.openExpressForJoin(genre, serverNow);
    if (!row) {
      return { ok: false, error: 'No se pudo crear el Express (revisa Supabase)' };
    }
    return {
      ok: true,
      express: enrichExpressRow(row, serverNow)
    };
  }

  buildTimingExpressPlaceholder(genre, serverNow = new Date()) {
    const timing = getExpressTimingForGenre(genre.id, serverNow);
    const ts = serverNow.getTime();
    let regOpens = timing.registrationOpensAt;
    let regCloses = timing.registrationClosesAt;
    if (ts >= timing.registrationClosesMs) {
      regOpens = serverNow.toISOString();
      regCloses = new Date(ts + EXPRESS_REGISTRATION_MS).toISOString();
    }
    return enrichExpressRow({
      id: null,
      genre_id: genre.id,
      entry_fee: EXPRESS_ENTRY_FEE,
      max_participants: EXPRESS_MAX_PLAYERS,
      current_participants: 0,
      prize_pool: 0,
      status: 'registration',
      registration_opens_at: regOpens,
      registration_closes_at: regCloses,
      name: 'Express ' + genre.label
    }, serverNow);
  }

  async getHubPayload(options = {}) {
    const syncSlots = Boolean(options.syncSlots);
    const serverNow = new Date();
    if (syncSlots) {
      await this.syncExpressHubSlots(serverNow);
    }

    const weekKey = getIsoWeekKey();
    const globalWindow = getExpressSlot(serverNow);

    const { data: expressRows } = await this.supabase
      .from('tournaments')
      .select('id, genre_id, entry_fee, prize_pool, max_participants, current_participants, status, registration_opens_at, registration_closes_at, name, slot_key')
      .eq('tournament_type', 'express')
      .in('status', ['registration', 'locked', 'in_progress']);

    const { data: weeklyRows } = await this.supabase
      .from('tournaments')
      .select('id, genre_id, entry_fee, prize_pool, max_participants, current_participants, status, registration_closes_at, name, week_key')
      .eq('tournament_type', 'weekly')
      .eq('week_key', weekKey)
      .in('status', ['registration', 'locked', 'in_progress']);

    const expressByGenre = {};
    const nowMs = serverNow.getTime();

    const pickExpressRow = (prev, row, enriched) => {
      const closesMs = new Date(row.registration_closes_at).getTime();
      const isOpenReg = row.status === 'registration' && closesMs > nowMs;
      if (row.status === 'registration' && closesMs <= nowMs) {
        return prev;
      }
      if (!prev) return enriched;
      const prevCloses = new Date(prev.registration_closes_at).getTime();
      const prevOpen = prev.status === 'registration' && prevCloses > nowMs;
      if (isOpenReg && !prevOpen) return enriched;
      if (isOpenReg && prevOpen && closesMs > prevCloses) return enriched;
      if (!isOpenReg && prevOpen) return prev;
      if (row.status === 'locked' || row.status === 'in_progress') {
        if (!prevOpen && (prev.status !== 'locked' && prev.status !== 'in_progress')) {
          return enriched;
        }
        if (prev.status === 'registration') return enriched;
      }
      return prev;
    };

    (expressRows || []).forEach((row) => {
      const enriched = enrichExpressRow(row, serverNow);
      expressByGenre[row.genre_id] = pickExpressRow(expressByGenre[row.genre_id], row, enriched);
    });

    for (const genre of TOURNAMENT_GENRES) {
      const current = expressByGenre[genre.id];
      const closesMs = current?.registration_closes_at
        ? new Date(current.registration_closes_at).getTime()
        : 0;
      const needsFreshSlot =
        !current ||
        (current.status === 'registration' && closesMs <= nowMs);

      if (needsFreshSlot) {
        if (syncSlots) {
          const row = await this.ensureExpressForGenre(genre, serverNow);
          if (row) {
            expressByGenre[genre.id] = enrichExpressRow(row, serverNow);
          }
        } else {
          const openRow = await this.findOpenExpressForGenre(genre.id, serverNow);
          if (openRow) {
            expressByGenre[genre.id] = enrichExpressRow(openRow, serverNow);
          } else {
            expressByGenre[genre.id] = this.buildTimingExpressPlaceholder(genre, serverNow);
          }
        }
      }
    }

    const weeklyByGenre = {};
    (weeklyRows || []).forEach((row) => {
      weeklyByGenre[row.genre_id] = row;
    });

    const genres = TOURNAMENT_GENRES.map((g) => ({
      ...g,
      express: expressByGenre[g.id] || null,
      weekly: weeklyByGenre[g.id] || null
    }));

    const activeRegistration = genres.filter(function (g) {
      if (!g.express || g.express.status !== 'registration') return false;
      const closes = new Date(g.express.registration_closes_at).getTime();
      return closes > nowMs;
    }).length;

    let hubSecondsToBattle = globalWindow.secondsToBattle;
    genres.forEach(function (g) {
      const s = g.express?.secondsToBattle;
      if (g.express?.status === 'registration' && Number.isFinite(s) && s > 0) {
        hubSecondsToBattle = hubSecondsToBattle > 0
          ? Math.min(hubSecondsToBattle, s)
          : s;
      }
    });
    if (!hubSecondsToBattle || hubSecondsToBattle <= 0) {
      let fallback = EXPRESS_REGISTRATION_MS / 1000;
      TOURNAMENT_GENRES.forEach(function (g) {
        const t = getExpressTimingForGenre(g.id, serverNow);
        if (t.secondsToClose > 0) {
          fallback = Math.min(fallback, t.secondsToClose);
        } else if (t.inRegistrationWindow && t.secondsToClose > 0) {
          fallback = Math.min(fallback, t.secondsToClose);
        }
      });
      hubSecondsToBattle = fallback;
    }

    return {
      ok: true,
      serverTime: serverNow.toISOString(),
      config: {
        expressIntervalMinutes: 10,
        expressRegistrationMinutes: EXPRESS_REGISTRATION_MS / 60000,
        expressEntryFee: EXPRESS_ENTRY_FEE,
        expressMaxPlayers: EXPRESS_MAX_PLAYERS,
        weeklyEntryFee: WEEKLY_ENTRY_FEE,
        weeklyMaxPlayers: WEEKLY_MAX_PLAYERS,
        activeExpressCount: activeRegistration
      },
      expressRotation: {
        allGenresActive: true,
        activeExpressCount: activeRegistration,
        totalGenres: TOURNAMENT_GENRES.length,
        secondsToBattle: hubSecondsToBattle,
        secondsToNextSlot: globalWindow.secondsToNextSlot,
        battleStartsAt: globalWindow.battleStartsAt,
        registrationClosesAt: globalWindow.registrationClosesAt
      },
      genres,
      weekKey
    };
  }

  async getGenreDetail(genreId) {
    const genre = getGenreById(genreId);
    if (!genre) return null;

    const serverNow = new Date();
    let expressRow = await this.findOpenExpressForGenre(genreId, serverNow);
    if (!expressRow) {
      expressRow = await this.ensureExpressForGenre(genre, serverNow);
    }
    const express = expressRow ? enrichExpressRow(expressRow, serverNow) : null;

    const weekKey = getIsoWeekKey(serverNow);
    const { data: weeklyRow } = await this.supabase
      .from('tournaments')
      .select('id, genre_id, entry_fee, prize_pool, max_participants, current_participants, status, registration_closes_at, name, week_key')
      .eq('tournament_type', 'weekly')
      .eq('genre_id', genreId)
      .eq('week_key', weekKey)
      .in('status', ['registration', 'locked', 'in_progress'])
      .order('registration_opens_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      genre,
      express,
      weekly: weeklyRow || null,
      rotation: getExpressSlot(serverNow)
    };
  }

  async getTournamentById(id) {
    const { data, error } = await this.supabase
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async isUserRegistered(tournamentId, userId) {
    const { data } = await this.supabase
      .from('tournament_participants')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .maybeSingle();
    return Boolean(data);
  }
}

module.exports = { TournamentService };
