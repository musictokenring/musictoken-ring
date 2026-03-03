# Script PowerShell para verificar deployment en Vercel

Write-Host "🔍 Verificando deployment de MusicTokenRing..." -ForegroundColor Cyan
Write-Host ""

$BACKEND_URL = if ($env:BACKEND_URL) { $env:BACKEND_URL } else { "https://musictoken-backend.onrender.com" }
$VERCEL_URL = if ($env:VERCEL_URL) { $env:VERCEL_URL } else { "https://musictokenring.vercel.app" }

Write-Host "📡 Verificando endpoints del backend..." -ForegroundColor Yellow
Write-Host ""

# 1. Health check
Write-Host "1. Health Check (/api/health):" -ForegroundColor Cyan
try {
    $healthResponse = Invoke-RestMethod -Uri "$BACKEND_URL/api/health" -Method Get -ErrorAction Stop
    Write-Host "✅ Health check OK" -ForegroundColor Green
    $healthResponse | ConvertTo-Json -Depth 3
} catch {
    Write-Host "❌ Health check falló: $_" -ForegroundColor Red
}
Write-Host ""

# 2. Price endpoint
Write-Host "2. Price Endpoint (/api/price):" -ForegroundColor Cyan
try {
    $priceResponse = Invoke-RestMethod -Uri "$BACKEND_URL/api/price" -Method Get -ErrorAction Stop
    Write-Host "✅ Price endpoint OK" -ForegroundColor Green
    $priceResponse | ConvertTo-Json -Depth 3
} catch {
    Write-Host "⚠️  Price endpoint no disponible (puede ser normal si aún no se inicializó): $_" -ForegroundColor Yellow
}
Write-Host ""

# 3. Verificar frontend
Write-Host "3. Frontend (Vercel):" -ForegroundColor Cyan
try {
    $frontendResponse = Invoke-WebRequest -Uri $VERCEL_URL -Method Get -UseBasicParsing -ErrorAction Stop
    if ($frontendResponse.StatusCode -eq 200) {
        Write-Host "✅ Frontend accesible (HTTP $($frontendResponse.StatusCode))" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Frontend respondió con HTTP $($frontendResponse.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Error al verificar frontend: $_" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "✅ Verificación completada" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Próximos pasos:" -ForegroundColor Cyan
Write-Host "   1. Verifica los logs en Vercel Dashboard → Deployments" -ForegroundColor White
Write-Host "   2. Verifica que las variables de entorno estén configuradas" -ForegroundColor White
Write-Host "   3. Prueba hacer un depósito para verificar que funciona" -ForegroundColor White
