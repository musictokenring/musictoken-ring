-- Los participantes CPU de torneos no son usuarios reales de la app.
-- Producción tenía FK user_id → users(id) y fallaba: tournament_participants_user_id_fkey

ALTER TABLE tournament_participants
  DROP CONSTRAINT IF EXISTS tournament_participants_user_id_fkey;
