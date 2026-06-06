-- Historial unificado de batallas (matches PvP + torneos) para perfiles de jugador

CREATE TABLE IF NOT EXISTS public.player_battle_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  battle_kind TEXT NOT NULL CHECK (battle_kind IN ('match', 'tournament')),
  battle_mode TEXT NOT NULL,
  source_id UUID NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('win', 'loss')),
  opponent_label TEXT,
  song_name TEXT,
  song_artist TEXT,
  credits_wagered DECIMAL(20, 4) DEFAULT 0 NOT NULL,
  credits_won DECIMAL(20, 4) DEFAULT 0 NOT NULL,
  placement INTEGER,
  event_label TEXT,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT player_battle_history_unique_event UNIQUE (user_id, battle_kind, source_id)
);

CREATE INDEX IF NOT EXISTS idx_player_battle_history_user_played
  ON public.player_battle_history(user_id, played_at DESC);

CREATE INDEX IF NOT EXISTS idx_player_battle_history_user_result
  ON public.player_battle_history(user_id, result);

COMMENT ON TABLE public.player_battle_history IS
  'Registro cronológico de enfrentamientos por jugador (PvP y torneos)';

ALTER TABLE public.player_battle_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own battle history" ON public.player_battle_history;
CREATE POLICY "Users read own battle history" ON public.player_battle_history
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own battle history" ON public.player_battle_history;
CREATE POLICY "Users insert own battle history" ON public.player_battle_history
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access battle history" ON public.player_battle_history;
CREATE POLICY "Service role full access battle history" ON public.player_battle_history
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Backfill: partidas PvP finalizadas (excluye práctica)
INSERT INTO public.player_battle_history (
  user_id, battle_kind, battle_mode, source_id, result,
  opponent_label, song_name, credits_wagered, credits_won, event_label, played_at
)
SELECT
  m.player1_id,
  'match',
  COALESCE(m.match_type, 'quick'),
  m.id,
  CASE WHEN m.winner = 1 THEN 'win' ELSE 'loss' END,
  'Rival',
  NULL,
  COALESCE(m.player1_bet, 0),
  CASE WHEN m.winner = 1 THEN COALESCE(mw.credits_won, 0) ELSE 0 END,
  UPPER(COALESCE(m.match_type, 'quick')),
  COALESCE(m.finished_at, NOW())
FROM public.matches m
LEFT JOIN public.match_wins mw ON mw.match_id = m.id AND mw.user_id = m.player1_id
WHERE m.status = 'finished'
  AND COALESCE(m.match_type, '') <> 'practice'
  AND m.player1_id IS NOT NULL
ON CONFLICT (user_id, battle_kind, source_id) DO NOTHING;

INSERT INTO public.player_battle_history (
  user_id, battle_kind, battle_mode, source_id, result,
  opponent_label, song_name, credits_wagered, credits_won, event_label, played_at
)
SELECT
  m.player2_id,
  'match',
  COALESCE(m.match_type, 'quick'),
  m.id,
  CASE WHEN m.winner = 2 THEN 'win' ELSE 'loss' END,
  'Rival',
  NULL,
  COALESCE(m.player2_bet, 0),
  CASE WHEN m.winner = 2 THEN COALESCE(mw.credits_won, 0) ELSE 0 END,
  UPPER(COALESCE(m.match_type, 'quick')),
  COALESCE(m.finished_at, NOW())
FROM public.matches m
LEFT JOIN public.match_wins mw ON mw.match_id = m.id AND mw.user_id = m.player2_id
WHERE m.status = 'finished'
  AND COALESCE(m.match_type, '') <> 'practice'
  AND m.player2_id IS NOT NULL
ON CONFLICT (user_id, battle_kind, source_id) DO NOTHING;

-- Backfill: torneos completados (un registro por humano inscrito)
INSERT INTO public.player_battle_history (
  user_id, battle_kind, battle_mode, source_id, result,
  opponent_label, song_name, song_artist, credits_wagered, credits_won,
  placement, event_label, played_at
)
SELECT
  tp.user_id,
  'tournament',
  COALESCE(t.tournament_type, 'express'),
  t.id,
  CASE WHEN COALESCE(tp.placement, 2) = 1 THEN 'win' ELSE 'loss' END,
  'Torneo',
  tp.song_name,
  tp.song_artist,
  COALESCE(t.entry_fee, 0),
  CASE
    WHEN COALESCE(tp.placement, 2) = 1
    THEN COALESCE((t.bracket_state->>'prizeAwarded')::decimal, 0)
    ELSE 0
  END,
  COALESCE(tp.placement, 2),
  COALESCE(t.name, 'Torneo'),
  COALESCE(t.updated_at, NOW())
FROM public.tournaments t
JOIN public.tournament_participants tp ON tp.tournament_id = t.id
WHERE t.status = 'completed'
  AND COALESCE(tp.is_cpu, false) = false
  AND tp.user_id IS NOT NULL
  AND tp.user_id::text NOT LIKE '00000000-0000-4000-8000-%'
ON CONFLICT (user_id, battle_kind, source_id) DO NOTHING;
