# Script PowerShell para configurar variables de entorno automáticamente
# Uso: .\scripts\setup-env-vars.ps1 [vercel|render|both]

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("vercel", "render", "both")]
    [string]$Platform = "both"
)

Write-Host "🚀 Configurando variables de entorno para MusicTokenRing..." -ForegroundColor Green

# Verificar variables requeridas
if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_SERVICE_ROLE_KEY) {
    Write-Host "⚠️  Advertencia: Variables de Supabase no configuradas" -ForegroundColor Yellow
}

if (-not $env:ADMIN_WALLET_PRIVATE_KEY -or -not $env:ADMIN_WALLET_ADDRESS) {
    Write-Host "⚠️  Advertencia: Variables de Admin Wallet no configuradas" -ForegroundColor Yellow
}

# Función para configurar en Vercel
function Setup-Vercel {
    if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
        Write-Host "❌ Vercel CLI no está instalado. Instala con: npm i -g vercel" -ForegroundColor Red
        return
    }

    Write-Host "📦 Configurando variables en Vercel..." -ForegroundColor Green
    
    $envVars = @{
        "SUPABASE_URL" = $env:SUPABASE_URL
        "SUPABASE_SERVICE_ROLE_KEY" = $env:SUPABASE_SERVICE_ROLE_KEY
        "BASE_RPC_URL" = if ($env:BASE_RPC_URL) { $env:BASE_RPC_URL } else { "https://mainnet.base.org" }
        "MTR_TOKEN_ADDRESS" = if ($env:MTR_TOKEN_ADDRESS) { $env:MTR_TOKEN_ADDRESS } else { "0x99cd1eb32846c9027ed9cb8710066fa08791c33b" }
        "USDC_ADDRESS" = if ($env:USDC_ADDRESS) { $env:USDC_ADDRESS } else { "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }
        "PLATFORM_WALLET_ADDRESS" = if ($env:PLATFORM_WALLET_ADDRESS) { $env:PLATFORM_WALLET_ADDRESS } else { "" }
        "ADMIN_WALLET_PRIVATE_KEY" = $env:ADMIN_WALLET_PRIVATE_KEY
        "ADMIN_WALLET_ADDRESS" = $env:ADMIN_WALLET_ADDRESS
        "MTR_TO_CREDIT_RATE" = if ($env:MTR_TO_CREDIT_RATE) { $env:MTR_TO_CREDIT_RATE } else { "778" }
        "PORT" = if ($env:PORT) { $env:PORT } else { "3001" }
    }

    foreach ($key in $envVars.Keys) {
        if ($envVars[$key]) {
            Write-Host "  Configurando $key..." -ForegroundColor Gray
            # Nota: Vercel CLI requiere interacción manual para valores sensibles
            # Este script muestra los comandos a ejecutar
            Write-Host "    Ejecuta: vercel env add $key production" -ForegroundColor Cyan
        }
    }
    
    Write-Host "✅ Variables listas para configurar en Vercel" -ForegroundColor Green
    Write-Host "   Usa: vercel env add <VAR_NAME> production" -ForegroundColor Yellow
}

# Función para configurar en Render
function Setup-Render {
    if (-not $env:RENDER_API_KEY) {
        Write-Host "❌ RENDER_API_KEY no está configurada" -ForegroundColor Red
        return
    }

    Write-Host "📦 Configurando variables en Render..." -ForegroundColor Green
    
    $serviceId = if ($env:RENDER_SERVICE_ID) { $env:RENDER_SERVICE_ID } else { "musictoken-backend" }
    
    $body = @{
        envVars = @{
            SUPABASE_URL = $env:SUPABASE_URL
            SUPABASE_SERVICE_ROLE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY
            BASE_RPC_URL = if ($env:BASE_RPC_URL) { $env:BASE_RPC_URL } else { "https://mainnet.base.org" }
            MTR_TOKEN_ADDRESS = if ($env:MTR_TOKEN_ADDRESS) { $env:MTR_TOKEN_ADDRESS } else { "0x99cd1eb32846c9027ed9cb8710066fa08791c33b" }
            USDC_ADDRESS = if ($env:USDC_ADDRESS) { $env:USDC_ADDRESS } else { "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }
            PLATFORM_WALLET_ADDRESS = if ($env:PLATFORM_WALLET_ADDRESS) { $env:PLATFORM_WALLET_ADDRESS } else { "" }
            ADMIN_WALLET_PRIVATE_KEY = $env:ADMIN_WALLET_PRIVATE_KEY
            ADMIN_WALLET_ADDRESS = $env:ADMIN_WALLET_ADDRESS
            MTR_TO_CREDIT_RATE = if ($env:MTR_TO_CREDIT_RATE) { $env:MTR_TO_CREDIT_RATE } else { "778" }
            PORT = if ($env:PORT) { $env:PORT } else { "3001" }
        }
    } | ConvertTo-Json -Depth 10

    try {
        $headers = @{
            "Authorization" = "Bearer $env:RENDER_API_KEY"
            "Content-Type" = "application/json"
        }
        
        Invoke-RestMethod -Uri "https://api.render.com/v1/services/$serviceId/env-vars" `
            -Method Put `
            -Headers $headers `
            -Body $body
        
        Write-Host "✅ Variables configuradas en Render" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Error configurando Render: $_" -ForegroundColor Yellow
        Write-Host "   Verifica RENDER_API_KEY y RENDER_SERVICE_ID" -ForegroundColor Yellow
    }
}

# Ejecutar según plataforma
switch ($Platform) {
    "vercel" {
        Setup-Vercel
    }
    "render" {
        Setup-Render
    }
    "both" {
        Setup-Vercel
        Setup-Render
    }
}

Write-Host "✨ Configuración completada" -ForegroundColor Green
