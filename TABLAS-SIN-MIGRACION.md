# ⚠️ Tablas que existen en Supabase pero no en `supabase/migrations/`

Encontrado revisando la lógica de Modo Rápido y Sala Privada (2026-08-23). Estas
tres tablas las usa el código en vivo y **sí existen** en la base real (verificado
en vivo contra `https://bscmgcnynbxalcuwdqlm.supabase.co` con la anon key pública),
pero en algún momento se crearon a mano (dashboard de Supabase) antes de que este
repo empezara a trackear migraciones en `supabase/migrations/`. Resultado: si algún
día hay que reconstruir la base desde cero solo corriendo las migraciones del repo,
**faltarían estas tres** y el sitio se rompería en silencio.

No tengo acceso con la service-role key en esta sesión para hacer un dump real del
schema (columnas exactas, tipos, constraints, policies de RLS), así que esto **no es
un `CREATE TABLE` para correr** — es un inventario de qué columnas usa el código hoy,
para que quien tenga acceso al dashboard pueda exportar el schema real y sumarlo
como una migración `0XX_baseline_legacy_tables.sql`.

## `matches`
Usada por Modo Rápido, Sala Privada y Modo Práctica (`match_type`: `'quick'` |
`'private'` | `'practice'`).

Columnas referenciadas en [game-engine.js](game-engine.js):
`id`, `match_type`, `status`, `room_code`, `total_pot`,
`player1_id`, `player1_song_id`, `player1_song_name`, `player1_song_artist`,
`player1_song_image`, `player1_song_preview`, `player1_bet`,
`player2_id`, `player2_song_id`, `player2_song_name`, `player2_song_artist`,
`player2_song_image`, `player2_song_preview`, `player2_bet`.

⚠️ **RLS sin verificar**: `joinPrivateRoom()` hace un `UPDATE` sobre una fila de
`matches` que pertenece a OTRO usuario (quien creó la sala) para sumarse como
`player2_id`. No pude confirmar si las políticas RLS actuales permiten esa
escritura entre usuarios distintos — solo se puede probar con dos sesiones
autenticadas reales, o revisando las policies en el dashboard.

## `private_rooms`
Columnas referenciadas: `id`, `room_code`, `creator_id`, `match_id`, `min_bet`,
`status` (`'open'` → `'full'`).

## `matchmaking_queue`
Columnas referenciadas: `id`, `user_id`, `song_id`, `song_name`, `song_artist`,
`song_image`, `song_preview`, `bet_amount`, `created_at` (se usa para ordenar
`ascending: true`).

⚠️ **RLS sin verificar**: `joinQuickMatch()` borra la fila de cola de OTRO usuario
(`delete().eq('id', opponent.id)`) al emparejar. Si RLS no permite borrar filas
ajenas, ese `delete` falla en silencio (Postgrest no tira error en un delete de 0
filas), dejando colas fantasma.

---

**Nota de esta sesión**: el 2026-08-23 se revisó y corrigió la lógica de estos dos
modos (ver commits del día) — quedaron arreglados el botón "Unirse" (nunca se
habilitaba), el habilitado poco confiable de "Crear Sala", y un RPC legacy roto
(`update_user_balance`, con dos versiones ambiguas en la base) que bloqueaba
apostar para cualquier usuario sin wallet conectada. Los dos puntos de RLS de
arriba quedaron **sin verificar** por falta de acceso a una segunda cuenta de
prueba real o a la service-role key en esta sesión.
