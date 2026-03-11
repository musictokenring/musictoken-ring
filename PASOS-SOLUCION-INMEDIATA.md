# Pasos para Solucionar el Problema Inmediatamente

## Problema Identificado
Usuario `52053c46-f6da-4861-9143-fd76d3e8e5d9` tiene **5.0358 créditos** pero **NO tiene wallet vinculada**.

## Solución Paso a Paso

### PASO 1: Investigar el usuario
Ejecuta `INVESTIGAR-USUARIO-SIN-WALLET.sql` para obtener:
- Email del usuario
- Depósitos realizados
- Transacciones (tx_hash)
- Si existe en tabla `users` (legacy)

### PASO 2: Obtener la wallet address del usuario

**Opción A: Preguntar al usuario**
- Contacta al usuario y pregúntale qué wallet address usó para hacer el depósito
- O pídele que se conecte con MetaMask y te diga su dirección

**Opción B: Revisar logs del backend**
- Busca en los logs del backend cuando se procesó el depósito
- Los logs deberían mostrar la wallet address del remitente

**Opción C: Revisar transacción blockchain**
- Si tienes el `tx_hash` del depósito, puedes revisarlo en un explorador de blockchain (BaseScan)
- Extrae la dirección del remitente (from address)

### PASO 3: Vincular la wallet

Una vez que tengas la wallet address:

1. Abre `SOLUCION-VINCULAR-WALLET-USUARIO.sql`
2. Reemplaza `'WALLET_ADDRESS_AQUI'` con la wallet address real (ejemplo: `'0x72eca083fbceb05a4f21b1a9883a57bcd638b6dd'`)
3. Ejecuta el script en Supabase SQL Editor
4. Verifica que la vinculación fue exitosa

### PASO 4: Verificar que funciona

1. Recarga la página completamente (Ctrl+Shift+R)
2. El usuario debería poder crear desafíos sociales ahora
3. Verifica que los créditos se deducen correctamente

## Solución para Futuros Casos

Para prevenir esto en el futuro, el backend debería:
1. **Al procesar un depósito**: Verificar si la wallet está vinculada, si no, vincularla automáticamente
2. **Al conectar wallet por primera vez**: Crear entrada en `users` y `user_wallets` automáticamente

## Scripts Disponibles

- `INVESTIGAR-USUARIO-SIN-WALLET.sql` - Investiga el usuario específico
- `SOLUCION-VINCULAR-WALLET-USUARIO.sql` - Vincula la wallet al usuario
- `SOLUCION-AUTOMATICA-TODOS-USUARIOS.sql` - Identifica todos los usuarios con este problema
- `EXPLICACION-POR-QUE-OCURRIO.md` - Explicación detallada del problema
