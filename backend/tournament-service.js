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

  async forceCloseStaleRegistration(tournamentId) {
    const nowIso = new Date().toISOString();
    const humanCount = await this.countHumanParticipants(tournamentId);
    if (humanCount >= 1) {
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

  async ensureExpressForGenre(genre, now = new Date()) {
    const nowMs = now.getTime();
    const nowIso = now.toISOString();

    const { data: staleRegs } = await this.supabase
      .from('tournaments')
      .select('id')
      .eq('tournament_type', 'express')
      .eq('genre_id', genre.id)
      .eq('status', 'registration')
      .lt('registration_closes_at', nowIso);

    for (const row of staleRegs || []) {
      await this.advanceTournamentLifecycle(row.id);
      const { data: check } = await this.supabase
        .from('tournaments')
        .select('status, registration_closes_at')
        .eq('id', row.id)
        .maybeSingle();
      const stillStale = check?.status === 'registration' &&
        new Date(check.registration_closes_at).getTime() <= nowMs;
      if (stillStale) {
        await this.forceCloseStaleRegistration(row.id);
      }
    }

    const { data: activeList } = await this.supabase
      .from('tournaments')
      .select('*')
      .eq('tournament_type', 'express')
      .eq('genre_id', genre.id)
      .in('status', ['registration', 'locked', 'in_progress'])
      .order('registration_opens_at', { ascending: false })
      .limit(1);

    if (activeList?.length) {
      const active = activeList[0];
      const closesMs = new Date(active.registration_closes_at).getTime();
      if (active.status === 'registration' && closesMs <= nowMs) {
        await this.forceCloseStaleRegistration(active.id);
      } else {
        return active;
      }
    }

    const timing = getExpressTimingForGenre(genre.id, now);
    const ts = now.getTime();
    let slotKey = timing.slotKey;
    let regOpens = timing.registrationOpensAt;
    let regCloses = timing.registrationClosesAt;

    if (ts >= timing.registrationClosesMs) {
      regOpens = now.toISOString();
      regCloses = new Date(ts + EXPRESS_REGISTRATION_MS).toISOString();
      slotKey = `express_${genre.id}_${ts}`;
    }

    const name = `Express ${genre.label}`;
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

    if (error) {
      if (String(error.message).includes('duplicate') || error.code === '23505') {
        const { data: retry } = await this.supabase
          .from('tournaments')
          .select('*')
          .eq('slot_key', slotKey)
          .maybeSingle();
        return retry;
      }
      console.error('[tournament] Error creating express:', genre.id, error.message);
      return null;
    }

    console.log('[tournament] ✅ Express creado:', name, slotKey);
    return created;
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
    const { count: cpuCount } = await this.supabase
      .from('tournament_participants')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('is_cpu', true);

    const total = humanCount + (cpuCount || 0);
    await this.supabase
      .from('tournaments')
      .update({
        current_participants: total,
        human_participants: humanCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', tournamentId);

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
      const minRequired = 1;
      if (humanCount >= minRequired) {
        await this.supabase
          .from('tournaments')
          .update({ status: 'locked', updated_at: nowIso })
          .eq('id', t.id);
        console.log('[tournament] 🔒 Torneo cerrado (listo):', t.name, humanCount);
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
    const nowIso = new Date().toISOString();
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
      const closesMs = new Date(t.registration_closes_at).getTime();
      if (closesMs <= Date.now()) {
        if (humanCount >= 1) {
          await this.supabase
            .from('tournaments')
            .update({ status: 'locked', updated_at: nowIso })
            .eq('id', t.id);
          console.log('[tournament] 🔒 Cierre inmediato:', t.name, 'humanos:', humanCount);
        } else {
          await this.supabase
            .from('tournaments')
            .update({ status: 'cancelled', updated_at: nowIso })
            .eq('id', t.id);
          return { ok: false, error: 'Torneo cancelado sin participantes', stage: 'cancelled' };
        }
      } else {
        return { ok: true, stage: 'registration', humanCount };
      }
    }

    const { data: updated } = await this.supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .maybeSingle();

    if (updated?.status === 'locked') {
      let bracket = null;
      try {
        if (updated.tournament_type === 'express') {
          bracket = await this.battleEngine.startExpressTournament(updated);
        } else if (updated.tournament_type === 'weekly') {
          bracket = await this.battleEngine.startWeeklyTournament(updated);
        }
      } catch (err) {
        console.error('[tournament] Error iniciando torneo:', tournamentId, err.message);
        return { ok: false, error: err.message, stage: 'locked' };
      }

      if (!bracket) {
        const { data: after } = await this.supabase
          .from('tournaments')
          .select('status, bracket_state')
          .eq('id', tournamentId)
          .maybeSingle();

        if (after?.status === 'cancelled') {
          return {
            ok: false,
            error: 'No se pudo completar el torneo (¿migración 016 aplicada?)',
            stage: 'cancelled'
          };
        }
        if (after?.status === 'in_progress' && after.bracket_state) {
          return { ok: true, stage: 'in_progress' };
        }

        return {
          ok: false,
          error: 'No se pudo generar el bracket. Revisa migración 016 en Supabase.',
          stage: 'locked'
        };
      }

      return { ok: true, stage: 'in_progress' };
    }

    return { ok: true, stage: updated?.status || t.status };
  }

  async joinTournament(userId, tournamentId, song) {
    const { data: tournament, error } = await this.supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .maybeSingle();

    if (error || !tournament) {
      return { ok: false, error: 'Torneo no encontrado' };
    }

    if (tournament.status !== 'registration') {
      return { ok: false, error: 'Inscripción cerrada para este torneo' };
    }

    const closesMs = new Date(tournament.registration_closes_at).getTime();
    if (closesMs <= Date.now()) {
      return { ok: false, error: 'El tiempo de inscripción ya terminó' };
    }

    const { data: existing } = await this.supabase
      .from('tournament_participants')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
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
    const deduction = await deductUnifiedBalance(this.supabase, userId, entryFee);
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
      user_id: userId,
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
      human_participants: newHumanCount,
      prize_pool: Number(tournament.prize_pool || 0) + prizeContribution,
      updated_at: new Date().toISOString()
    };
    if (newHumanCount >= tournament.max_participants) {
      updatePayload.status = 'locked';
    }

    await this.supabase
      .from('tournaments')
      .update(updatePayload)
      .eq('id', tournamentId);

    return { ok: true, tournamentId, humanCount: newHumanCount, locked: Boolean(updatePayload.status) };
  }

  async getBracketPayload(tournamentId) {
    const lifecycle = await this.advanceTournamentLifecycle(tournamentId);
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

  async getHubPayload() {
    const serverNow = new Date();
    await this.ensureAllExpressSlots();

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
    (expressRows || []).forEach((row) => {
      const enriched = enrichExpressRow(row, serverNow);
      const prev = expressByGenre[row.genre_id];
      const closesMs = new Date(row.registration_closes_at).getTime();
      const isOpenReg = row.status === 'registration' && closesMs > nowMs;
      if (!prev) {
        expressByGenre[row.genre_id] = enriched;
        return;
      }
      const prevCloses = new Date(prev.registration_closes_at).getTime();
      const prevOpen = prev.status === 'registration' && prevCloses > nowMs;
      if (isOpenReg && !prevOpen) {
        expressByGenre[row.genre_id] = enriched;
      } else if (!isOpenReg && !prevOpen && closesMs > prevCloses) {
        expressByGenre[row.genre_id] = enriched;
      } else if (isOpenReg && prevOpen && closesMs > prevCloses) {
        expressByGenre[row.genre_id] = enriched;
      }
    });

    for (const genre of TOURNAMENT_GENRES) {
      if (!expressByGenre[genre.id]) {
        const timing = getExpressTimingForGenre(genre.id, serverNow);
        expressByGenre[genre.id] = enrichExpressRow({
          id: null,
          genre_id: genre.id,
          entry_fee: EXPRESS_ENTRY_FEE,
          max_participants: EXPRESS_MAX_PLAYERS,
          current_participants: 0,
          prize_pool: 0,
          status: 'registration',
          registration_closes_at: timing.registrationClosesAt,
          name: 'Express ' + genre.label
        }, serverNow);
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
      return g.express && g.express.status === 'registration';
    }).length;

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
        secondsToBattle: globalWindow.secondsToBattle,
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

    const hub = await this.getHubPayload();
    const row = hub.genres.find((g) => g.id === genreId);
    return { genre, express: row?.express || null, weekly: row?.weekly || null, rotation: hub.expressRotation };
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
