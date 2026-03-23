# Errores de rate limit (429) en el RPC

## Problema

Algunos servicios pueden ver `HTTP 429` o timeouts si el RPC recibe demasiadas peticiones.

**Causa habitual:** el endpoint público `https://mainnet.base.org` tiene límites de tasa compartidos entre muchos usuarios.

## Solución estándar (este proyecto)

Usar el RPC oficial gratuito de Base de forma explícita:

```env
BASE_RPC_URL=https://mainnet.base.org
```

El código ya usa este valor como fallback si no defines la variable.

## Si persisten los 429 en producción

1. **Reducir frecuencia** de escaneos / polling en los servicios que controlas.
2. **Evaluar** un endpoint RPC dedicado compatible con Base (proveedor externo con su propia cuota); no forma parte del repo y debe configurarse solo en `BASE_RPC_URL`.

## Nota

El RPC público es gratuito pero con límites. Para cargas altas, planifica capacidad extra fuera de este repositorio.
