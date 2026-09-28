-- ============================================================
-- DESAFÍO SOCIAL: AVATAR DEL CREADOR (2026-09-28)
-- ============================================================
-- El creador elige su avatar al armar el desafío (mismo set de íconos
-- que Sala Privada). Se guarda acá y pasa a matches.player1_avatar cuando
-- alguien acepta (quien acepta elige el suyo -> player2_avatar).
-- Sin esta columna todo sigue funcionando, solo sin el avatar del creador.

alter table social_challenges add column if not exists challenger_avatar text;
