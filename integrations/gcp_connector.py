"""REST connector used by scripts/tests (and importable by any Python tooling
around the existing Render/Supabase backend) to call the 3 GCP agents.

The production Node backend (server-auto.js) is JS, not Python, so the actual
in-process integration point there is `integrations/gcpConnector.js` (thin
fetch-based twin of this module, same endpoints/contracts). This file is the
one explicitly requested for the hackathon deliverable and is what
scripts/demo.sh and tests/ use end-to-end.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Optional

import requests


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


@dataclass
class GCPAgentsConnector:
    scout_url: str = _env("SCOUT_AGENT_URL", "http://localhost:8081")
    cfo_url: str = _env("CFO_AGENT_URL", "http://localhost:8082")
    host_url: str = _env("HOST_AGENT_URL", "http://localhost:8083")
    cfo_shared_secret: str = _env("CFO_AGENT_SHARED_SECRET", "")
    timeout: int = 30

    def trigger_scout_scan(self) -> dict[str, Any]:
        resp = requests.post(f"{self.scout_url}/run", timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()

    def request_artist_payout(
        self, payment_id: str, artist_user_id: str, battle_id: str, amount_usd: float
    ) -> dict[str, Any]:
        resp = requests.post(
            f"{self.cfo_url}/payout",
            json={
                "payment_id": payment_id,
                "artist_user_id": artist_user_id,
                "battle_id": battle_id,
                "amount_usd": amount_usd,
            },
            headers={"X-Agent-Secret": self.cfo_shared_secret},
            timeout=self.timeout,
        )
        return resp.json()

    def request_host_narration(
        self, battle_id: str, event_type: str = "hype", message: str = ""
    ) -> dict[str, Any]:
        resp = requests.post(
            f"{self.host_url}/narrate",
            json={"battle_id": battle_id, "event_type": event_type, "message": message},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.json()

    def health_check_all(self) -> dict[str, Optional[bool]]:
        results: dict[str, Optional[bool]] = {}
        for name, url in (("scout", self.scout_url), ("cfo", self.cfo_url), ("host", self.host_url)):
            try:
                resp = requests.get(f"{url}/health", timeout=5)
                results[name] = resp.ok
            except Exception:  # noqa: BLE001
                results[name] = False
        return results
