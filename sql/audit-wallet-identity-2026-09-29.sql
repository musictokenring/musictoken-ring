-- ============================================================
-- AUDITORÍA (solo lectura): identidad por wallet sin firma (2026-09-29)
-- ============================================================
-- El backend acepta la walletAddress que manda el cliente para elegir de
-- qué cuenta se descuenta/retira (resolveCreditsUserId) y
-- /api/user/link-wallet fusiona el saldo de la cuenta dueña de esa wallet
-- sin pedir firma. Estas consultas NO modifican nada: sirven para ver si
-- alguien ya lo aprovechó y cuántas cuentas legítimas dependen de ese
-- mecanismo.

-- 1) Wallets cuya cuenta "dueña" (users.wallet_address) NO es la cuenta a la
--    que están vinculadas en user_wallets. Cada fila es una cuenta que hoy
--    depende de la wallet (sin firma) para llegar a su saldo, o una
--    vinculación ajena.
select uw.wallet_address,
       uw.user_id        as vinculada_a,
       vu.email          as email_vinculada,
       u.id              as cuenta_de_la_wallet,
       u.email           as email_cuenta_wallet,
       coalesce(uc.credits, 0) as creditos_cuenta_wallet,
       uw.linked_via, uw.linked_at
from user_wallets uw
join users u on lower(u.wallet_address) = uw.wallet_address
left join users vu on vu.id = uw.user_id
left join user_credits uc on uc.user_id = u.id
where u.id <> uw.user_id
order by uw.linked_at desc;

-- 2) Todos los retiros COP con la cuenta debitada. La fila no guarda QUIÉN
--    lo pidió, así que hay que comparar a ojo: ¿el titular/datos de pago
--    (payout_details) corresponden a la dueña de la cuenta debitada?
select w.id, w.created_at, w.status, w.amount_cop,
       w.user_id, u.email as email_cuenta_debitada, u.wallet_address,
       w.payout_method, w.payout_details
from withdrawal_requests_cop w
left join users u on u.id = w.user_id
order by w.created_at desc;

-- 3) Vinculaciones sin firma de los últimos 60 días (vía /api/user/link-wallet).
select uw.wallet_address, uw.user_id, vu.email, uw.linked_via, uw.linked_at, uw.ip_address
from user_wallets uw
left join users vu on vu.id = uw.user_id
where coalesce(uw.linked_via, '') <> 'signature'
  and uw.linked_at > now() - interval '60 days'
order by uw.linked_at desc;
