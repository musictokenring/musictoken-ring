-- ============================================================
-- AUDITORÍA DE CONCILIACIÓN -- post-fix (sept. 2026)
-- Todo este script es de SOLO LECTURA (SELECT). No modifica nada.
-- Ejecutar en Supabase -> SQL Editor, sección por sección.
-- ============================================================


-- ============================================================
-- 1. VERIFICAR QUE LAS FUNCIONES RPC TENGAN LOS PARÁMETROS
--    CORRECTOS (el bug de esta semana era exactamente esto:
--    un nombre de parámetro equivocado hacía que la función
--    ni se encontrara, y fallaba en silencio).
--    Buscar en "arguments": tiene que decir literalmente
--    credits_to_add / credits_to_subtract / amount_to_add /
--    amount_to_subtract / amount_to_reserve -- NUNCA algo
--    como "amount_param".
-- ============================================================
SELECT
    p.proname AS funcion,
    pg_get_function_identity_arguments(p.oid) AS parametros
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'increment_user_credits',
      'decrement_user_credits',
      'increment_user_fiat_balance',
      'decrement_user_fiat_balance',
      'update_vault_balance',
      'reserve_cop_withdrawal',
      'refund_cop_withdrawal'
  )
ORDER BY p.proname;


-- ============================================================
-- 2. BATALLAS TERMINADAS CON POZO REAL PERO SIN PREMIO
--    REGISTRADO -- esto detecta instancias PASADAS del bug de
--    premios que arreglamos (el crédito se otorgaba a un id
--    que la app nunca mostraba, o directamente fallaba). Si
--    aparece algo acá con finished_at reciente, es un caso
--    concreto para revisar/compensar a mano.
-- ============================================================
SELECT
    m.id AS match_id,
    m.match_type,
    m.winner,
    m.total_pot,
    ROUND(m.total_pot * 0.98, 4) AS premio_esperado,
    m.player1_id,
    m.player2_id,
    m.finished_at
FROM matches m
LEFT JOIN match_wins mw ON mw.match_id = m.id
WHERE m.status = 'finished'
  AND m.winner IS NOT NULL
  AND COALESCE(m.total_pot, 0) > 0
  AND m.match_type <> 'practice'
  AND mw.id IS NULL
ORDER BY m.finished_at DESC
LIMIT 100;


-- ============================================================
-- 3. CUENTAS CON HISTORIAL "ENREDADO" -- la misma wallet
--    vinculada a más de una fila de `users`, o a más de un
--    user_id en `user_wallets`. Esta es la causa raíz real del
--    bug de premios/reembolsos: cuando esto pasa, el saldo de
--    una persona puede estar repartido entre dos cuentas sin
--    que se note en el uso normal de la app.
-- ============================================================

-- 3a. Wallets repetidas directo en la columna users.wallet_address
SELECT
    wallet_address,
    COUNT(*) AS cantidad_de_cuentas,
    array_agg(id) AS user_ids,
    array_agg(email) AS emails
FROM users
WHERE wallet_address IS NOT NULL
GROUP BY wallet_address
HAVING COUNT(*) > 1;

-- 3b. Wallets vinculadas (tabla user_wallets) a más de un usuario
SELECT
    wallet_address,
    COUNT(DISTINCT user_id) AS cuentas_distintas,
    array_agg(DISTINCT user_id) AS user_ids
FROM user_wallets
GROUP BY wallet_address
HAVING COUNT(DISTINCT user_id) > 1;


-- ============================================================
-- 4. PARA LAS WALLETS DEL PASO 3: ver dónde vive el saldo real
--    de cada una de esas cuentas -- si una tiene saldo y la
--    otra en cero, esa es la señal de "dinero invisible".
--    (Copiar acá abajo la wallet exacta que salió en el paso 3
--    si querés mirar una en particular; si no, deja el WHERE
--    comentado para ver TODAS las que están repetidas.)
-- ============================================================
SELECT
    u.id AS user_id,
    u.email,
    u.wallet_address,
    u.saldo_fiat,
    u.saldo_onchain,
    uc.credits AS creditos,
    (COALESCE(u.saldo_fiat, 0) + COALESCE(u.saldo_onchain, 0) + COALESCE(uc.credits, 0)) AS saldo_total_unificado
