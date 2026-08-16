import scout_agent


def test_compute_growth_no_baseline_returns_none():
    scout_agent.store._memory.clear()
    artist = {"id": 1, "name": "New Artist", "nb_fan": 1000}
    assert scout_agent.compute_growth(artist) is None


def test_compute_growth_detects_threshold_breach():
    scout_agent.store._memory.clear()
    scout_agent.store.set(
        scout_agent.SNAPSHOT_COLLECTION, "1", {"artist_id": "1", "nb_fan": 1000}
    )
    artist = {"id": 1, "name": "Rising Star", "nb_fan": 1250, "link": "https://deezer.com/1"}
    detection = scout_agent.compute_growth(artist)
    assert detection is not None
    assert detection["growth_pct"] == 25.0


def test_compute_growth_below_threshold_returns_none():
    scout_agent.store._memory.clear()
    scout_agent.store.set(scout_agent.SNAPSHOT_COLLECTION, "2", {"artist_id": "2", "nb_fan": 1000})
    artist = {"id": 2, "name": "Steady Artist", "nb_fan": 1050}
    assert scout_agent.compute_growth(artist) is None


def test_send_invite_without_smtp_config_is_noop(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    detection = {"name": "X", "growth_pct": 30, "prev_fans": 10, "current_fans": 13, "deezer_link": "l"}
    assert scout_agent.send_invite(detection) is False


def test_run_scan_logs_detections(monkeypatch):
    scout_agent.store._memory.clear()
    scout_agent.store.set(scout_agent.SNAPSHOT_COLLECTION, "9", {"artist_id": "9", "nb_fan": 100})

    monkeypatch.setattr(
        scout_agent,
        "fetch_trending_artists",
        lambda limit=50: [{"id": 9, "name": "Grower", "nb_fan": 130, "link": "l"}],
    )
    monkeypatch.setattr(scout_agent, "send_invite", lambda detection: False)

    detections = scout_agent.run_scan()
    assert len(detections) == 1
    assert detections[0]["name"] == "Grower"
