import host_agent


def test_build_battle_context_without_data_is_safe(monkeypatch):
    monkeypatch.setattr(host_agent.supabase, "get_active_battle", lambda battle_id: None)
    context = host_agent.build_battle_context("missing-battle")
    assert "missing-battle" in context


def test_generate_reply_falls_back_without_vertex_credentials(monkeypatch):
    """No GCP_PROJECT_ID / Vertex AI credentials configured in the test env ->
    generate_reply must never raise, it must use the deterministic fallback."""
    monkeypatch.delenv("GCP_PROJECT_ID", raising=False)
    monkeypatch.setattr(host_agent.supabase, "get_active_battle", lambda battle_id: None)
    reply = host_agent.generate_reply("b1", "hype")
    assert isinstance(reply, str)
    assert len(reply) > 0


def test_fallback_reply_never_leaks_internal_terms():
    reply = host_agent._fallback_reply("hype", "Batalla b1 — A vs B. Marcador: 3 - 2.")
    forbidden = ["private_key", "wallet_address", "secret", "vault_wallet"]
    assert not any(term in reply.lower() for term in forbidden)


def test_narrate_endpoint_requires_battle_id():
    client = host_agent.app.test_client()
    resp = client.post("/narrate", json={"event_type": "hype"})
    assert resp.status_code == 400


def test_narrate_endpoint_happy_path(monkeypatch):
    monkeypatch.setattr(host_agent, "generate_reply", lambda battle_id, event_type, user_message="": "¡Vamos!")
    client = host_agent.app.test_client()
    resp = client.post("/narrate", json={"battle_id": "b1", "event_type": "hype"})
    assert resp.status_code == 200
    assert resp.get_json()["reply"] == "¡Vamos!"
