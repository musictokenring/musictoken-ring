# Script para crear PR automáticamente usando GitHub API

$repoOwner = "musictokenring"
$repoName = "musictoken-ring"
$baseBranch = "main"
$headBranch = "cursor/development-environment-setup-d3d0"
$prTitle = "Fix: Ajuste preciso de alineación vertical - Foto de perfil perfectamente centrada"
$prBody = @"
## Cambios realizados

### Ajustes de alineación vertical precisos:
- ✅ Cambiado a `inline-flex` para mejor control vertical
- ✅ `vertical-align: middle` en todos los elementos clave
- ✅ Eliminado padding innecesario del `.user-profile`
- ✅ Ajustado `line-height` del nombre a 1.2
- ✅ Avatar perfectamente centrado verticalmente (36px)

### Mejoras vs versión anterior:
- **Avatar:** 36px (reducido de 40px para evitar corte superior)
- **Alineación:** Perfecta con nombre y botón "Salir"
- **Espaciado:** Gap 10px (mejorado de 8px)
- **Padding header:** 12px 0 para más espacio vertical

## Commits incluidos
- \`1510c2d\` - Fix: Ajuste preciso de alineación vertical
- \`8d1c8d6\` - Merge: Resolver conflicto en styles/main.css
- \`4e07628\` - Fix: Ajuste fino de posicionamiento foto de perfil

## Verificación
- [x] Avatar no se corta en la parte superior
- [x] Alineación vertical perfecta con nombre
- [x] Botón "Salir" correctamente posicionado
- [x] Responsive funcionando
- [x] Hover effects funcionando

**Después del merge, Vercel desplegará automáticamente en ~1-2 minutos.**
"@

# Intentar obtener token de variables de entorno
if (-not $env:GITHUB_TOKEN) {
    $env:GITHUB_TOKEN = $env:GH_TOKEN
}

if (-not $env:GITHUB_TOKEN) {
    Write-Host "⚠️  No se encontró GITHUB_TOKEN en variables de entorno" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Opción 1: Configurar token manualmente:"
    Write-Host "  `$env:GITHUB_TOKEN = 'tu-token-aqui'"
    Write-Host "  .\create-pr-auto.ps1"
    Write-Host ""
    Write-Host "Opción 2: Crear PR manualmente desde:"
    Write-Host "  https://github.com/$repoOwner/$repoName/compare/$baseBranch...$headBranch"
    Write-Host ""
    exit 1
}

$headers = @{
    "Accept" = "application/vnd.github.v3+json"
    "Authorization" = "token $env:GITHUB_TOKEN"
    "User-Agent" = "PowerShell-Script"
}

$body = @{
    title = $prTitle
    body = $prBody
    head = $headBranch
    base = $baseBranch
} | ConvertTo-Json -Depth 10

Write-Host "🚀 Creando Pull Request..." -ForegroundColor Cyan
Write-Host "   Base: $baseBranch" -ForegroundColor Gray
Write-Host "   Head: $headBranch" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$repoOwner/$repoName/pulls" `
        -Method Post `
        -Headers $headers `
        -Body $body `
        -ContentType "application/json"
    
    Write-Host "✅ Pull Request creado exitosamente!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Detalles del PR:" -ForegroundColor Cyan
    Write-Host "   Número: #$($response.number)" -ForegroundColor White
    Write-Host "   Título: $($response.title)" -ForegroundColor White
    Write-Host "   URL: $($response.html_url)" -ForegroundColor White
    Write-Host "   Estado: $($response.state)" -ForegroundColor White
    Write-Host ""
    
    # Abrir el PR en el navegador
    Start-Process $response.html_url
    
    Write-Host "🌐 PR abierto en tu navegador" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Próximos pasos:" -ForegroundColor Cyan
    Write-Host "   1. Revisa el PR en GitHub"
    Write-Host "   2. Haz clic en 'Merge pull request'"
    Write-Host "   3. Espera 1-2 minutos para deploy de Vercel"
    Write-Host "   4. Verifica en: https://musictoken-ring.vercel.app"
    Write-Host ""
    
    return $response
}
catch {
    $errorDetails = $_.Exception.Message
    Write-Host "❌ Error creando PR: $errorDetails" -ForegroundColor Red
    Write-Host ""
    
    if ($errorDetails -match "401" -or $errorDetails -match "403") {
        Write-Host "💡 Problema de autenticación:" -ForegroundColor Yellow
        Write-Host "   - Verifica que tu token tenga permisos de repo"
        Write-Host "   - Crea un token en: https://github.com/settings/tokens"
        Write-Host ""
    }
    
    Write-Host "🔗 Crea el PR manualmente desde:" -ForegroundColor Cyan
    Write-Host "   https://github.com/$repoOwner/$repoName/compare/$baseBranch...$headBranch?expand=1&title=$([System.Web.HttpUtility]::UrlEncode($prTitle))&body=$([System.Web.HttpUtility]::UrlEncode($prBody))"
    Write-Host ""
    
    exit 1
}
