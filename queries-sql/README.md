# 📋 Queries SQL para Investigación de Fuga de Fondos

Este directorio contiene queries SQL individuales para investigar la fuga de fondos del vault.

## 🎯 Orden Recomendado de Ejecución

### Paso 1: Verificar Estructura de Tablas
1. `01-verificar-estructura-claims.sql` - Verifica que la tabla `claims` existe
2. `05-verificar-estructura-vault-transactions.sql` - Verifica que la tabla `vault_transactions` existe
3. `09-verificar-estructura-security-alerts.sql` - Verifica que la tabla `security_alerts` existe

### Paso 2: Contar Datos Generales
4. `02-contar-todos-los-claims.sql` - Cuenta todos los claims en la base de datos
5. `06-todas-transacciones-vault.sql` - Cuenta todas las transacciones del vault
6. `10-todas-alertas-seguridad.sql` - Cuenta todas las alertas de seguridad

### Paso 3: Investigar Claims Sospechosos
7. `03-claims-wallet-incorrecta.sql` - Lista claims con wallet incorrecta
8. `04-resumen-claims-wallet-incorrecta.sql` - **MUY IMPORTANTE** - Resumen de claims sospechosos

### Paso 4: Investigar Transacciones del Vault
9. `07-transacciones-vault-direcciones-desconocidas.sql` - **MUY IMPORTANTE** - Transacciones sospechosas del vault
10. `08-resumen-transacciones-sospechosas.sql` - **MUY IMPORTANTE** - Resumen de transacciones sospechosas

### Paso 5: Revisar Alertas de Seguridad
11. `11-alertas-wallet-mismatch.sql` - Alertas de wallet mismatch detectadas

### Paso 6: Análisis de Direcciones
12. `12-direcciones-unicas-claims.sql` - Todas las direcciones que recibieron claims
13. `13-direcciones-unicas-vault.sql` - Todas las direcciones que recibieron retiros del vault

## ⚠️ Queries Más Importantes

Si solo tienes tiempo para ejecutar algunas queries, ejecuta estas primero:

1. **`04-resumen-claims-wallet-incorrecta.sql`** - Te mostrará las direcciones sospechosas y montos totales
2. **`08-resumen-transacciones-sospechosas.sql`** - Te mostrará las direcciones que recibieron más fondos del vault
3. **`07-transacciones-vault-direcciones-desconocidas.sql`** - Te mostrará todas las transacciones sospechosas

## 📝 Cómo Usar

1. Abre Supabase → SQL Editor
2. Copia el contenido de cada archivo `.sql`
3. Pega en el editor de Supabase
4. Ejecuta la query (Ctrl+Enter o botón "Run")
5. Revisa los resultados
6. Documenta tus hallazgos

## 🔍 Qué Buscar en los Resultados

### En Claims con Wallet Incorrecta:
- Busca `wallet_status = '⚠️ MISMATCH'`
- Anota las direcciones en `suspicious_wallet` o `claimed_wallet`
- Suma los montos en `total_usdc`

### En Transacciones del Vault:
- Busca `address_status = '⚠️ NO ES USUARIO'`
- Anota las direcciones en `suspicious_address` o `wallet_address`
- Suma los montos en `total_usdc`

### Direcciones Sospechosas:
- Verifica cada dirección en Basescan: `https://basescan.org/address/[DIRECCION]`
- Busca transacciones desde `PLATFORM_WALLET` (0x75376BC58830f27415402875D26B73A6BE8E2253)
- Verifica si coincide con el dominio mencionado (foodam.xyz)

## 📊 Interpretación de Resultados

### Si encuentras resultados:
- ✅ **Claims con wallet incorrecta:** Estos son intentos de fraude detectados
- ✅ **Transacciones del vault a direcciones desconocidas:** Estas son transferencias directas sospechosas
- ✅ **Alertas de seguridad:** Estas son detecciones automáticas de fraude

### Si NO encuentras resultados:
- ✅ **No hay claims con wallet incorrecta:** Esto es bueno - significa que la corrección funcionó
- ✅ **No hay transacciones sospechosas:** Esto es bueno - significa que no hay fugas recientes
- ⚠️ **Pero la fuga ya pudo haber ocurrido antes:** Revisa transacciones más antiguas si es necesario

## 🚨 Acciones Inmediatas si Encuentras Fuga

1. **Documenta todo:**
   - Direcciones sospechosas
   - Montos robados
   - Hashes de transacciones (tx_hash)
   - Fechas y horas

2. **Verifica en Basescan:**
   - Confirma las transacciones
   - Verifica los montos
   - Identifica si hay más transacciones relacionadas

3. **Reporta:**
   - Si encuentras la dirección del atacante, puedes reportarla
   - Considera agregarla a una lista de bloqueo

4. **Refuerza seguridad:**
   - Las medidas ya implementadas deberían prevenir futuros ataques
   - Considera agregar más validaciones si es necesario
