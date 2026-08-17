-- Migration: battle_id de battle_bets/battle_settlements pasa de UUID a TEXT.
--
-- Encontrado en produccion (2026-08-17): las batallas de torneo Express NO
-- tienen un id de fila real en la base -- se simulan del lado del servidor
-- dentro de tournaments.bracket_state, y cada duelo tiene un id local tipo
-- "r2m1" (ronda 2, duelo 1), NO un UUID. El backend rechazaba el insert con
-- "invalid input syntax for type uuid" porque la columna exigia formato UUID.
--
-- El frontend ahora arma el battle_id como "{tournament_id}:{duelId}" (ej.
-- "a4d1acee-ddcc-4e84-b78d-d89022e359d9:r2m1") para que sea unico y estable
-- por duelo, sin importar el genero o el slot. Para las batallas 1v1 fuera de
-- torneo (Modo Rapido, Practica) el id real de la tabla matches sigue siendo
-- un UUID valido, y sigue funcionando igual (un UUID tambien es un TEXT valido).

ALTER TABLE battle_bets ALTER COLUMN battle_id TYPE TEXT;
ALTER TABLE battle_settlements ALTER COLUMN battle_id TYPE TEXT;
