# MTR AI-Native Ops Agents

Three agents that wrap the existing MusicTokenRing platform (Vercel + Render +
Supabase + NOWPayments + on-chain MTR) with autonomous operations, built on
Google Cloud (Vertex AI / Gemini 2.5 Pro, Cloud Run, Cloud Functions,
Firestore, BigQuery, Secret Manager). None of them replace the existing
frontend/backend/DB — they call into it and are called by it over REST.

## 1. Scout Agent (`scout_agent.py`) — A&R IA

- **Trigger:** Cloud Scheduler → `POST /run` hourly.
- **Does:** Pulls Deezer's trending-artist chart, compares fan counts to the
  last hourly snapshot (Firestore), flags anyone with ≥20% growth
  (`SCOUT_GROWTH_THRESHOLD_PCT`), emails an invite to create an MTR battle,
  and logs the detection.
- **Never touches money.**
- **Try it locally:**
  ```bash
  cd agents && FIRESTORE_DISABLED=true python scout_agent.py
  ```

## 2. CFO Agent (`cfo_agent.py`) — payments-agent

- **Trigger:** `POST /payout`, called **only** by the existing Node backend
  (`backend/server-auto.js`) after it has already verified the NOWPayments
  webhook signature. This agent is not exposed to the public internet as a
  payment webhook — see [ARCHITECTURE.md](../ARCHITECTURE.md#security-rationale)
  for why.
- **Does:** 95/5 artist/MTR split, per-tx and daily cap enforcement with a
  circuit breaker, idempotent per `payment_id`, looks the artist's payout
  wallet up in Supabase (never trusts the caller's payload for that), and
  delegates the actual on-chain/custody transfer to the existing
  `prize-service.js::sendPrize` via a new internal route
  (`POST /api/internal/agent-payout`) instead of holding its own private key.
  Every attempt (paid, rejected, or capped) is written to BigQuery.
- **Why it's built this way:** see the fund-leak/vulnerability history in
  `../ANALISIS-VULNERABILIDAD-CONFIRMADA.md` — this agent is designed to not
  repeat that exact class of bug.
- **Try it locally:**
  ```bash
  cd agents && FIRESTORE_DISABLED=true BIGQUERY_DISABLED=true CFO_AGENT_SHARED_SECRET=dev python cfo_agent.py
  curl -X POST localhost:8082/payout -H "X-Agent-Secret: dev" -H "Content-Type: application/json" \
    -d '{"payment_id":"demo1","artist_user_id":"<a-real-supabase-user-id>","battle_id":"b1","amount_usd":10}'
  ```

## 3. Host Agent (`host_agent.py`) — battle-host-agent

- **Trigger:** `POST /narrate`, called by the Vercel frontend during an
  active battle.
- **Does:** Uses Vertex AI Gemini 2.5 Pro, grounded with live battle context
  (scores, artists) read from Supabase, to narrate events, hype voting, and
  answer fan questions. Falls back to a deterministic reply if Vertex AI
  credentials aren't configured (so local/dev and the demo never hard-fail).
  Never touches money or wallets.
- **Try it locally:**
  ```bash
  cd agents && python host_agent.py
  curl -X POST localhost:8083/narrate -H "Content-Type: application/json" \
    -d '{"battle_id":"b1","event_type":"hype"}'
  ```

## Running all three together

```bash
cp agents/.env.example agents/.env   # fill in Supabase/Deezer/NOWPayments values
docker-compose up --build
```

## Tests

```bash
python -m venv .venv && . .venv/Scripts/activate  # or source .venv/bin/activate
pip install -r agents/requirements.txt
pytest tests/ -q
```
