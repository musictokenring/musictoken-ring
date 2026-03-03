# Script para crear PR automáticamente para prod-ready-logic

$repoOwner = "musictokenring"
$repoName = "musictoken-ring"
$baseBranch = "main"
$headBranch = "prod-ready-logic"
$prTitle = "Fix: logica apuestas/juego real-time"

$prBody = @"
## Fix: Logica apuestas/juego real-time

### Cambios implementados:

#### 1. Modulo StreamsRealtime (src/streams-realtime.js)
- Integracion con APIs Deezer/Twitch para datos de streams en tiempo real
- WebSocket/API polling para actualizaciones cada 5 segundos
- Manejo de estado real-time con patron useState
- Fallback automatico entre WebSocket y polling
- Error handling robusto con limite de reintentos

#### 2. Mejoras en Game Engine (game-engine.js)
- Validacion de apuesta minima (100 MTR) en todos los modos
- Integracion con StreamsRealtime para datos reales durante batallas
- Logica mejorada de determinacion de ganador basada en % streams reales
- Payout on-chain mejorado con validacion de direccion y monto
- Fallback a calculo simulado si APIs fallan
- Limpieza automatica de tracking al finalizar batallas

#### 3. Tests (tests/bet-logic.test.js)
- Tests de validacion de apuesta minima
- Tests de calculo de porcentajes de streams
- Tests de determinacion de ganador
- Tests de calculo de payout
- Tests de validacion on-chain
- Tests de manejo de errores

### Archivos modificados:
- src/streams-realtime.js (nuevo, 295 lineas)
- game-engine.js (+179 lineas)
- index.html (+1 linea para cargar modulo)
- tests/bet-logic.test.js (nuevo, 189 lineas)

### Estadisticas:
- Total cambios: +641 lineas, -23 lineas
- Archivos nuevos: 2
- Archivos modificados: 2

### Testing:
Ejecutar tests con: npm test o jest tests/bet-logic.test.js

### Checklist:
- [x] Validacion de apuesta minima (100 MTR)
- [x] Integracion APIs Deezer/Twitch
- [x] WebSocket/API polling implementado
- [x] Determinacion de ganador basada en % streams
- [x] Payout on-chain con error handling
- [x] Manejo de estado real-time
- [x] Tests agregados
"@

# Intentar obtener token de variables de entorno
if (-not $env:GITHUB_TOKEN) {
    $env:GITHUB_TOKEN = $env:GH_TOKEN
}

if (-not $env:GITHUB_TOKEN) {
    Write-Host "No se encontro GITHUB_TOKEN en variables de entorno" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Opcion 1: Configurar token manualmente:"
    Write-Host "  `$env:GITHUB_TOKEN = 'tu-token-aqui'"
    Write-Host "  .\create-pr-prod-ready.ps1"
    Write-Host ""
    Write-Host "Opcion 2: Crear PR manualmente en GitHub:"
    Write-Host "  https://github.com/$repoOwner/$repoName/pull/new/$headBranch"
    Write-Host ""
    Write-Host "El cuerpo del PR se ha guardado en pr-body.txt"
    $prBody | Out-File -FilePath "pr-body.txt" -Encoding utf8
    exit 1
}

# Crear el PR usando GitHub API
$headers = @{
    "Authorization" = "token $env:GITHUB_TOKEN"
    "Accept" = "application/vnd.github.v3+json"
    "Content-Type" = "application/json"
}

$body = @{
    title = $prTitle
    body = $prBody
    head = $headBranch
    base = $baseBranch
} | ConvertTo-Json -Depth 10

Write-Host "Creando Pull Request..." -ForegroundColor Cyan
Write-Host "  Repo: $repoOwner/$repoName" -ForegroundColor Gray
Write-Host "  Base: $baseBranch" -ForegroundColor Gray
Write-Host "  Head: $headBranch" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$repoOwner/$repoName/pulls" `
        -Method Post `
        -Headers $headers `
        -Body $body `
        -ErrorAction Stop

    Write-Host "Pull Request creado exitosamente!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Detalles del PR:" -ForegroundColor Cyan
    Write-Host "  Numero: #$($response.number)" -ForegroundColor White
    Write-Host "  Titulo: $($response.title)" -ForegroundColor White
    Write-Host "  Estado: $($response.state)" -ForegroundColor White
    Write-Host "  URL: $($response.html_url)" -ForegroundColor White
    Write-Host ""
    Write-Host "Abrir PR: $($response.html_url)" -ForegroundColor Yellow
    
    # Abrir en navegador
    Start-Process $response.html_url
    
} catch {
    Write-Host "Error al crear el PR:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($errorDetails.errors) {
            Write-Host ""
            Write-Host "Errores detallados:" -ForegroundColor Yellow
            $errorDetails.errors | ForEach-Object {
                Write-Host "  - $($_.message)" -ForegroundColor Red
            }
        } else {
            Write-Host $_.ErrorDetails.Message -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "Alternativa: Crear PR manualmente en:" -ForegroundColor Yellow
    Write-Host "  https://github.com/$repoOwner/$repoName/pull/new/$headBranch" -ForegroundColor White
    Write-Host ""
    Write-Host "El cuerpo del PR se ha guardado en pr-body.txt" -ForegroundColor Gray
    $prBody | Out-File -FilePath "pr-body.txt" -Encoding utf8
    exit 1
}
