-- ============================================================
-- RETIROS CRIPTO (2026-09-29) -- reemplazan a /api/claim
-- ============================================================
-- El usuario pega su dirección (sin conectar wallet). El saldo se reserva
-- de forma ATÓMICA al pedir el retiro (misma función reserve_cop_withdrawal
-- que ya usan los retiros en pesos: FOR UPDATE, dos pedidos a la vez no
-- pueden sacar más de lo que hay) y se devuelve exacto si se rechaza o falla.
--
-- Estados:
--   pending_review  esperando al operador (primera vez a esa dirección,
--                   monto alto, TRON, o sin fondos en la wallet de pagos)
--   processing      pago en curso (bloqueo contra doble ejecución)
--   paid            pagado (tx_hash)
--   failed          la transacción falló en la red -> saldo devuelto
--   rejected        rechazado por el operador -> saldo devuelto
--
-- RLS activa y SIN políticas: solo el backend (service role) la toca.
-- Requiere migración 023 (reserve_cop_withdrawal / refund_cop_withdrawal).

create table if not exists withdrawal_requests_crypto (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    amount_credits numeric(20, 4) not null check (amount_credits > 0),
    fee_credits numeric(20, 4) not null default 0,
    payout_amount numeric(20, 6) not null check (payout_amount > 0),
    network text not null check (network in ('base_usdc', 'tron_usdt')),
    address text not null,
    status text not null default 'pending_review'
        check (status in ('pending_review', 'processing', 'paid', 'failed', 'rejected')),
    review_reason text,
    taken_from_fiat numeric(20, 4) not null default 0,
    taken_from_credits numeric(20, 4) not null default 0,
    taken_from_onchain numeric(20, 4) not null default 0,
    payout_method text,
    tx_hash text,
    error text,
    admin_notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    processed_at timestamptz
);

-- id del payout en NOWPayments (vía de pago 1). Agregado después de la
-- primera versión: correr también si la tabla ya existía.
alter table withdrawal_requests_crypto add column if not exists payout_id text;

create index if not exists idx_wrc_user_created on withdrawal_requests_crypto (user_id, created_at desc);
create index if not exists idx_wrc_status on withdrawal_requests_crypto (status, created_at);

alter table withdrawal_requests_crypto enable row level security;

-- Verificación: RLS activa y 0 políticas.
select tablename, rowsecurity,
       (select count(*) from pg_policies p where p.tablename = t.tablename) as policies
from pg_tables t
where tablename = 'withdrawal_requests_crypto';
