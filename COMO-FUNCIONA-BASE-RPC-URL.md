# Cómo funciona BASE_RPC_URL en el código

## Respuesta directa

El código lee `BASE_RPC_URL` desde el entorno. Si no está definida, usa el **RPC oficial gratuito de Base**.

## Valor por defecto

```text
https://mainnet.base.org
```

## Ejemplo (servicios Node)

```javascript
transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
```

- `process.env.BASE_RPC_URL` → variable en Render / `.env`
- `|| 'https://mainnet.base.org'` → fallback si no hay variable

## Qué hacer en despliegue

1. En Render (u otro host), define `BASE_RPC_URL=https://mainnet.base.org` (recomendado).
2. Guarda y redeploy si aplica.
3. No hace falta cambiar código: ya está cableado.

## Resumen

| Pregunta | Respuesta |
|----------|-----------|
| ¿Cambiar código? | No, solo la variable de entorno |
| ¿URL recomendada? | `https://mainnet.base.org` |
