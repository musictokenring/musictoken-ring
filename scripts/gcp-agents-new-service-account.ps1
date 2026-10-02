# Mueve los 4 agentes de Cloud Run (curator, host, scout, cfo) a una cuenta de
# servicio propia, porque Google Trust & Safety deshabilitó la cuenta por
# defecto (287417719690-compute@developer) al suspender el proyecto en
# septiembre y, aunque el proyecto ya se reactivó, esa cuenta no se puede
# volver a habilitar desde nuestro lado ("disabled for a different reason").
#
# Permisos mínimos que usan los agentes (ver agents/common.py y
# agents/*_agent.py): Vertex AI (Gemini), Secret Manager, Firestore y BigQuery.
# Solo cambia la cuenta con la que corre cada servicio: misma imagen, mismas
# variables de entorno.
#
# Uso (PowerShell, logueado en gcloud como devglobalappsystems@gmail.com):
#   .\scripts\gcp-agents-new-service-account.ps1

$ErrorActionPreference = 'Stop'
$project = 'mtr-ai-ops-2026'
$region = 'us-central1'
$saName = 'mtr-agents'
$sa = "$saName@$project.iam.gserviceaccount.com"

function Run($cmd) {
    Write-Host "> $cmd" -ForegroundColor Cyan
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) { throw "Falló: $cmd" }
}

$exists = gcloud iam service-accounts list --project $project --filter="email=$sa" --format='value(email)'
if (-not $exists) {
    Run "gcloud iam service-accounts create $saName --project $project --display-name 'MTR agents (Cloud Run)'"
} else {
    Write-Host "La cuenta $sa ya existe, sigo." -ForegroundColor Yellow
}

foreach ($role in @(
    'roles/aiplatform.user',
    'roles/secretmanager.secretAccessor',
    'roles/datastore.user',
    'roles/bigquery.dataEditor',
    'roles/bigquery.jobUser',
    'roles/logging.logWriter'
)) {
    Run "gcloud projects add-iam-policy-binding $project --member serviceAccount:$sa --role $role --condition=None --quiet"
}

foreach ($svc in @('curator-agent', 'host-agent', 'scout-agent', 'cfo-agent')) {
    Run "gcloud run services update $svc --region $region --project $project --service-account $sa --quiet"
}

Write-Host ''
Write-Host 'Listo. Probando el curador...' -ForegroundColor Green
$body = '{"artist":"Soda Stereo","title":"De Musica Ligera","genreLabel":"Rock en espanol"}'
Invoke-RestMethod -Method Post -ContentType 'application/json' -Body $body `
    -Uri 'https://curator-agent-287417719690.us-central1.run.app/curate' | ConvertTo-Json
