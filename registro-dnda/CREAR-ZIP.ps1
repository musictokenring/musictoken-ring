# Script para crear el archivo ZIP para registro DNDA
# Ejecutar: .\CREAR-ZIP.ps1

$fecha = Get-Date -Format "yyyy-MM-dd"
$nombreZip = "MusicTokenRing-Registro-DNDA-$fecha.zip"

Write-Host "Creando archivo ZIP para registro DNDA..." -ForegroundColor Cyan
Write-Host "Nombre del archivo: $nombreZip" -ForegroundColor Yellow

# Verificar que existan las carpetas necesarias
if (-not (Test-Path "muestras-codigo")) {
    Write-Host "ERROR: No se encuentra la carpeta 'muestras-codigo'" -ForegroundColor Red
    exit 1
}

# Crear el archivo ZIP
Compress-Archive -Path "muestras-codigo", "documentacion", "README-DNDA.md", "INSTRUCCIONES-CAPTURAS.md" -DestinationPath $nombreZip -Force

Write-Host ""
Write-Host "✅ Archivo ZIP creado exitosamente: $nombreZip" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANTE:" -ForegroundColor Yellow
Write-Host "1. Agrega las capturas de pantalla a la carpeta 'capturas/'" -ForegroundColor White
Write-Host "2. Luego ejecuta este script nuevamente para incluir las capturas" -ForegroundColor White
Write-Host "3. O agrega manualmente la carpeta 'capturas' al ZIP" -ForegroundColor White
Write-Host ""
Write-Host "Para agregar capturas al ZIP existente:" -ForegroundColor Cyan
Write-Host "  Compress-Archive -Path 'capturas' -Update -DestinationPath '$nombreZip'" -ForegroundColor Gray
