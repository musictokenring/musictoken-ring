-- ============================================================
-- ABANDONO EN BATALLAS VERIFICADAS ("Reproducciones de Fan")
-- ============================================================
-- Correr ANTES de publicar el backend nuevo (el endpoint fanplay-seed
-- ya lee y escribe estas columnas).
--
-- fanplay_seed_issued_at: cuándo arrancó la batalla (se emite la
--   semilla). Desde ahí cada lado tiene 4 minutos para mandar sus toques.
-- fanplay_timeout_resolution: cómo se cerró si alguien no terminó --
--   'forfeit' (ganó el único que jugó) o 'refund_both' (nadie jugó, se
--   devolvieron las apuestas). NULL = batalla normal.

alter table matches add column if not exists fanplay_seed_issued_at timestamptz;
alter table matches add column if not exists fanplay_timeout_resolution text;

create index if not exists idx_matches_fanplay_pending
    on matches (fanplay_seed_issued_at)
    where fanplay_seed_issued_at is not null and status not in ('finished', 'cancelled');

-- Igual que las columnas de fan-plays-verification.sql: solo las escribe
-- el backend (service role). Nada de RLS nuevo.


-- ============================================================
-- DIAGNÓSTICO (solo lectura): batallas verificadas que YA quedaron
-- trabadas antes de este cambio. El barrido nuevo NO las toca (no tienen
-- fanplay_seed_issued_at) -- revisarlas a mano.
-- ============================================================
-- a) Sin cerrar: alguien nunca mandó sus toques.
select id, match_type, stake_type, status, created_at,
       player1_id, player1_bet, player1_fanplay_score,
       player2_id, player2_bet, player2_fanplay_score, total_pot
from matches
where fanplay_seed is not null
  and fanplay_seed_issued_at is null
  and status not in ('finished', 'cancelled')
order by created_at desc;

-- b) Cerradas pero nunca pagadas (los dos se fueron antes de cobrar).
--    Desde 2026-09-14 todo pago de award-winner marca award_processed,
--    así que acá false = el ganador no cobró.
select id, match_type, stake_type, winner, finished_at,
       player1_id, player2_id, total_pot
from matches
where fanplay_seed is not null
  and fanplay_seed_issued_at is null
  and status = 'finished'
  and award_processed = false
order by finished_at desc;
