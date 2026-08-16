#!/usr/bin/env bash
# End-to-end demo: 1 artista detectado -> 1 pago recibido -> 1 pago enviado -> log en BigQuery.
#
# Assumes `docker-compose up --build` is already running (scout/cfo/host
# agents + backend reachable at the URLs below). Uses the local fallbacks
# (FIRESTORE_DISABLED/BIGQUERY_DISABLED) unless you've pointed agents/.env at
# real GCP resources, in which case this exercises those for real.
#
# Usage:
#   ARTIST_USER_ID=<a real Supabase users.id with wallet_address set> ./scripts/demo.sh

set -euo pipefail

SCOUT_URL="${SCOUT_AGENT_URL:-http://localhost:8081}"
CFO_URL="${CFO_AGENT_URL:-http://localhost:8082}"
HOST_URL="${HOST_AGENT_URL:-http://localhost:8083}"
CFO_SECRET="${CFO_AGENT_SHARED_SECRET:-dev}"
ARTIST_USER_ID="${ARTIST_USER_ID:-demo-artist-001}"
BATTLE_ID="${BATTLE_ID:-demo-battle-001}"
AMOUNT_USD="${AMOUNT_USD:-10}"

echo "=== 0. Health check ==="
for name_url in "scout:$SCOUT_URL" "cfo:$CFO_URL" "host:$HOST_URL"; do
  name="${name_url%%:*}"
  url="${name_url#*:}"
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url/health" || echo "000")
  echo "  $name -> HTTP $code"
done

echo
echo "=== 1. Artista detectado (Scout Agent) ==="
curl -s -X POST "$SCOUT_URL/run" | tee /tmp/mtr_scout_result.json
echo

echo
echo "=== 2. Pago recibido + enviado (CFO Agent, split 95/5) ==="
PAYMENT_ID="demo-$(date +%s)"
curl -s -X POST "$CFO_URL/payout" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: $CFO_SECRET" \
  -d "{\"payment_id\":\"$PAYMENT_ID\",\"artist_user_id\":\"$ARTIST_USER_ID\",\"battle_id\":\"$BATTLE_ID\",\"amount_usd\":$AMOUNT_USD}" \
  | tee /tmp/mtr_cfo_result.json
echo

echo
echo "=== 3. Host narra el resultado en la batalla ==="
curl -s -X POST "$HOST_URL/narrate" \
  -H "Content-Type: application/json" \
  -d "{\"battle_id\":\"$BATTLE_ID\",\"event_type\":\"hype\"}" \
  | tee /tmp/mtr_host_result.json
echo

echo
echo "=== 4. Log en BigQuery (o fallback local /tmp/bigquery_local.jsonl) ==="
if [ -f /tmp/bigquery_local.jsonl ]; then
  echo "Última fila del ledger:"
  tail -n 1 /tmp/bigquery_local.jsonl
else
  echo "BIGQUERY_DISABLED=false detectado: revisa la tabla mtr_analytics.payments_ledger en BigQuery."
fi

echo
echo "=== Demo completa: ${PAYMENT_ID} ==="
