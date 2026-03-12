# Solución Temporal: Agregar Créditos Manualmente

## Problema Identificado

El backend (`musictoken-ring.onrender.com`) **NO tiene implementado** el endpoint `/api/user/add-credits`, por lo que la conversión automática de MTR on-chain a créditos jugables **NO funciona**.

## Estado del Backend

- ✅ `/api/health` - Funciona
- ✅ `/api/user/credits/{wallet}` - Funciona (devuelve créditos)
- ❌ `/api/user/add-credits` - **NO EXISTE** (404)
- ❌ `/api/user/wallet/{wallet}` - Error: "Wallet link service not available"

## Solución Temporal (SQL)

Mientras se implementa el endpoint `/api/user/add-credits` en el backend, usa el script SQL:

**Archivo:** `AGREGAR-CREDITOS-TESORERIA-MANUAL.sql`

Este script:
- Agrega créditos directamente en la base de datos
- Evita el problema del endpoint faltante
- Funciona inmediatamente

### Pasos:

1. Abre Supabase SQL Editor
2. Copia y pega el contenido de `AGREGAR-CREDITOS-TESORERIA-MANUAL.sql`
3. Ejecuta el script
4. Verifica que los créditos se agregaron correctamente
5. Recarga la página del frontend

## Solución Permanente

El backend necesita implementar el endpoint `/api/user/add-credits` que:

1. Acepte POST requests con:
   ```json
   {
     "userId": "uuid",
     "credits": 1000000,
     "reason": "mtr_conversion_auto",
     "mtrAmount": 98024480,
     "note": "Conversión automática..."
   }
   ```

2. Agregue los créditos a la tabla `user_credits` en Supabase
3. Devuelva la respuesta con los créditos actualizados

## Nota Importante

Esta es una solución **TEMPORAL** para testing. En producción, el sistema debe funcionar automáticamente usando el endpoint del backend.
