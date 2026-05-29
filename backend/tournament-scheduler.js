/**
 * Scheduler: Express cada 10 min + cierre de inscripciones.
 */
const { TournamentService } = require('./tournament-service');

function startTournamentScheduler(supabase) {
  const service = new TournamentService(supabase);
  let running = false;

  async function runTick() {
    if (running) return;
    running = true;
    try {
      await service.tick();
    } catch (err) {
      console.error('[tournament-scheduler] tick error:', err.message);
    } finally {
      running = false;
    }
  }

  runTick();
  const intervalId = setInterval(runTick, 10 * 1000);
  console.log('[tournament-scheduler] ✅ Started (10s tick, Express en 14 géneros)');

  return { service, intervalId, runTick };
}

module.exports = { startTournamentScheduler };
