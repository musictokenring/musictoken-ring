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

  async ensureExpressForGenre(genre, now = new Date()) {
    const { data: activeList } = await this.supabase
      .from('tournaments')
      .select('*')
      .eq('tournament_type', 'express')
      .eq('genre_id', genre.id)
      .in('status', ['registration', 'locked', 'in_progress'])
      .order('registration_opens_at', { ascending: false })
      .limit(1);

    if (activeList?.length) return activeList[0];

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

  async processExpiredRegistrations() {
    const nowIso = new Date().toISOString();
    const { data: expired } = await this.supabase
      .from('tournaments')
      .select('*')
      .eq('status', 'registration')
      .lt('registration_closes_at', nowIso);

    if (!expired?.length) return;

    for (const t of expired) {
      const minRequired = 1;
      if (t.current_participants >= minRequired) {
        await this.supabase
          .from('tournaments')
          .update({ status: 'locked', updated_at: nowIso })
          .eq('id', t.id);
        console.log('[tournament] 🔒 Torneo cerrado (listo):', t.name, t.current_participants);
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

  async getBracketPayload(tournamentId) {
    return this.battleEngine.getBracketPayload(tournamentId);
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
    (expressRows || []).forEach((row) => {
      const enriched = enrichExpressRow(row, serverNow);
      const prev = expressByGenre[row.genre_id];
      if (!prev || enriched.status === 'registration') {
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
