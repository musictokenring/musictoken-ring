# ✅ Verificación: Sistema de Auto-Swap MTR

## 🎯 Objetivo

Verificar que el sistema de auto-swap MTR está funcionando correctamente después de agregar `SWAP_WALLET_PRIVATE_KEY` en Render.

---

## 📋 Checklist de Verificación

### ✅ Paso 1: Verificar Logs del Servidor

Después del redeploy en Render, revisa los logs del servidor. Deberías ver:

#### ✅ Logs Esperados (Éxito):

```
[mtr-swap] ✅ Service initialized
[mtr-swap] Swap wallet: 0x75376BC58830f27415402875D26B73A6BE8E2253
[mtr-swap] MTR pool wallet: 0x75376BC58830f27415402875D26B73A6BE8E2253
```

Y también:

```
[liquidity-manager] Initializing...
[liquidity-manager] Min USDC buffer: 1000 USDC
[liquidity-manager] Target USDC buffer: 5000 USDC
[liquidity-manager] ✅ Initialized
```

#### ❌ Logs de Error (Si algo falla):

```
[mtr-swap] ⚠️ SWAP_WALLET_PRIVATE_KEY not set, auto-swap disabled
```

Si ves esto, significa que la variable no se configuró correctamente.

---

### ✅ Paso 2: Verificar Inicialización del Servicio

En los logs del servidor, busca:

```
[server] ✅ All services initialized
```

Y específicamente:

```
[server] ✅ Liquidity manager initialized
```

---

### ✅ Paso 3: Verificar que el Servicio Está Activo

Busca en los logs periódicos (cada 5 minutos):

```
[liquidity-manager] Current balances: { usdc: X, mtr: Y }
[liquidity-manager] ✅ USDC buffer healthy
```

O si el buffer está bajo:

```
[liquidity-manager] ⚠️ USDC buffer low (X < 1000)
[liquidity-manager] Selling MTR to replenish USDC buffer...
```

---

### ✅ Paso 4: Probar con un Depósito Real (Opcional)

**⚠️ IMPORTANTE:** Solo haz esto si quieres probar el sistema completo.

1. **Deposita una cantidad pequeña** (10-20 USDC) a la wallet de plataforma:
   ```
   0x75376BC58830f27415402875D26B73A6BE8E2253
   ```

2. **Revisa los logs** - Deberías ver:
   ```
   [deposit-listener] ✅ Credited X credits...
   [deposit-listener] 🔄 Triggering auto-swap...
   [mtr-swap] 🔄 Auto-buying MTR: X USDC
   [mtr-swap] ✅ Successfully bought X MTR...
   ```

3. **Verifica en Basescan:**
   - Busca la transacción del depósito
   - Deberías ver una segunda transacción de swap en Uniswap
   - Verifica que el MTR llegó a la wallet

---

### ✅ Paso 5: Verificar Base de Datos

Ejecuta en Supabase SQL Editor:

```sql
-- Verificar que la tabla swap_logs existe
SELECT * FROM swap_logs LIMIT 1;
```

Si la tabla no existe, necesitas ejecutar la migración SQL primero.

---

### ✅ Paso 6: Verificar Variables de Entorno

En Render, verifica que las variables estén configuradas:

1. Ve a tu servicio en Render Dashboard
2. Ve a la sección "Environment"
3. Verifica que exista:
   - ✅ `SWAP_WALLET_PRIVATE_KEY` (con tu clave privada)
   - ✅ `ADMIN_WALLET_PRIVATE_KEY` (debe existir también)

---

## 🔍 Comandos de Verificación

### Verificar Logs en Render

1. Ve a tu servicio en Render Dashboard
2. Haz clic en "Logs"
3. Busca los mensajes mencionados arriba

### Verificar Estado del Servicio

En los logs, busca:

```
[server] Initializing automated services...
[deposit-listener] ✅ Initialized and listening
[server] ✅ All services initialized
```

---

## 🐛 Troubleshooting

### Problema: "Service disabled"

**Síntoma:**
```
[mtr-swap] ⚠️ SWAP_WALLET_PRIVATE_KEY not set, auto-swap disabled
```

**Solución:**
1. Verifica que agregaste `SWAP_WALLET_PRIVATE_KEY` en Render
2. Verifica que el nombre es exactamente `SWAP_WALLET_PRIVATE_KEY` (sin espacios)
3. Verifica que el valor empieza con `0x`
4. Verifica que guardaste los cambios
5. Verifica que el servidor se reinició después de agregar la variable

### Problema: "Error initializing"

**Síntoma:**
```
[mtr-swap] ❌ Error initializing service: ...
```

**Solución:**
1. Verifica que la clave privada es válida (formato correcto)
2. Verifica que la clave privada corresponde a una wallet en Base Network
3. Revisa el error específico en los logs

### Problema: "Liquidity manager not initialized"

**Síntoma:**
```
[server] ⚠️ Error initializing liquidity manager: ...
```

**Solución:**
1. Esto es no crítico - el servidor continuará funcionando
2. Revisa el error específico en los logs
3. Verifica que `SWAP_WALLET_PRIVATE_KEY` esté configurada

### Problema: Tabla swap_logs no existe

**Síntoma:**
```
Error: relation "swap_logs" does not exist
```

**Solución:**
1. Ejecuta la migración SQL en Supabase:
   ```sql
   -- Archivo: supabase/migrations/007_create_swap_logs_table.sql
   ```

---

## ✅ Verificación Rápida (Checklist)

Marca cada item cuando lo verifiques:

- [ ] Logs muestran: `[mtr-swap] ✅ Service initialized`
- [ ] Logs muestran: `[liquidity-manager] ✅ Initialized`
- [ ] Logs muestran: `[server] ✅ All services initialized`
- [ ] Variable `SWAP_WALLET_PRIVATE_KEY` existe en Render
- [ ] Variable tiene el valor correcto (empieza con `0x`)
- [ ] Tabla `swap_logs` existe en Supabase (si quieres probar con depósito real)
- [ ] Servidor se reinició después de agregar la variable

---

## 🎯 Resultado Esperado

Si todo está bien configurado, deberías ver:

1. **En los logs:**
   ```
   [mtr-swap] ✅ Service initialized
   [liquidity-manager] ✅ Initialized
   [server] ✅ All services initialized
   ```

2. **Cada 5 minutos:**
   ```
   [liquidity-manager] Current balances: { usdc: X, mtr: Y }
   [liquidity-manager] ✅ USDC buffer healthy
   ```

3. **Cuando llegue un depósito de USDC:**
   ```
   [deposit-listener] ✅ Credited X credits...
   [deposit-listener] 🔄 Triggering auto-swap...
   [mtr-swap] 🔄 Auto-buying MTR: X USDC
   [mtr-swap] ✅ Successfully bought X MTR...
   ```

---

## 📝 Próximos Pasos

Una vez verificado que todo funciona:

1. **Monitorea los logs** durante las primeras 24 horas
2. **Revisa swaps en Basescan** periódicamente
3. **Verifica registros en `swap_logs`** en Supabase
4. **Ajusta parámetros** si es necesario (por ejemplo, `SWAP_PERCENTAGE`, `MIN_USDC_BUFFER`)

---

## 🆘 Si Necesitas Ayuda

Si algo no funciona:

1. **Copia los logs completos** del servidor
2. **Indica qué paso falló** en el checklist
3. **Comparte el error específico** que aparece en los logs

---

**¿Todo funcionando?** 🚀
