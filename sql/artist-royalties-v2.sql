-- ============================================================
-- REGALÍAS DE IMPULSO v2 -- por selección, financiadas con la comisión
-- (2026-09-27)
-- ============================================================
-- Modelo nuevo (ver awardMatchWinnerCore en backend/server-auto.js):
-- la mitad de la comisión de cada batalla real va a un fondo de
-- artistas que se reparte 50/50 entre las dos canciones elegidas, ganen
-- o pierdan. Reemplaza el 5% del pozo pagado aparte (la plataforma
-- perdía plata en cada victoria de una canción verificada).
--
-- Esto agrega:
--  - artist_songs.selections_count: veces que la canción se eligió en
--    una batalla real que generó regalía (wins_count sigue contando las
--    que además ganó).
--  - increment_artist_royalty(): suma atómica al artista y a la canción.
--    Antes el backend leía el acumulado y lo reescribía, así que dos
--    batallas terminando al mismo tiempo podían pisarse.
-- Correr ANTES o DESPUÉS de publicar el backend da igual: sin esto el
-- backend usa el método viejo (leer y escribir) y sigue acreditando.

alter table artist_songs add column if not exists selections_count int not null default 0;

create or replace function public.increment_artist_royalty(
    artist_id_param uuid,
    artist_song_id_param uuid,
    amount_param numeric,
    won_param boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if amount_param is null or amount_param <= 0 then
        return;
    end if;
    update artists
       set royalty_credits = royalty_credits + amount_param
     where id = artist_id_param;
    update artist_songs
       set total_royalties_earned = total_royalties_earned + amount_param,
           selections_count = selections_count + 1,
           wins_count = wins_count + (case when won_param then 1 else 0 end)
     where id = artist_song_id_param;
end;
$$;

-- Solo el backend (service_role) puede acreditar regalías -- mismo
-- criterio que increment_user_credits / increment_bonus_credits.
revoke all on function public.increment_artist_royalty(uuid, uuid, numeric, boolean) from public;
revoke all on function public.increment_artist_royalty(uuid, uuid, numeric, boolean) from anon, authenticated;
grant execute on function public.increment_artist_royalty(uuid, uuid, numeric, boolean) to service_role;

-- Verificación: debe listar SOLO service_role (y el dueño postgres).
select grantee, privilege_type
from information_schema.routine_privileges
where routine_name = 'increment_artist_royalty';
