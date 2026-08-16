"""Agent 2 — CFO IA ("payments-agent").

Deploy: Cloud Function (HTTP trigger), called SERVER-TO-SERVER by the existing
Node backend (server-auto.js) *after* it has already verified the NOWPayments
IPN signature (x-nowpayments-sig) — this agent is never exposed directly to
NOWPayments or to the public internet as a payment webhook. That split exists
on purpose: the Node backend already contains the hardened signature
verification (see nowpayments-service.js); this agent focuses on the
AI-native ops layer (split calc, ledger, P&L) and must not become a second,
weaker front door for the same money.

Safety rails (directly answering the fund-leak history in
ANALISIS-VULNERABILIDAD-CONFIRMADA.md / RESUMEN-FUGA-FONDOS.md):
  1. Shared-secret auth on this endpoint (CFO_AGENT_SHARED_SECRET) — only the
     Node backend may call it.
  2. Idempotency: each NOWPayments payment_id is processed exactly once
     (Firestore dedupe), so a retried/duplicated webhook can't double-pay.
  3. Wallet-of-record lookup: the artist's payout wallet is read from
     Supabase by user_id, NEVER taken from the inbound payload. This is the
     exact fix already applied to /api/claim, applied here too.
  4. Per-transaction and daily caps with a circuit breaker: if either is
     exceeded, the agent refuses to pay and raises a Firestore alert instead
     of a silent auto-payout.
  5. Actual on-chain payout execution is delegated back to the existing,
     already-audited backend (prize-service.js -> sendPrize / NOWPayments
     Custody payout) via InternalBackendClient — this agent never holds a
     private key.
  6. Every attempt (paid, rejected, or capped) is written to BigQuery for
     the P&L / analytics report, whether or not the payout succeeded.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Any

from flask import Flask, jsonify, request

from common import (
    BigQuerySink,
    FirestoreStore,
    InternalBackendClient,
    SupabaseReadClient,
    enable_local_cors,
    env,
    get_logger,
)

logger = get_logger("cfo_agent")

ARTIST_SPLIT_PCT = float(env("CFO_ARTIST_SPLIT_PCT", default="95"))
MTR_SPLIT_PCT = 100 - ARTIST_SPLIT_PCT
PER_TX_CAP_USD = float(env("CFO_PER_TX_CAP_USD", default="200"))
DAILY_CAP_USD = float(env("CFO_DAILY_CAP_USD", default="1000"))
SHARED_SECRET = env("CFO_AGENT_SHARED_SECRET", default="")

store = FirestoreStore()
ledger = BigQuerySink(table="payments_ledger")
supabase = SupabaseReadClient()
backend = InternalBackendClient()

app = Flask(__name__)
enable_local_cors(app)


@dataclass
class PaymentEvent:
    payment_id: str
    artist_user_id: str
    battle_id: str
    amount_usd: float
    dry_run: bool = False


class CircuitBreakerOpen(Exception):
    pass


def _today_key() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def _check_and_reserve_daily_cap(amount_usd: float) -> None:
    doc_id = _today_key()
    day = store.get("cfo_daily_totals", doc_id) or {"total_usd": 0.0}
    new_total = day["total_usd"] + amount_usd
    if new_total > DAILY_CAP_USD:
        raise CircuitBreakerOpen(
            f"Daily cap exceeded: {day['total_usd']} + {amount_usd} > {DAILY_CAP_USD}"
        )
    store.set("cfo_daily_totals", doc_id, {"total_usd": new_total})


def process_payment(event: PaymentEvent) -> dict[str, Any]:
    """Core CFO logic: validate, split, cap-check, payout, log. Idempotent per
    payment_id. Returns a result dict; never raises for expected rejections —
    those are returned as {"status": "rejected", "reason": ...} and still
    logged to BigQuery so the P&L reflects reality."""

    idempotency_key = f"payment:{event.payment_id}"
    existing = store.get("cfo_processed_payments", idempotency_key)
    if existing:
        logger.info("[cfo] Duplicate payment_id %s ignored (idempotent)", event.payment_id)
        return {"status": "duplicate_ignored", "payment_id": event.payment_id}

    row: dict[str, Any] = {
        "event_id": str(uuid.uuid4()),
        "payment_id": event.payment_id,
        "battle_id": event.battle_id,
        "artist_user_id": event.artist_user_id,
        "gross_usd": event.amount_usd,
        "processed_at": time.time(),
    }

    if event.amount_usd <= 0:
        row.update(status="rejected", reason="non_positive_amount")
        ledger.insert_row(row)
        return row

    if event.amount_usd > PER_TX_CAP_USD:
        row.update(status="rejected", reason=f"exceeds_per_tx_cap({PER_TX_CAP_USD})")
        store.add("cfo_alerts", {**row, "alert": "PER_TX_CAP_EXCEEDED"})
        ledger.insert_row(row)
        return row

    try:
        _check_and_reserve_daily_cap(event.amount_usd)
    except CircuitBreakerOpen as exc:
        row.update(status="rejected", reason=str(exc))
        store.add("cfo_alerts", {**row, "alert": "DAILY_CAP_EXCEEDED"})
        ledger.insert_row(row)
        logger.warning("[cfo] Circuit breaker open: %s", exc)
        return row

    artist_wallet = supabase.get_artist_wallet(event.artist_user_id)
    if not artist_wallet:
        row.update(status="rejected", reason="artist_wallet_not_on_file")
        store.add("cfo_alerts", {**row, "alert": "NO_WALLET_ON_FILE"})
        ledger.insert_row(row)
        return row

    artist_amount = round(event.amount_usd * (ARTIST_SPLIT_PCT / 100), 6)
    mtr_amount = round(event.amount_usd - artist_amount, 6)

    row.update(
        artist_split_pct=ARTIST_SPLIT_PCT,
        artist_amount_usd=artist_amount,
        mtr_fee_usd=mtr_amount,
        artist_wallet=artist_wallet,
    )

    if event.dry_run:
        # Verifies every guardrail (idempotency, caps, wallet-of-record
        # lookup) without ever calling the backend's real payout route.
        # No money moves, no BigQuery ledger row is written (nothing
        # actually happened), and idempotency state is not recorded either
        # so a real follow-up call with the same payment_id still goes
        # through normally.
        row.update(status="dry_run_ok")
        return row

    try:
        payout_result = backend.trigger_artist_payout(
            artist_user_id=event.artist_user_id,
            amount_usd=artist_amount,
            reason=f"battle:{event.battle_id}",
            idempotency_key=idempotency_key,
        )
        row.update(status="paid", tx_ref=payout_result.get("txHash") or payout_result.get("id"))
    except Exception as exc:  # noqa: BLE001
        row.update(status="payout_failed", reason=str(exc))
        store.add("cfo_alerts", {**row, "alert": "PAYOUT_CALL_FAILED"})
        logger.error("[cfo] Payout call failed for %s: %s", event.payment_id, exc)

    store.set("cfo_processed_payments", idempotency_key, row, merge=False)
    ledger.insert_row(row)
    return row


@app.route("/health")
def health():
    return jsonify({"status": "ok", "agent": "cfo-agent"})


@app.route("/payout", methods=["POST"])
def payout_endpoint():
    """Called by the Node backend after it has verified the NOWPayments
    signature and confirmed the vote/payment is legitimate."""
    if not SHARED_SECRET or request.headers.get("X-Agent-Secret") != SHARED_SECRET:
        return jsonify({"error": "unauthorized"}), 401

    body = request.get_json(force=True, silent=True) or {}
    try:
        event = PaymentEvent(
            payment_id=str(body["payment_id"]),
            artist_user_id=str(body["artist_user_id"]),
            battle_id=str(body.get("battle_id", "")),
            amount_usd=float(body["amount_usd"]),
            dry_run=bool(body.get("dry_run", False)),
        )
    except (KeyError, ValueError, TypeError) as exc:
        return jsonify({"error": f"invalid payload: {exc}"}), 400

    result = process_payment(event)
    status_code = 200 if result.get("status") in ("paid", "duplicate_ignored", "dry_run_ok") else 402
    return jsonify(result), status_code


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(env("PORT", default="8082")))
