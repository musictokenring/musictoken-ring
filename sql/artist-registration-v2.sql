-- ============================================================
-- PROGRAMA DE ARTISTAS: INSCRIPCIÓN v2 + VENCIMIENTO A 6 MESES
-- (2026-09-28)
-- ============================================================
-- Modelo decidido por el dueño:
--  - Cada perfil (solista o agrupación) tiene UN administrador de fondos:
--    la cuenta maestra, única autorizada para retirar. Los retiros se
--    pagan siempre a su nombre y documento.
--  - Se declaran los integrantes (intérpretes, músicos, compositores,
--    productores) con un reparto porcentual SUGERIDO: es informativo, el
--    administrador recibe todo y declara que lo reparte entre ellos.
--  - Las regalías no retiradas en 6 meses pasan a las ganancias de la
--    plataforma. El plazo corre desde que se acumulan o desde que entra en
--    vigor esta regla (lo que sea posterior): nada de lo acumulado antes
--    vence de forma retroactiva.
-- Correr ANTES de publicar el backend nuevo.

alter table artists add column if not exists artist_type text check (artist_type in ('solista', 'agrupacion'));
alter table artists add column if not exists group_kind text;
alter table artists add column if not exists fund_admin_name text;
alter table artists add column if not exists fund_admin_document_type text;
alter table artists add column if not exists fund_admin_document_number text;
alter table artists add column if not exists fund_admin_phone text;
alter table artists add column if not exists fund_admin_declared_at timestamptz;
alter table artists add column if not exists members jsonb not null default '[]'::jsonb;

-- Registro de regalías vencidas (auditoría): cuánto y cuándo pasó a la plataforma.
create table if not exists artist_royalty_expirations (
    id uuid primary key default gen_random_uuid(),
    artist_id uuid not null references artists(id) on delete cascade,
    amount numeric not null check (amount > 0),
    created_at timestamptz not null default now()
);
create index if not exists idx_artist_royalty_expirations_artist on artist_royalty_expirations(artist_id);

-- Vence como mucho lo que haya en el saldo (nunca lo deja negativo).
-- Devuelve lo que efectivamente venció.
create or replace function public.expire_artist_royalty(artist_id_param uuid, amount_param numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
    to_expire numeric;
begin
    if amount_param is null or amount_param <= 0 then
        return 0;
    end if;
    select least(royalty_credits, amount_param) into to_expire
      from artists where id = artist_id_param for update;
    if to_expire is null or to_expire <= 0 then
        return 0;
    end if;
    update artists set royalty_credits = royalty_credits - to_expire where id = artist_id_param;
    insert into artist_royalty_expirations (artist_id, amount) values (artist_id_param, to_expire);
    return to_expire;
end;
$$;
revoke all on function public.expire_artist_royalty(uuid, numeric) from public, anon, authenticated;
grant execute on function public.expire_artist_royalty(uuid, numeric) to service_role;

alter table artist_royalty_expirations enable row level security;
drop policy if exists "artist reads own expirations" on artist_royalty_expirations;
create policy "artist reads own expirations" on artist_royalty_expirations
    for select using (artist_id in (select id from artists where user_id = auth.uid()));

-- Los términos cambian (administrador de fondos + vencimiento): los
-- artistas deben aceptar la versión nueva antes de su próximo retiro.
update artist_payout_settings set terms_version = 'v2', updated_at = now()
 where id = 1 and terms_version = 'v1';

-- Verificación: debe listar SOLO service_role (y postgres).
select routine_name, grantee from information_schema.routine_privileges
where routine_name = 'expire_artist_royalty' order by grantee;
