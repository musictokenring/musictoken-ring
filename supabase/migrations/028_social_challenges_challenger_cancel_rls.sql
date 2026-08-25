-- Migration: permitir que el creador de un Desafío Social actualice su
-- propia fila (necesario para poder cancelarlo).
--
-- Hipótesis fundamentada en un bug real reportado en vivo: al cancelar un
-- desafío pendiente, el reembolso se aplicaba pero el UPDATE a
-- status='cancelled' no confirmaba ninguna fila afectada (sin lanzar
-- error -- típico de un UPDATE bloqueado por RLS, que en Postgres/PostgREST
-- no tira excepción, simplemente no actualiza nada). acceptSocialChallenge()
-- ya prueba que hay ALGÚN permiso de UPDATE sobre esta tabla (quien acepta,
-- que es un usuario DISTINTO al creador, logra poner status='accepted'),
-- pero es probable que esa policy solo cubra esa transición puntual y nunca
-- se haya pensado la de "el propio creador cancela su desafío pendiente".
--
-- Esta policy es puramente ADITIVA -- no toca ni reemplaza ninguna policy
-- existente, solo agrega un camino más para que el creador pueda actualizar
-- su propia fila.

DROP POLICY IF EXISTS social_challenges_challenger_update_own ON social_challenges;

CREATE POLICY social_challenges_challenger_update_own
ON social_challenges
FOR UPDATE
TO authenticated
USING (challenger_id = auth.uid())
WITH CHECK (challenger_id = auth.uid());
