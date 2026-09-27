-- ============================================================
-- FASE 2 DEL PROGRAMA DE ARTISTAS: RETIRO DE REGALÍAS (2026-09-27)
-- ============================================================
-- El artista pide retirar (en pesos) lo acumulado en
-- artists.royalty_credits. Mismo esquema que los retiros COP de
-- jugadores: se descuenta de forma atómica al pedir, el operador paga a
-- mano y lo marca como pagado; si lo rechaza, se devuelve.
--
-- Todo lo sensible a impuestos es CONFIGURABLE (tabla
-- artist_payout_settings, editable desde el panel admin) porque la
-- calificación tributaria del pago la define el dueño con su contador:
--   - withholding_percent: retención aplicada al pago (por defecto 0).
--   - gmf_rate: 4x1000 trasladado al artista (por defecto 0.004).
--   - min_payout_cop: mínimo por retiro (por defecto 50.000 COP).
--   - terms_version: versión de los términos que el artista debe aceptar.
-- Correr ANTES de publicar el backend nuevo.

create table if not exists artist_payout_settings (
    id int primary key default 1 check (id = 1),
    min_payout_cop numeric not null default 50000 check (min_payout_cop >= 0),
    withholding_percent numeric not null default 0 check (withholding_percent >= 0 and withholding_percent <= 50),
    gmf_rate numeric not null default 0.004 check (gmf_rate >= 0 and gmf_rate <= 0.02),
    terms_version text not null default 'v1',
    updated_at timestamptz not null default now()
);
insert into artist_payout_settings (id) values (1) on conflict (id) do nothing;

-- Datos para pagar y para el documento soporte, y aceptación de términos.
alter table artists add column if not exists payout_legal_name text;
alter table artists add column if not exists payout_document_type text;
alter table artists add column if not exists payout_document_number text;
alter table artists add column if not exists terms_accepted_version text;
alter table artists add column if not exists terms_accepted_at timestamptz;

create table if not exists artist_payout_requests (
    id uuid primary key default gen_random_uuid(),
    artist_id uuid not null references artists(id) on delete restrict,
    amount_credits numeric not null check (amount_credits > 0),  -- descontado de royalty_credits
    rate_used numeric not null,                                  -- COP por crédito (TRM) al pedir
    gross_cop numeric not null,
    withholding_percent numeric not null default 0,
    withholding_cop numeric not null default 0,
    gmf_cop numeric not null default 0,
    net_cop numeric not null,                                    -- lo que se transfiere
    payout_method text not null,
    payout_details jsonb not null default '{}'::jsonb,
    legal_name text not null,
    document_type text not null,
    document_number text not null,
    terms_version text not null,
    status text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
    admin_notes text,
    created_at timestamptz not null default now(),
    processed_at timestamptz
);
create index if not exists idx_artist_payout_requests_artist on artist_payout_requests(artist_id);
create index if not exists idx_artist_payout_requests_status on artist_payout_requests(status);

-- Descuento atómico: falla si no alcanza (nunca deja saldo negativo ni
-- permite dos retiros simultáneos por más de lo acumulado).
create or replace function public.reserve_artist_royalty(artist_id_param uuid, amount_param numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
    remaining numeric;
begin
    if amount_param is null or amount_param <= 0 then
        raise exception 'Monto inválido';
    end if;
    update artists
       set royalty_credits = royalty_credits - amount_param
     where id = artist_id_param
       and royalty_credits >= amount_param
    returning royalty_credits into remaining;
    if remaining is null then
        raise exception 'Saldo de regalías insuficiente';
    end if;
    return remaining;
end;
$$;

create or replace function public.refund_artist_royalty(artist_id_param uuid, amount_param numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if amount_param is null or amount_param <= 0 then
        return;
    end if;
    update artists set royalty_credits = royalty_credits + amount_param where id = artist_id_param;
end;
$$;

revoke all on function public.reserve_artist_royalty(uuid, numeric) from public, anon, authenticated;
revoke all on function public.refund_artist_royalty(uuid, numeric) from public, anon, authenticated;
grant execute on function public.reserve_artist_royalty(uuid, numeric) to service_role;
grant execute on function public.refund_artist_royalty(uuid, numeric) to service_role;

-- RLS: el artista solo LEE sus propias solicitudes; crearlas, pagarlas y
-- rechazarlas lo hace únicamente el backend (service_role).
alter table artist_payout_requests enable row level security;
drop policy if exists "artist reads own payout requests" on artist_payout_requests;
create policy "artist reads own payout requests" on artist_payout_requests
    for select using (artist_id in (select id from artists where user_id = auth.uid()));

alter table artist_payout_settings enable row level security;
drop policy if exists "anyone reads payout settings" on artist_payout_settings;
create policy "anyone reads payout settings" on artist_payout_settings
    for select using (true);

-- Verificación: las dos funciones deben listar SOLO service_role (y postgres).
select routine_name, grantee
from information_schema.routine_privileges
where routine_name in ('reserve_artist_royalty', 'refund_artist_royalty')
order by routine_name, grantee;
