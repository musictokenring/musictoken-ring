-- ============================================================
-- SISTEMA DE CRÉDITOS DE PRUEBA (BONOS) -- 2026-09-05
-- ============================================================
-- Diseño (ver conversación): dos billeteras separadas por usuario,
-- NUNCA mezcladas. `credits` sigue siendo la real/retirable de
-- siempre; `bonus_credits` es nueva, vence, y NO es retirable en
-- ningún punto del camino -- ni como saldo propio ni como premio
-- ganado con ella.
--
-- Lección de hoy aplicada desde el día uno: las funciones nuevas
-- se crean YA bloqueadas para `anon`/`authenticated`/`PUBLIC`, solo
-- ejecutables por `service_role` (o sea, solo desde el backend).
-- La tabla nueva se crea con RLS activado y CERO políticas para
-- roles públicos -- mismo criterio.
-- ============================================================


-- ============================================================
-- 1. COLUMNAS NUEVAS EN user_credits
-- ============================================================
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS bonus_credits NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS bonus_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN user_credits.bonus_credits IS 'Créditos de prueba: no retirables, solo para probar la plataforma. Vencen en bonus_expires_at.';
COMMENT ON COLUMN user_credits.bonus_expires_at IS 'Fecha de vencimiento del saldo de bonus_credits. Se revisa al momento de gastar, no hay cron.';


-- ============================================================
-- 2. TABLA DE AUDITORÍA: cada bono otorgado queda registrado
--    (quién, cuánto, por qué, cuándo vence) -- esto es lo que
--    alimenta la pestaña "Bonos" del panel admin.
-- ============================================================
CREATE TABLE IF NOT EXISTS bonus_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    bonus_type TEXT NOT NULL DEFAULT 'platform_trial'
        CHECK (bonus_type IN ('platform_trial', 'social_challenge_invite')),
    granted_by TEXT, -- email del admin que lo otorgó, o 'system_auto' si fue un auto-otorgamiento a un invitado
    note TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_grants_user_id ON bonus_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_bonus_grants_created_at ON bonus_grants(created_at DESC);

-- RLS activado, CERO políticas para anon/authenticated -- solo
-- service_role (backend) puede tocar esta tabla, siempre.
ALTER TABLE bonus_grants ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE bonus_grants IS 'Auditoría de cada bono de prueba otorgado (manual por admin, o automático al aceptar un Reto Social de prueba). Solo accesible por el backend.';


-- ============================================================
-- 3. stake_type EN social_challenges Y matches
--    'real' = de siempre (retirable). 'bonus' = de prueba (nunca
--    retirable, apostado y pagado enteramente en bonus_credits).
--    Un match/desafío 'bonus' JAMÁS puede tocar `credits` real.
-- ============================================================
ALTER TABLE social_challenges ADD COLUMN IF NOT EXISTS stake_type TEXT NOT NULL DEFAULT 'real'
    CHECK (stake_type IN ('real', 'bonus'));
ALTER TABLE matches ADD COLUMN IF NOT EXISTS stake_type TEXT NOT NULL DEFAULT 'real'
    CHECK (stake_type IN ('real', 'bonus'));

COMMENT ON COLUMN social_challenges.stake_type IS '''bonus'' = desafío de prueba, la apuesta e invitación salen de bonus_credits, nunca de créditos reales.';
COMMENT ON COLUMN matches.stake_type IS '''bonus'' = partida de prueba; el premio se paga en bonus_credits, nunca en credits real.';


-- ============================================================
-- 4. FUNCIONES -- creadas ya bloqueadas para el público desde el
--    día uno (REVOKE explícito antes que nadie las use).
-- ============================================================

-- Otorga (o suma) bonus_credits. Si ya tenía un vencimiento activo,
-- se queda con el que sea MÁS LEJANO (no acorta un bono existente).
CREATE OR REPLACE FUNCTION increment_bonus_credits(
    user_id_param UUID,
    credits_to_add NUMERIC,
    new_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO user_credits (user_id, credits, bonus_credits, bonus_expires_at)
    VALUES (user_id_param, 0, credits_to_add, new_expires_at)
    ON CONFLICT (user_id) DO UPDATE
    SET bonus_credits = user_credits.bonus_credits + credits_to_add,
        bonus_expires_at = GREATEST(
            COALESCE(user_credits.bonus_expires_at, 'epoch'::timestamptz),
            new_expires_at
        ),
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION increment_bonus_credits(UUID, NUMERIC, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_bonus_credits(UUID, NUMERIC, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_bonus_credits(UUID, NUMERIC, TIMESTAMPTZ) TO service_role;


-- Descuenta bonus_credits. Devuelve FALSE (sin tocar nada) si el
-- saldo está vencido o no alcanza -- nunca deja un saldo negativo.
CREATE OR REPLACE FUNCTION decrement_bonus_credits(
    user_id_param UUID,
    credits_to_subtract NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_bonus NUMERIC;
    current_expiry TIMESTAMPTZ;
BEGIN
    SELECT bonus_credits, bonus_expires_at INTO current_bonus, current_expiry
    FROM user_credits WHERE user_id = user_id_param FOR UPDATE;

    IF current_bonus IS NULL THEN
        RETURN FALSE;
    END IF;
    IF current_expiry IS NOT NULL AND current_expiry < now() THEN
        RETURN FALSE;
    END IF;
    IF current_bonus < credits_to_subtract THEN
        RETURN FALSE;
    END IF;

    UPDATE user_credits
    SET bonus_credits = bonus_credits - credits_to_subtract,
        updated_at = now()
    WHERE user_id = user_id_param;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION decrement_bonus_credits(UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION decrement_bonus_credits(UUID, NUMERIC) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION decrement_bonus_credits(UUID, NUMERIC) TO service_role;


-- ============================================================
-- 5. VERIFICACIÓN -- confirmar que todo quedó bien antes de seguir.
-- ============================================================
SELECT
    p.proname AS funcion,
    pg_get_function_identity_arguments(p.oid) AS parametros,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_puede_ejecutar,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_puede_ejecutar,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_puede_ejecutar
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('increment_bonus_credits', 'decrement_bonus_credits');
