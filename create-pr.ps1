# Script para crear Pull Request automáticamente
# Usa la API de GitHub REST

$repoOwner = "musictokenring"
$repoName = "musictoken-ring"
$baseBranch = "main"
$headBranch = "cursor/development-environment-setup-d3d0"
$prTitle = "Fix: Posicionamiento foto de perfil y botón salir"
$prBody = @"
## Cambios realizados

- ✅ Estilos CSS profesionales para foto de perfil y botón salir
- ✅ Diseño responsive para móviles y tablets  
- ✅ Efectos hover mejorados
- ✅ Separación correcta entre elementos

## Archivos modificados
- \`styles/main.css\` - Agregados estilos para \`#authButton\`, \`.user-profile\`, \`.user-avatar\`, \`.btn-logout\`

## Verificación
- [x] Desktop responsive
- [x] Mobile responsive
- [x] Hover effects funcionando
- [x] Sin superposición de elementos

## Preview
Después del merge, Vercel desplegará automáticamente en ~1-2 minutos.

**Commit:** \`1ba9e99\`
"@

$headers = @{
    "Accept" = "application/vnd.github.v3+json"
    "User-Agent" = "PowerShell"
}

# Intentar obtener token de variables de entorno o GitHub CLI
$token = $env:GITHUB_TOKEN
if (-not $token) {
    # Intentar leer de gh CLI si está disponible
    $ghConfigPath = "$env:USERPROFILE\.config\gh\hosts.yml"
    if (Test-Path $ghConfigPath) {
        Write-Host "GitHub CLI config encontrado, pero se necesita token manual"
    }
    Write-Host "⚠️  Se necesita GITHUB_TOKEN para crear PR automáticamente"
    Write-Host ""
    Write-Host "Opción 1: Crear PR manualmente desde esta URL:"
    Write-Host "https://github.com/$repoOwner/$repoName/compare/$baseBranch...$headBranch?expand=1"
    Write-Host ""
    Write-Host "Opción 2: Configurar token y ejecutar:"
    Write-Host "`$env:GITHUB_TOKEN='tu-token'; .\create-pr.ps1"
    exit 1
}

$headers["Authorization"] = "token $token"

$body = @{
    title = $prTitle
    body = $prBody
    head = $headBranch
    base = $baseBranch
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$repoOwner/$repoName/pulls" `
        -Method Post `
        -Headers $headers `
        -Body $body `
        -ContentType "application/json"
    
    Write-Host "✅ Pull Request creado exitosamente!"
    Write-Host "URL: $($response.html_url)"
    Write-Host "Número: #$($response.number)"
    
    # Intentar merge automático si el repo lo permite
    Write-Host ""
    Write-Host "Intentando merge automático..."
    Start-Sleep -Seconds 2
    
    try {
        $mergeBody = @{
            commit_title = "Merge: $prTitle"
            commit_message = "Merge automático del PR #$($response.number)"
            merge_method = "squash"
        } | ConvertTo-Json
        
        $mergeResponse = Invoke-RestMethod -Uri "https://api.github.com/repos/$repoOwner/$repoName/pulls/$($response.number)/merge" `
            -Method Put `
            -Headers $headers `
            -Body $mergeBody `
            -ContentType "application/json"
        
        Write-Host "✅ PR mergeado automáticamente!"
        Write-Host "Vercel desplegará en ~1-2 minutos"
        Write-Host "Producción: https://musictoken-ring.vercel.app"
    }
    catch {
        Write-Host "⚠️  Merge automático requiere aprobación manual"
        Write-Host "Ve a: $($response.html_url)"
        Write-Host "Y haz clic en 'Merge pull request'"
    }
}
catch {
    Write-Host "❌ Error creando PR: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "Crea el PR manualmente desde:"
    Write-Host "https://github.com/$repoOwner/$repoName/compare/$baseBranch...$headBranch?expand=1"
    exit 1
}
