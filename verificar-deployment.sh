#!/bin/bash
# Script para verificar que el deployment en Vercel esté funcionando correctamente

echo "🔍 Verificando deployment de MusicTokenRing..."
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# URL del backend (ajustar según tu deployment)
BACKEND_URL=${BACKEND_URL:-"https://musictoken-backend.onrender.com"}
VERCEL_URL=${VERCEL_URL:-"https://musictokenring.vercel.app"}

echo "📡 Verificando endpoints del backend..."
echo ""

# 1. Health check
echo "1. Health Check (/api/health):"
HEALTH=$(curl -s "$BACKEND_URL/api/health" 2>/dev/null)
if [ $? -eq 0 ] && echo "$HEALTH" | grep -q "status"; then
    echo -e "${GREEN}✅ Health check OK${NC}"
    echo "$HEALTH" | jq '.' 2>/dev/null || echo "$HEALTH"
else
    echo -e "${RED}❌ Health check falló${NC}"
fi
echo ""

# 2. Price endpoint
echo "2. Price Endpoint (/api/price):"
PRICE=$(curl -s "$BACKEND_URL/api/price" 2>/dev/null)
if [ $? -eq 0 ] && echo "$PRICE" | grep -q "mtrPrice"; then
    echo -e "${GREEN}✅ Price endpoint OK${NC}"
    echo "$PRICE" | jq '.' 2>/dev/null || echo "$PRICE"
else
    echo -e "${YELLOW}⚠️  Price endpoint no disponible (puede ser normal si aún no se inicializó)${NC}"
fi
echo ""

# 3. Verificar frontend
echo "3. Frontend (Vercel):"
FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" "$VERCEL_URL" 2>/dev/null)
if [ "$FRONTEND" = "200" ]; then
    echo -e "${GREEN}✅ Frontend accesible (HTTP $FRONTEND)${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend respondió con HTTP $FRONTEND${NC}"
fi
echo ""

echo "✅ Verificación completada"
echo ""
echo "📝 Próximos pasos:"
echo "   1. Verifica los logs en Vercel Dashboard → Deployments"
echo "   2. Verifica que las variables de entorno estén configuradas"
echo "   3. Prueba hacer un depósito para verificar que funciona"
