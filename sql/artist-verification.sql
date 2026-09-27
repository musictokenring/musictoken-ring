-- ============================================================
-- PROGRAMA DE ARTISTAS: VERIFICACIÓN DE IDENTIDAD (2026-09-28)
-- ============================================================
-- Dos caminos para probar que el artista es quien dice ser:
--  1) 'social': publicación permanente (post) en su Instagram, Facebook
--     o TikTok oficial con un código único, etiquetando a la cuenta de
--     MusicToken Ring (configurable abajo). Una historia con el mismo
--     código refuerza la prueba (se borra sola, por eso no alcanza sola).
--  2) 'document': documento de identidad (frente/dorso), selfie con el
--     documento y el código, y prueba de derechos (panel de la
--     distribuidora). Van a un bucket PRIVADO; solo el operador los ve con
--     links temporales desde el panel, y se borran 30 días después de la
--     decisión (Ley 1581 de 2012: finalidad y minimización).
-- Al aprobar, el operador fija el id de artista de Deezer: desde ahí las
-- canciones de ESE artista se aprueban solas al reclamarlas, y las de
-- cualquier otro quedan para revisión manual.
-- Correr ANTES de publicar el backend nuevo.

alter table artist_payout_settings add column if not exists social_tag_handle text not null default '@musictokenring';
alter table artist_payout_settings add column if not exists data_consent_version text not null default 'v1';

alter table artists add column if not exists verification_method text;

create table if not exists artist_verifications (
    id uuid primary key default gen_random_uuid(),
    artist_id uuid not null references artists(id) on delete cascade,
    method text not null check (method in ('social', 'document')),
    code text not null,
    status text not null default 'awaiting' check (status in ('awaiting', 'submitted', 'approved', 'rejected')),
    post_urls jsonb not null default '[]'::jsonb,
    profile_url text,
    story_shared boolean not null default false,
    has_badge boolean,
    files jsonb not null default '[]'::jsonb,      -- [{kind, path}] mientras existan
    data_consent_version text,
    data_consent_at timestamptz,
    admin_note text,
    created_at timestamptz not null default now(),
    submitted_at timestamptz,
    decided_at timestamptz,
    files_deleted_at timestamptz
);
create index if not exists idx_artist_verifications_artist on artist_verifications(artist_id);
create index if not exists idx_artist_verifications_status on artist_verifications(status);

-- El artista puede leer sus propias verificaciones; crear, enviar y
-- decidir lo hace solo el backend (service_role).
alter table artist_verifications enable row level security;
drop policy if exists "artist reads own verifications" on artist_verifications;
create policy "artist reads own verifications" on artist_verifications
    for select using (artist_id in (select id from artists where user_id = auth.uid()));

-- Bucket PRIVADO para los documentos (sin políticas: nadie lo lee ni lo
-- escribe con la clave pública; el backend emite URLs firmadas).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artist-verification', 'artist-verification', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update set public = false;

-- Verificación: el bucket debe figurar como NO público.
select id, public, file_size_limit from storage.buckets where id = 'artist-verification';
