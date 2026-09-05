-- ============================================================
-- BONO DE BIENVENIDA AUTOMÁTICO -- 2026-09-05 (parte 2)
-- ============================================================
-- Requiere haber corrido antes bonus-credits-system.sql (necesita
-- user_credits.bonus_credits, bonus_grants, increment_bonus_credits).
--
-- Con esto, los bonos quedan como pediste: automáticos por defecto,
-- manuales solo para el caso especial puntual:
--   1. AUTOMÁTICO -- cuenta nueva: este trigger, se dispara solo.
--   2. AUTOMÁTICO -- invitado a un Reto Social de prueba sin saldo:
--      ya lo hace /api/social-challenges/:id/ensure-bonus-balance.
--   3. MANUAL -- lo que quede fuera de esos dos casos: pestaña "Bonos"
--      del panel admin (promoción puntual, extender un vencimiento, etc).
--
-- El monto/días son fáciles de cambiar después: solo hay que volver a
-- correr este mismo CREATE OR REPLACE FUNCTION con otros valores.
-- ============================================================

CREATE OR REPLACE FUNCTION grant_signup_bonus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    bonus_amount NUMERIC := 20;
    bonus_days INT := 7;
    expires TIMESTAMPTZ := now() + (bonus_days || ' days')::interval;
BEGIN
    PERFORM increment_bonus_credits(NEW.id, bonus_amount, expires);

    INSERT INTO bonus_grants (user_id, amount, bonus_type, granted_by, note, expires_at, status)
    VALUES (NEW.id, bonus_amount, 'platform_trial', 'system_auto_signup', 'Bono de bienvenida automático (cuenta nueva)', expires, 'active');

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Nunca bloquear el alta de una cuenta nueva por un problema con el
    -- bono -- si algo falla acá, la cuenta se crea igual, sin bono.
    RAISE WARNING '[grant_signup_bonus] Falló para user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_signup_bonus ON users;
CREATE TRIGGER trg_grant_signup_bonus
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION grant_signup_bonus();

COMMENT ON FUNCTION grant_signup_bonus() IS 'Otorga automáticamente un bono de prueba (bonus_credits) a toda cuenta nueva en public.users, sin importar si se creó por email, Google o wallet.';


-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT tgname, tgrelid::regclass AS tabla, tgenabled
FROM pg_trigger
WHERE tgname = 'trg_grant_signup_bonus';
