# Deploying the AI-Native Ops Layer to Google Cloud

Targets the [GCP Free Tier](https://cloud.google.com/free). A billing account
still has to be linked to the project (free-tier usage isn't charged, but
Cloud Run/Functions/Scheduler all require billing to be enabled).

## Live URLs (mtr-ai-ops-2026)

| Service     | URL                                                          | Access                          |
|-------------|---------------------------------------------------------------|----------------------------------|
| scout-agent | https://scout-agent-287417719690.us-central1.run.app          | public (read-only ops, no $)     |
| cfo-agent   | https://cfo-agent-287417719690.us-central1.run.app             | **IAM-locked** (run.invoker only)|
| host-agent  | https://host-agent-287417719690.us-central1.run.app            | public (no DB creds yet — see "Known follow-up" in ARCHITECTURE.md) |

Cloud Scheduler `scout-hourly-scan` runs every hour on the hour (`0 * * * *`, UTC).

## Status (updated during the hackathon build)

Project **`mtr-ai-ops-2026`** already exists, billed on account
`0114F6-100E75-82AE8E`, with these APIs enabled: Cloud Run, Cloud Functions,
Cloud Scheduler, Firestore (native, `us-central1`), BigQuery
(`mtr_analytics.payments_ledger` table created), Secret Manager (7 secrets
created with `REPLACE_ME` placeholders — fill real values with
`echo -n "<value>" | gcloud secrets versions add SECRET_NAME --data-file=-`),
Vertex AI, Artifact Registry, Cloud Build.

**IAM role bindings (`add-iam-policy-binding`) must be run by you directly**,
not through this session — granting IAM/security permissions is a category
of action this environment blocks Claude Code from executing on your behalf,
even with prior authorization. Run the block below yourself in a terminal
where `gcloud` is authenticated as you (it already is, from the login done
during this session) before the deployed services will have working access
to secrets/Firestore/BigQuery/Vertex AI:

```powershell
$PROJECT_NUMBER = gcloud projects describe mtr-ai-ops-2026 --format="value(projectNumber)"
$sa = "serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

foreach ($s in @("DEEZER_API_KEY","NOWPAYMENTS_API_KEY","NOWPAYMENTS_WEBHOOK_SECRET","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","BACKEND_INTERNAL_SECRET","CFO_AGENT_SHARED_SECRET")) {
  gcloud secrets add-iam-policy-binding $s --member=$sa --role="roles/secretmanager.secretAccessor" --project=mtr-ai-ops-2026
}
gcloud projects add-iam-policy-binding mtr-ai-ops-2026 --member=$sa --role="roles/aiplatform.user"
gcloud projects add-iam-policy-binding mtr-ai-ops-2026 --member=$sa --role="roles/datastore.user"
gcloud projects add-iam-policy-binding mtr-ai-ops-2026 --member=$sa --role="roles/bigquery.dataEditor"
```

## 0. Prerequisites (already done for mtr-ai-ops-2026 — kept for reference / new environments)

```bash
gcloud auth login
gcloud projects create mtr-ai-ops-2026 --name="MTR AI Ops"
gcloud config set project mtr-ai-ops-2026
gcloud billing projects link mtr-ai-ops-2026 --billing-account=<YOUR_BILLING_ACCOUNT_ID>

gcloud services enable \
  run.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudscheduler.googleapis.com \
  firestore.googleapis.com \
  bigquery.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  artifactregistry.googleapis.com
```

## 1. Secret Manager — Deezer / NOWPayments / internal secrets

```bash
echo -n "<DEEZER_API_KEY>"          | gcloud secrets create DEEZER_API_KEY --data-file=-
echo -n "<NOWPAYMENTS_API_KEY>"     | gcloud secrets create NOWPAYMENTS_API_KEY --data-file=-
echo -n "<NOWPAYMENTS_WEBHOOK_SECRET>" | gcloud secrets create NOWPAYMENTS_WEBHOOK_SECRET --data-file=-
echo -n "<SUPABASE_SERVICE_ROLE_KEY>" | gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=-
echo -n "<BACKEND_INTERNAL_SECRET>"   | gcloud secrets create BACKEND_INTERNAL_SECRET --data-file=-
echo -n "<CFO_AGENT_SHARED_SECRET>"   | gcloud secrets create CFO_AGENT_SHARED_SECRET --data-file=-
```

Grant the Cloud Run/Functions runtime service account access:

```bash
PROJECT_NUMBER=$(gcloud projects describe mtr-ai-ops-2026 --format='value(projectNumber)')
for SECRET in DEEZER_API_KEY NOWPAYMENTS_API_KEY NOWPAYMENTS_WEBHOOK_SECRET \
              SUPABASE_SERVICE_ROLE_KEY BACKEND_INTERNAL_SECRET CFO_AGENT_SHARED_SECRET; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

## 2. Firestore (native mode)

```bash
gcloud firestore databases create --location=us-central1 --type=firestore-native
```

## 3. BigQuery dataset/table for the payments ledger

```bash
bq mk --dataset --location=us-central1 mtr-ai-ops-2026:mtr_analytics

bq mk --table mtr-ai-ops-2026:mtr_analytics.payments_ledger \
  event_id:STRING,payment_id:STRING,battle_id:STRING,artist_user_id:STRING,\
gross_usd:FLOAT,artist_split_pct:FLOAT,artist_amount_usd:FLOAT,mtr_fee_usd:FLOAT,\
artist_wallet:STRING,status:STRING,reason:STRING,tx_ref:STRING,processed_at:TIMESTAMP
```

## 4. Scout Agent — Cloud Run + Cloud Scheduler

```bash
gcloud builds submit --tag gcr.io/mtr-ai-ops-2026/scout-agent \
  --config <(cat <<'EOF'
steps:
- name: gcr.io/cloud-builders/docker
  args: ['build', '-f', 'agents/Dockerfile', '-t', 'gcr.io/mtr-ai-ops-2026/scout-agent', '.']
images: ['gcr.io/mtr-ai-ops-2026/scout-agent']
EOF
) .

gcloud run deploy scout-agent \
  --image gcr.io/mtr-ai-ops-2026/scout-agent \
  --region us-central1 \
  --no-allow-unauthenticated \
  --set-env-vars USE_SECRET_MANAGER=true,GCP_PROJECT_ID=mtr-ai-ops-2026,RUN_MODE=http \
  --set-secrets DEEZER_API_KEY=DEEZER_API_KEY:latest \
  --command gunicorn --args="--bind,0.0.0.0:8080,--chdir,agents,scout_agent:app"

SCOUT_URL=$(gcloud run services describe scout-agent --region us-central1 --format='value(status.url)')

gcloud scheduler jobs create http scout-hourly-scan \
  --schedule="0 * * * *" \
  --uri="${SCOUT_URL}/run" \
  --http-method=POST \
  --oidc-service-account-email="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
```

## 5. CFO Agent — Cloud Function (2nd gen, HTTP)

```bash
gcloud functions deploy cfo-agent \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=agents \
  --entry-point=app \
  --trigger-http \
  --no-allow-unauthenticated \
  --set-env-vars USE_SECRET_MANAGER=true,GCP_PROJECT_ID=mtr-ai-ops-2026,BACKEND_URL=https://musictoken-ring.onrender.com \
  --set-secrets NOWPAYMENTS_WEBHOOK_SECRET=NOWPAYMENTS_WEBHOOK_SECRET:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,BACKEND_INTERNAL_SECRET=BACKEND_INTERNAL_SECRET:latest,CFO_AGENT_SHARED_SECRET=CFO_AGENT_SHARED_SECRET:latest
```

> `--entry-point=app` expects a WSGI `app` object — for a raw Cloud Function
> deploy, add a one-line `main.py` in `agents/` re-exporting
> `from cfo_agent import app` (or deploy it as a Cloud Run service exactly
> like the scout/host agents, which is simpler and what the provided
> `docker-compose.yml` / Dockerfile already support — recommended for the
> hackathon demo).

Then, in Render's environment variables for the existing backend, set:

```
CFO_AGENT_URL=<the deployed CFO agent URL>
CFO_AGENT_SHARED_SECRET=<same value as the CFO_AGENT_SHARED_SECRET secret above>
BACKEND_INTERNAL_SECRET=<same value already used by requireInternalSecret>
```

and call `integrations/gcpConnector.js::requestArtistPayout(...)` from the
NOWPayments webhook handler in `backend/server-auto.js` once a battle-vote
payment is confirmed.

## 6. Host Agent — Cloud Run

```bash
gcloud run deploy host-agent \
  --image gcr.io/mtr-ai-ops-2026/host-agent \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GCP_PROJECT_ID=mtr-ai-ops-2026,GCP_REGION=us-central1,HOST_AGENT_MODEL=gemini-2.5-flash \
  --set-secrets SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest
```

Grant the runtime service account Vertex AI access:

```bash
gcloud projects add-iam-policy-binding mtr-ai-ops-2026 \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

Point the Vercel frontend's battle UI at `${HOST_URL}/narrate`.

## 7. Verify

```bash
curl ${SCOUT_URL}/health
curl ${CFO_URL}/health -H "Authorization: Bearer $(gcloud auth print-identity-token)"
curl ${HOST_URL}/health
```

Then run `bash scripts/demo.sh` for the end-to-end scenario used in the
hackathon submission.
