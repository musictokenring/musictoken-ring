/**
 * 14 géneros oficiales — Express (cada 10 min) + Grand Prix semanal.
 */
const TOURNAMENT_GENRES = [
  { id: 'reggaeton', label: 'Reggaeton', region: 'latino', emoji: '🎤', deezerQuery: 'reggaeton' },
  { id: 'pop_en', label: 'Pop en inglés', region: 'anglo', emoji: '🎵', deezerQuery: 'pop english' },
  { id: 'salsa', label: 'Salsa', region: 'latino', emoji: '💃', deezerQuery: 'salsa' },
  { id: 'rock_en', label: 'Rock en inglés', region: 'anglo', emoji: '🎸', deezerQuery: 'rock english' },
  { id: 'cumbia', label: 'Cumbia', region: 'latino', emoji: '🪗', deezerQuery: 'cumbia' },
  { id: 'hip_hop_en', label: 'Hip hop / R&B (EN)', region: 'anglo', emoji: '🎧', deezerQuery: 'hip hop english' },
  { id: 'vallenato', label: 'Vallenato', region: 'latino', emoji: '🎹', deezerQuery: 'vallenato' },
  { id: 'pop_latino', label: 'Pop latino', region: 'latino', emoji: '⭐', deezerQuery: 'pop latino' },
  { id: 'rock_es', label: 'Rock en español', region: 'latino', emoji: '🎸', deezerQuery: 'rock en español' },
  { id: 'electronic_en', label: 'Electrónica / EDM (EN)', region: 'anglo', emoji: '⚡', deezerQuery: 'edm electronic english' },
  { id: 'bachata', label: 'Bachata', region: 'latino', emoji: '❤️', deezerQuery: 'bachata' },
  { id: 'trap_latino', label: 'Trap latino', region: 'latino', emoji: '🔥', deezerQuery: 'trap latino' },
  { id: 'merengue', label: 'Merengue', region: 'latino', emoji: '🥁', deezerQuery: 'merengue' },
  { id: 'regional', label: 'Regional / Corridos', region: 'latino', emoji: '🤠', deezerQuery: 'corridos regional mexican' }
];

const EXPRESS_SLOT_MS = 10 * 60 * 1000;
const EXPRESS_REGISTRATION_MS = 5 * 60 * 1000;
const EXPRESS_MAX_PLAYERS = 4;
const EXPRESS_ENTRY_FEE = 3;
const WEEKLY_MAX_PLAYERS = 16;
const WEEKLY_MIN_PLAYERS = 8;
const WEEKLY_ENTRY_FEE = 15;

function getGenreById(id) {
  return TOURNAMENT_GENRES.find((g) => g.id === id) || null;
}

/** Slot Express alineado a reloj UTC, rotación de 14 géneros cada 10 min. */
function getExpressSlot(now = new Date()) {
  const ts = now.getTime();
  const slotStartMs = Math.floor(ts / EXPRESS_SLOT_MS) * EXPRESS_SLOT_MS;
  const slotIndex = Math.floor(slotStartMs / EXPRESS_SLOT_MS);
  const genre = TOURNAMENT_GENRES[slotIndex % TOURNAMENT_GENRES.length];
  const registrationClosesMs = slotStartMs + EXPRESS_REGISTRATION_MS;
  const slotKey = `express_${genre.id}_${slotStartMs}`;

  return {
    slotStartMs,
    slotIndex,
    genre,
    slotKey,
    registrationOpensAt: new Date(slotStartMs).toISOString(),
    registrationClosesAt: new Date(registrationClosesMs).toISOString(),
    nextSlotStartMs: slotStartMs + EXPRESS_SLOT_MS,
    secondsToClose: Math.max(0, Math.floor((registrationClosesMs - ts) / 1000)),
    secondsToNextSlot: Math.max(0, Math.floor((slotStartMs + EXPRESS_SLOT_MS - ts) / 1000))
  };
}

function getIsoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

module.exports = {
  TOURNAMENT_GENRES,
  EXPRESS_SLOT_MS,
  EXPRESS_REGISTRATION_MS,
  EXPRESS_MAX_PLAYERS,
  EXPRESS_ENTRY_FEE,
  WEEKLY_MAX_PLAYERS,
  WEEKLY_MIN_PLAYERS,
  WEEKLY_ENTRY_FEE,
  getGenreById,
  getExpressSlot,
  getIsoWeekKey
};
