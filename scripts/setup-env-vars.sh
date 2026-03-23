#!/bin/bash
# Script para configurar variables de entorno automáticamente
# Uso: ./scripts/setup-env-vars.sh [vercel|render|both]

set -e

PLATFORM=${1:-both}

echo "🚀 Configurando variables de entorno para MusicTokenRing..."

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar que las variables estén definidas
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${YELLOW}⚠️  Advertencia: Variables de Supabase no configuradas${NC}"
fi

if [ -z "$ADMIN_WALLET_PRIVATE_KEY" ] || [ -z "$ADMIN_WALLET_ADDRESS" ]; then
    echo -e "${YELLOW}⚠️  Advertencia: Variables de Admin Wallet no configuradas${NC}"
fi

# Función para configurar en Vercel
setup_vercel() {
    if ! command -v vercel &> /dev/null; then
        echo "❌ Vercel CLI no está instalado. Instala con: npm i -g vercel"
        return 1
    fi

    echo -e "${GREEN}📦 Configurando variables en Vercel...${NC}"
    
    vercel env add SUPABASE_URL production <<< "$SUPABASE_URL" || true
    vercel env add SUPABASE_SERVICE_ROLE_KEY production <<< "$SUPABASE_SERVICE_ROLE_KEY" || true
    vercel env add BASE_RPC_URL production <<< "${BASE_RPC_URL:-https://mainnet.base.org}" || true
    vercel env add MTR_TOKEN_ADDRESS production <<< "${MTR_TOKEN_ADDRESS:-0x99cd1eb32846c9027ed9cb8710066fa08791c33b}" || true
    vercel env add USDC_ADDRESS production <<< "${USDC_ADDRESS:-0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913}" || true
    vercel env add PLATFORM_WALLET_ADDRESS production <<< "${PLATFORM_WALLET_ADDRESS:-}" || true
    vercel env add ADMIN_WALLET_PRIVATE_KEY production <<< "$ADMIN_WALLET_PRIVATE_KEY" || true
    vercel env add ADMIN_WALLET_ADDRESS production <<< "$ADMIN_WALLET_ADDRESS" || true
    vercel env add MTR_TO_CREDIT_RATE production <<< "${MTR_TO_CREDIT_RATE:-778}" || true
    vercel env add PORT production <<< "${PORT:-3001}" || true
    
    echo -e "${GREEN}✅ Variables configuradas en Vercel${NC}"
}

# Función para configurar en Render
setup_render() {
    if [ -z "$RENDER_API_KEY" ]; then
        echo "❌ RENDER_API_KEY no está configurada"
        return 1
    fi

    echo -e "${GREEN}📦 Configurando variables en Render...${NC}"
    
    # Obtener service ID (ajustar según tu servicio)
    SERVICE_ID=${RENDER_SERVICE_ID:-"musictoken-backend"}
    
    curl -X PUT "https://api.render.com/v1/services/$SERVICE_ID/env-vars" \
        -H "Authorization: Bearer $RENDER_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"envVars\": {
                \"SUPABASE_URL\": \"$SUPABASE_URL\",
                \"SUPABASE_SERVICE_ROLE_KEY\": \"$SUPABASE_SERVICE_ROLE_KEY\",
                \"BASE_RPC_URL\": \"${BASE_RPC_URL:-https://mainnet.base.org}\",
                \"MTR_TOKEN_ADDRESS\": \"${MTR_TOKEN_ADDRESS:-0x99cd1eb32846c9027ed9cb8710066fa08791c33b}\",
                \"USDC_ADDRESS\": \"${USDC_ADDRESS:-0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913}\",
                \"PLATFORM_WALLET_ADDRESS\": \"${PLATFORM_WALLET_ADDRESS:-}\",
                \"ADMIN_WALLET_PRIVATE_KEY\": \"$ADMIN_WALLET_PRIVATE_KEY\",
                \"ADMIN_WALLET_ADDRESS\": \"$ADMIN_WALLET_ADDRESS\",
                \"MTR_TO_CREDIT_RATE\": \"${MTR_TO_CREDIT_RATE:-778}\",
                \"PORT\": \"${PORT:-3001}\"
            }
        }" || echo "⚠️  Error configurando Render (verifica RENDER_API_KEY y RENDER_SERVICE_ID)"
    
    echo -e "${GREEN}✅ Variables configuradas en Render${NC}"
}

# Ejecutar según plataforma
case $PLATFORM in
    vercel)
        setup_vercel
        ;;
    render)
        setup_render
        ;;
    both)
        setup_vercel
        setup_render
        ;;
    *)
        echo "Uso: $0 [vercel|render|both]"
        exit 1
        ;;
esac

echo -e "${GREEN}✨ Configuración completada${NC}"