FROM users u
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.wallet_address IN (
    SELECT wallet_address FROM users
    WHERE wallet_address IS NOT NULL
    GROUP BY wallet_address
    HAVING COUNT(*) > 1
)
ORDER BY u.wallet_address, saldo_total_unificado DESC;


-- ============================================================
-- 5. DEPÓSITOS RECIENTES DE NOWPAYMENTS -- para comparar A MANO
--    contra tu propio panel de NOWPayments (Payments history).
--    OJO: un depósito que falló por el bug de esta semana NO
--    genera ninguna fila acá (el registro se crea recién
--    DESPUÉS de acreditar, y el bug cortaba antes de eso) --
--    así que esta tabla por sí sola NO prueba que todo esté
--    bien. Comparar la CANTIDAD y los MONTOS de esta lista
--    contra los pagos "finished"/"confirmed" que muestra
--    NOWPayments en el mismo rango de fechas es la única forma
--    real de encontrar los que faltan.
-- ============================================================
SELECT
    id,
    user_id,
    tx_hash AS payment_id_nowpayments,
    token,
    amount,
    credits_awarded,
    status,
    created_at
FROM deposits
WHERE created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;

-- 5b. Resumen: cuántos depósitos y cuántos créditos se acreditaron
--     en total en los últimos 30 días (para comparar el TOTAL en
--     USD contra el total que muestra NOWPayments en su panel)
SELECT
    COUNT(*) AS cantidad_depositos,
    COALESCE(SUM(amount), 0) AS monto_total_pagado,
    COALESCE(SUM(credits_awarded), 0) AS creditos_totales_acreditados
FROM deposits
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND status = 'processed';


-- ============================================================
-- 6. DESAFÍOS SOCIALES CANCELADOS/VENCIDOS RECIENTES -- para
--    confirmar que el reembolso arreglado hoy efectivamente le
--    devolvió el crédito al challenger. Compara bet_amount
--    contra el saldo actual y la fecha de la última actualización
--    de créditos (no hay tabla de historial real, así que esto
--    es una aproximación por cercanía de fecha, igual que ya
--    usa AUDITORIA-SALDOS-BATALLAS.sql).
-- ============================================================
SELECT
    sc.challenge_id,
    sc.challenger_id,
    u.email AS challenger_email,
    sc.bet_amount,
    sc.status,
    sc.created_at,
    uc.credits AS creditos_actuales_challenger,
    uc.updated_at AS creditos_actualizados_en
FROM social_challenges sc
LEFT JOIN users u ON u.id = sc.challenger_id
LEFT JOIN user_credits uc ON uc.user_id = sc.challenger_id
WHERE sc.status IN ('cancelled', 'expired')
  AND sc.created_at >= NOW() - INTERVAL '14 days'
ORDER BY sc.created_at DESC
LIMIT 50;


-- ============================================================
-- 7. RETIROS EN COP RECIENTES -- este sistema ya estaba bien
--    hecho (verificado en la auditoría), esto es solo para
--    tener a la vista el estado actual, no porque se sospeche
--    algo puntual.
-- ============================================================
SELECT
    id,
    user_id,
    amount_cop,
    amount_usd_equivalent,
    payout_method,
    status,
    created_at,
    processed_at
FROM withdrawal_requests_cop
WHERE created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;


-- ============================================================
-- 8. FOTO GENERAL DE HOY -- guardar el resultado de esto en
--    algún lado (captura de pantalla o copiar el número) ANTES
--    de empezar a probar los arreglos en vivo. Así, si algo
--    sale mal durante la prueba, tenés un "antes" con qué
--    comparar el "después".
-- ============================================================
SELECT
    (SELECT COUNT(*) FROM users) AS total_usuarios,
    (SELECT COALESCE(SUM(credits), 0) FROM user_credits) AS total_creditos_activos,
    (SELECT COALESCE(SUM(saldo_fiat), 0) FROM users) AS total_saldo_fiat,
    (SELECT COALESCE(SUM(saldo_onchain), 0) FROM users) AS total_saldo_onchain,
    (SELECT COUNT(*) FROM matches WHERE status = 'finished') AS batallas_terminadas_total,
    (SELECT COUNT(*) FROM social_challenges WHERE status = 'pending') AS desafios_pendientes_ahora,
    (SELECT COUNT(*) FROM withdrawal_requests_cop WHERE status = 'pending') AS retiros_cop_pendientes;
