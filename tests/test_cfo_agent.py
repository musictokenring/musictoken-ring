import cfo_agent
from cfo_agent import PaymentEvent, process_payment


def _reset_state():
    cfo_agent.store._memory.clear()


def test_rejects_non_positive_amount():
    _reset_state()
    result = process_payment(PaymentEvent("p1", "artist1", "battle1", 0))
    assert result["status"] == "rejected"
    assert result["reason"] == "non_positive_amount"


def test_rejects_amount_over_per_tx_cap():
    _reset_state()
    over_cap = cfo_agent.PER_TX_CAP_USD + 1
    result = process_payment(PaymentEvent("p2", "artist1", "battle1", over_cap))
    assert result["status"] == "rejected"
    assert "exceeds_per_tx_cap" in result["reason"]


def test_rejects_when_no_wallet_on_file(monkeypatch):
    _reset_state()
    monkeypatch.setattr(cfo_agent.supabase, "get_artist_wallet", lambda uid: None)
    result = process_payment(PaymentEvent("p3", "artist-no-wallet", "battle1", 10))
    assert result["status"] == "rejected"
    assert result["reason"] == "artist_wallet_not_on_file"


def test_never_trusts_payload_wallet_uses_supabase_lookup(monkeypatch):
    """The PaymentEvent has no wallet field at all — process_payment can only
    ever pay out to whatever Supabase returns for the artist_user_id. This
    test pins that contract so a future change can't accidentally start
    trusting a caller-supplied wallet."""
    _reset_state()
    assert not hasattr(PaymentEvent, "wallet_address")

    monkeypatch.setattr(cfo_agent.supabase, "get_artist_wallet", lambda uid: "0xVERIFIED")
    monkeypatch.setattr(
        cfo_agent.backend, "trigger_artist_payout", lambda **kwargs: {"txHash": "0xabc"}
    )
    result = process_payment(PaymentEvent("p4", "artist1", "battle1", 10))
    assert result["artist_wallet"] == "0xVERIFIED"
    assert result["status"] == "paid"


def test_split_is_95_5_by_default(monkeypatch):
    _reset_state()
    monkeypatch.setattr(cfo_agent.supabase, "get_artist_wallet", lambda uid: "0xVERIFIED")
    monkeypatch.setattr(
        cfo_agent.backend, "trigger_artist_payout", lambda **kwargs: {"txHash": "0xabc"}
    )
    result = process_payment(PaymentEvent("p5", "artist1", "battle1", 100))
    assert result["artist_amount_usd"] == 95
    assert result["mtr_fee_usd"] == 5


def test_duplicate_payment_id_is_idempotent(monkeypatch):
    _reset_state()
    monkeypatch.setattr(cfo_agent.supabase, "get_artist_wallet", lambda uid: "0xVERIFIED")
    monkeypatch.setattr(
        cfo_agent.backend, "trigger_artist_payout", lambda **kwargs: {"txHash": "0xabc"}
    )
    first = process_payment(PaymentEvent("dup1", "artist1", "battle1", 10))
    second = process_payment(PaymentEvent("dup1", "artist1", "battle1", 10))
    assert first["status"] == "paid"
    assert second["status"] == "duplicate_ignored"


def test_daily_cap_circuit_breaker_trips(monkeypatch):
    _reset_state()
    monkeypatch.setattr(cfo_agent.supabase, "get_artist_wallet", lambda uid: "0xVERIFIED")
    monkeypatch.setattr(
        cfo_agent.backend, "trigger_artist_payout", lambda **kwargs: {"txHash": "0xabc"}
    )
    monkeypatch.setattr(cfo_agent, "DAILY_CAP_USD", 15)

    first = process_payment(PaymentEvent("d1", "artist1", "battle1", 10))
    second = process_payment(PaymentEvent("d2", "artist1", "battle1", 10))

    assert first["status"] == "paid"
    assert second["status"] == "rejected"
    assert "Daily cap exceeded" in second["reason"]


def test_payout_endpoint_requires_shared_secret():
    client = cfo_agent.app.test_client()
    resp = client.post("/payout", json={})
    assert resp.status_code == 401


def test_dry_run_never_calls_backend_payout(monkeypatch):
    _reset_state()
    monkeypatch.setattr(cfo_agent.supabase, "get_artist_wallet", lambda uid: "0xVERIFIED")

    called = {"count": 0}

    def _should_never_run(**kwargs):
        called["count"] += 1
        return {"txHash": "0xshouldnothappen"}

    monkeypatch.setattr(cfo_agent.backend, "trigger_artist_payout", _should_never_run)

    result = process_payment(PaymentEvent("dry1", "artist1", "battle1", 10, dry_run=True))

    assert result["status"] == "dry_run_ok"
    assert result["artist_wallet"] == "0xVERIFIED"
    assert result["artist_amount_usd"] == 9.5
    assert called["count"] == 0, "dry_run must never call the real payout backend"


def test_dry_run_still_respects_caps_and_wallet_checks(monkeypatch):
    _reset_state()
    monkeypatch.setattr(cfo_agent.supabase, "get_artist_wallet", lambda uid: None)
    result = process_payment(PaymentEvent("dry2", "artist-no-wallet", "battle1", 10, dry_run=True))
    assert result["status"] == "rejected"
    assert result["reason"] == "artist_wallet_not_on_file"


def test_payout_endpoint_happy_path(monkeypatch):
    _reset_state()
    monkeypatch.setattr(cfo_agent.supabase, "get_artist_wallet", lambda uid: "0xVERIFIED")
    monkeypatch.setattr(
        cfo_agent.backend, "trigger_artist_payout", lambda **kwargs: {"txHash": "0xabc"}
    )
    client = cfo_agent.app.test_client()
    resp = client.post(
        "/payout",
        json={"payment_id": "e1", "artist_user_id": "a1", "battle_id": "b1", "amount_usd": 10},
        headers={"X-Agent-Secret": cfo_agent.SHARED_SECRET},
    )
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "paid"
