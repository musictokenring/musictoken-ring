# Configurar BASE_RPC_URL (RPC oficial Base)

Este proyecto usa el **RPC público oficial de Base**.

## Valor recomendado

```env
BASE_RPC_URL=https://mainnet.base.org
```

## Dónde configurarlo

- **Render / Vercel / variables de entorno:** clave `BASE_RPC_URL`, valor `https://mainnet.base.org`
- **Local:** copia `.env.example` y ajusta si hace falta

## Notas

- Si no defines `BASE_RPC_URL`, el backend y los scripts usan `https://mainnet.base.org` por defecto.
- El RPC público puede tener límites de tasa; si necesitas más capacidad en producción, evalúa otro endpoint compatible con Base (configuración externa).
