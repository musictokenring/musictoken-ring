-- ============================================================
-- NOTIFICACIONES PUSH WEB (2026-09-28)
-- ============================================================
-- Avisos fuera de la app (sitio cerrado): p. ej. "aceptaron tu desafío,
-- tu rival te espera". Estándar Web Push: el navegador de cada usuario
-- entrega una suscripción (endpoint + claves) y el backend firma los
-- envíos con un par de claves VAPID.
--
-- push_config guarda ese par VAPID: lo genera el backend solo la primera
-- vez (no hay que configurar nada en Render). SIN políticas RLS: nadie lo
-- lee con la clave pública, solo el backend (service_role).

create table if not exists push_config (
    id int primary key default 1 check (id = 1),
    vapid_public_key text not null,
    vapid_private_key text not null,
    created_at timestamptz not null default now()
);
alter table push_config enable row level security;

create table if not exists push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    endpoint text not null unique,
    p256dh text not null,
    auth text not null,
    user_agent text,
    created_at timestamptz not null default now(),
    last_success_at timestamptz,
    failure_count int not null default 0
);
create index if not exists idx_push_subscriptions_user on push_subscriptions(user_id);
-- Solo el backend las toca (alta/baja/envío): sin políticas para el cliente.
alter table push_subscriptions enable row level security;

-- Verificación: las dos tablas con RLS activo y sin políticas.
select tablename, rowsecurity,
       (select count(*) from pg_policies p where p.tablename = t.tablename) as policies
from pg_tables t
where tablename in ('push_config', 'push_subscriptions');
