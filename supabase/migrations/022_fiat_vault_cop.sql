-- Vault de liquidez EN PESOS COLOMBIANOS, separado del vault on-chain (USDC).
--
-- Por qué separado: el vault existente (`vault_balance`) es una wallet real
-- de USDC en Base — tiene sentido para depósitos en cripto (NOWPayments),
-- porque ahí sí entra cripto real que se puede mover on-chain. Los depósitos
-- por Mercado Pago son pesos colombianos (fiat, vía transferencia bancaria/
-- PSE/Nequi/tarjeta) — no hay cripto que mover a ninguna wallet. Mezclar los
-- dos en la misma tabla sería contar peras como manzanas.
--
-- Este vault es puramente un contador de auditoría/transparencia: cuánto del
-- 5% de comisión de los depósitos en pesos está "reservado" como respaldo
-- para futuros retiros en pesos (cuando exista ese flujo, ver Wompi/Bre-B).
-- La plata real de esos depósitos ya está en la cuenta real de Mercado Pago
-- de la plataforma — esta tabla no mueve nada, solo lleva la cuenta.

CREATE TABLE IF NOT EXISTS public.vault_balance_cop (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    balance_cop DECIMAL(18, 2) NOT NULL DEFAULT 0,
    last_tx_hash TEXT,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT DEFAULT 'system'
);

-- Fila inicial en 0, mismo patrón que vault_balance.
INSERT INTO public.vault_balance_cop (balance_cop, updated_by)
SELECT 0, 'system'
WHERE NOT EXISTS (SELECT 1 FROM public.vault_balance_cop);

-- Mismo patrón que update_vault_balance() (migración 002), pero para pesos.
CREATE OR REPLACE FUNCTION update_vault_balance_cop(
    amount_to_add DECIMAL,
    tx_hash_param TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE vault_balance_cop
    SET
        balance_cop = balance_cop + amount_to_add,
        last_updated = NOW(),
        last_tx_hash = tx_hash_param
    WHERE id = (SELECT id FROM vault_balance_cop ORDER BY last_updated DESC LIMIT 1);

    IF NOT FOUND THEN
        INSERT INTO vault_balance_cop (balance_cop, last_tx_hash, last_updated)
        VALUES (amount_to_add, tx_hash_param, NOW());
    END IF;
END;
$$ LANGUAGE plpgsql;

-- RLS: mismo criterio que vault_balance (lectura pública para transparencia,
-- solo el backend con service role puede escribir vía la función de arriba).
ALTER TABLE public.vault_balance_cop ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view fiat vault balance" ON public.vault_balance_cop;
CREATE POLICY "Authenticated users can view fiat vault balance" ON public.vault_balance_cop
    FOR SELECT
    USING (true);
