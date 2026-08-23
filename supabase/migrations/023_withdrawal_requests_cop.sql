-- Migration: Solicitudes de retiro manual en pesos (COP)
-- El usuario pide retirar parte de su saldo jugable como pesos reales
-- (Nequi/Bancolombia/Bre-B/etc). No hay desembolso automático todavía
-- (ver discusión: Wompi necesitaría fondearse desde la misma cuenta de
-- Mercado Pago, así que por ahora el pago real lo hace el operador de la
-- plataforma a mano, después de retirar el saldo de Mercado Pago a su
-- cuenta bancaria). Esta tabla + funciones solo garantizan que el saldo
-- se descuenta de forma atómica y auditable ANTES de avisarle al
-- operador, para que nunca se pueda gastar dos veces la misma plata.

CREATE TABLE IF NOT EXISTS withdrawal_requests_cop (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    amount_cop DECIMAL(20, 2) NOT NULL,          -- lo que el usuario pidió recibir, en pesos
    amount_usd_equivalent DECIMAL(20, 6) NOT NULL, -- lo descontado del saldo jugable (créditos = USD nominal)
    rate_used DECIMAL(20, 6) NOT NULL,            -- COP por USD usada para el cálculo (TRM oficial)

    payout_method TEXT NOT NULL,                  -- 'nequi', 'bre-b', 'bancolombia', 'daviplata', 'otro_banco'
    payout_details JSONB NOT NULL,                -- { telefono, banco, tipo_cuenta, numero_cuenta, ... } según método

    -- De dónde salió exactamente el descuento (para poder revertirlo exacto si se rechaza)
    taken_from_fiat DECIMAL(20, 6) DEFAULT 0 NOT NULL,
    taken_from_credits DECIMAL(20, 6) DEFAULT 0 NOT NULL,
    taken_from_onchain DECIMAL(20, 6) DEFAULT 0 NOT NULL,

    status TEXT DEFAULT 'pending' NOT NULL,       -- 'pending', 'paid', 'rejected'
    admin_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_cop_user ON withdrawal_requests_cop(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_cop_status ON withdrawal_requests_cop(status);

ALTER TABLE withdrawal_requests_cop ENABLE ROW LEVEL SECURITY;

-- El usuario puede ver sus propias solicitudes (para mostrarle el estado en la UI).
-- No hay política de INSERT/UPDATE para authenticated/anon a propósito: toda
-- escritura pasa por el backend con el service role, igual que deposits.
DROP POLICY IF EXISTS "Users can view own withdrawal requests" ON withdrawal_requests_cop;
CREATE POLICY "Users can view own withdrawal requests" ON withdrawal_requests_cop
    FOR SELECT
    USING (auth.uid() = user_id);

-- --------------------------------------------------------------------------
-- reserve_cop_withdrawal: descuenta atómicamente el equivalente en USD del
-- saldo jugable unificado (saldo_fiat + user_credits.credits + saldo_onchain,
-- mismo criterio que get_user_unified_balance) y devuelve de dónde salió
-- cada parte, para poder revertirlo exacto si el retiro se rechaza.
--
-- Prioridad de descuento: saldo_fiat primero (es la plata que entró
-- directamente por Mercado Pago, la más natural para "cambiar por pesos"),
-- después user_credits (ganancias de batallas), y por último saldo_onchain.
--
-- Usa FOR UPDATE sobre ambas filas para serializar solicitudes concurrentes
-- del MISMO usuario (dos pestañas pidiendo retiro a la vez no pueden
-- descontar más de lo que hay). Usuarios distintos no se bloquean entre sí.
--
-- SIN GRANT a authenticated/anon a propósito: esto mueve saldo real, solo
-- el backend (service role) puede llamarla, nunca directo desde el cliente.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reserve_cop_withdrawal(
    user_id_param UUID,
    amount_to_reserve DECIMAL
) RETURNS TABLE(taken_fiat DECIMAL, taken_credits DECIMAL, taken_onchain DECIMAL)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    current_fiat DECIMAL;
    current_onchain DECIMAL;
    current_credits DECIMAL;
    remaining DECIMAL;
    v_take_fiat DECIMAL;
    v_take_credits DECIMAL;
    v_take_onchain DECIMAL;
BEGIN
    IF amount_to_reserve IS NULL OR amount_to_reserve <= 0 THEN
        RAISE EXCEPTION 'amount_to_reserve debe ser mayor a 0';
    END IF;

    SELECT COALESCE(saldo_fiat, 0), COALESCE(saldo_onchain, 0)
    INTO current_fiat, current_onchain
    FROM users
    WHERE id = user_id_param
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado: %', user_id_param;
    END IF;

    SELECT COALESCE(credits, 0) INTO current_credits
    FROM user_credits
    WHERE user_id = user_id_param
    FOR UPDATE;

    current_credits := COALESCE(current_credits, 0);

    IF (current_fiat + current_credits + current_onchain) < amount_to_reserve THEN
        RAISE EXCEPTION 'Saldo insuficiente: disponible %, solicitado %',
            (current_fiat + current_credits + current_onchain), amount_to_reserve;
    END IF;

    remaining := amount_to_reserve;

    v_take_fiat := LEAST(remaining, current_fiat);
    remaining := remaining - v_take_fiat;

    v_take_credits := LEAST(remaining, current_credits);
    remaining := remaining - v_take_credits;

    v_take_onchain := LEAST(remaining, current_onchain);
    remaining := remaining - v_take_onchain;

    IF remaining > 0.000001 THEN
        RAISE EXCEPTION 'Error de cálculo reservando saldo (remanente %)', remaining;
    END IF;

    UPDATE users
    SET saldo_fiat = saldo_fiat - v_take_fiat,
        saldo_onchain = saldo_onchain - v_take_onchain,
        updated_at = NOW()
    WHERE id = user_id_param;

    IF v_take_credits > 0 THEN
        UPDATE user_credits
        SET credits = credits - v_take_credits,
            updated_at = NOW()
        WHERE user_id = user_id_param;
    END IF;

    RETURN QUERY SELECT v_take_fiat, v_take_credits, v_take_onchain;
END;
$$;

-- --------------------------------------------------------------------------
-- refund_cop_withdrawal: reversa exacta de reserve_cop_withdrawal, para
-- cuando el operador rechaza una solicitud (ej. datos de pago inválidos).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refund_cop_withdrawal(
    user_id_param UUID,
    refund_fiat DECIMAL,
    refund_credits DECIMAL,
    refund_onchain DECIMAL
) RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE users
    SET saldo_fiat = COALESCE(saldo_fiat, 0) + COALESCE(refund_fiat, 0),
        saldo_onchain = COALESCE(saldo_onchain, 0) + COALESCE(refund_onchain, 0),
        updated_at = NOW()
    WHERE id = user_id_param;

    IF COALESCE(refund_credits, 0) > 0 THEN
        INSERT INTO user_credits (user_id, credits, updated_at)
        VALUES (user_id_param, refund_credits, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            credits = user_credits.credits + refund_credits,
            updated_at = NOW();
    END IF;
END;
$$;

COMMENT ON TABLE withdrawal_requests_cop IS 'Solicitudes de retiro manual en pesos colombianos. El pago real lo hace el operador a mano (Nequi/transferencia) tras retirar saldo de Mercado Pago; esta tabla garantiza el descuento atómico del saldo jugable y deja auditoría.';
COMMENT ON FUNCTION reserve_cop_withdrawal(UUID, DECIMAL) IS 'Descuenta atómicamente el saldo jugable unificado (fiat + credits + onchain, en ese orden de prioridad) para una solicitud de retiro en COP. Solo debe llamarse desde el backend con service role.';
COMMENT ON FUNCTION refund_cop_withdrawal(UUID, DECIMAL, DECIMAL, DECIMAL) IS 'Revierte exactamente lo que reserve_cop_withdrawal descontó, para solicitudes de retiro rechazadas.';
