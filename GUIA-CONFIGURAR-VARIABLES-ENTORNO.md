# 🔧 Guía Paso a Paso: Configurar Variables de Entorno para Auto-Swap MTR

## 📋 Resumen

Necesitas agregar estas variables de entorno en **Render** (o tu servidor) para activar el sistema de auto-swap de MTR.

---

## 🎯 Paso 1: Obtener la Clave Privada de tu Wallet

### ¿Qué wallet usar?

Necesitas una wallet que tenga:
- ✅ **USDC** para comprar MTR
- ✅ **ETH** para pagar gas (~$0.01-0.05 por swap)

### Opciones:

#### Opción A: Usar tu wallet de tesorería existente (RECOMENDADO) ✅

**Si ya tienes una wallet de tesorería funcionando:**

1. **Usa la misma clave privada** que ya tienes configurada como `ADMIN_WALLET_PRIVATE_KEY`
2. **Ventajas:**
   - ✅ Ya está configurada y funcionando
   - ✅ Ya tiene USDC y ETH
   - ✅ Ya tiene las aprobaciones necesarias
   - ✅ Menos complejidad
   - ✅ El código está diseñado para esto (MTR_POOL_WALLET default es PLATFORM_WALLET)

**Configuración:**
```
SWAP_WALLET_PRIVATE_KEY=<misma clave que ADMIN_WALLET_PRIVATE_KEY>
```

**⚠️ IMPORTANTE:** 
- Asegúrate de que la wallet tenga suficiente ETH para gas (~0.01 ETH es suficiente para muchos swaps)
- El sistema automáticamente usará esta wallet para comprar MTR y mantenerlo en el mismo lugar

#### Opción B: Crear una wallet nueva (solo si necesitas separación)

**¿Cuándo usar wallet separada?**
- Si quieres separar completamente las operaciones de swap de la tesorería principal
- Si manejas volúmenes muy altos y quieres límites de exposición
- Si tienes políticas de seguridad que requieren separación

**Si decides crear una nueva:**
1. Crea una nueva wallet en MetaMask
2. Exporta la clave privada:
   - MetaMask → Cuenta → Detalles → Exportar clave privada
   - ⚠️ **NUNCA compartas esta clave**
3. Envía USDC y ETH a esta wallet
4. Configura `MTR_POOL_WALLET` para que apunte a esta nueva wallet

### Formato de la clave privada:
```
0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
```
(Sin espacios, empieza con `0x`, 64 caracteres después del `0x`)

---

## 🚀 Paso 2: Configurar en Render (Producción)

### 2.1. Acceder a Render Dashboard

1. Ve a [https://dashboard.render.com](https://dashboard.render.com)
2. Inicia sesión con tu cuenta
3. Selecciona tu servicio backend (probablemente llamado algo como `musictoken-backend`)

### 2.2. Agregar Variables de Entorno

1. En el panel de tu servicio, ve a la sección **"Environment"** o **"Environment Variables"**
2. Haz clic en **"Add Environment Variable"** o **"Add Variable"**

### 2.3. Agregar Variables (una por una)

#### Variable 1: `SWAP_WALLET_PRIVATE_KEY` (OBLIGATORIA)

```
Nombre: SWAP_WALLET_PRIVATE_KEY
Valor: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
```

**⚠️ IMPORTANTE:**
- Reemplaza `0x123...` con tu clave privada real
- No incluyas espacios ni comillas
- Asegúrate de que empiece con `0x`

#### Variable 2: `SWAP_PERCENTAGE` (OPCIONAL)

```
Nombre: SWAP_PERCENTAGE
Valor: 0.90
```

**Explicación:** 
- `0.90` = 90% del depósito se usa para comprar MTR
- `0.80` = 80% del depósito se usa para comprar MTR
- Si no la configuras, usa `0.90` por defecto

#### Variable 3: `MIN_SWAP_AMOUNT` (OPCIONAL)

```
Nombre: MIN_SWAP_AMOUNT
Valor: 10
```

**Explicación:**
- Solo ejecuta swap si el depósito es >= 10 USDC
- Si no la configuras, usa `10` por defecto

#### Variable 4: `MAX_DAILY_SWAP` (OPCIONAL)

```
Nombre: MAX_DAILY_SWAP
Valor: 10000
```

**Explicación:**
- Máximo 10,000 USDC por día en swaps automáticos
- Límite de seguridad para prevenir exploits
- Si no la configuras, usa `10000` por defecto

#### Variable 5: `MIN_USDC_BUFFER` (OPCIONAL)

```
Nombre: MIN_USDC_BUFFER
Valor: 1000
```

**Explicación:**
- Mantiene mínimo 1,000 USDC en buffer para premios inmediatos
- Si el buffer baja de esto, vende MTR automáticamente
- Si no la configuras, usa `1000` por defecto

### 2.4. Guardar Cambios

1. Después de agregar todas las variables, haz clic en **"Save Changes"** o **"Save"**
2. Render reiniciará automáticamente tu servicio con las nuevas variables

---

## 💻 Paso 3: Configurar Localmente (Para Testing)

Si quieres probar localmente antes de desplegar:

### 3.1. Crear archivo `.env` en la raíz del proyecto

**Ubicación:** `c:\NUEVO MUSICTOKENRING-OPERATIVO\.env`

### 3.2. Agregar las variables al archivo `.env`

Abre el archivo `.env` (o créalo si no existe) y agrega:

```bash
# OBLIGATORIO para activar auto-swap
SWAP_WALLET_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

# OPCIONALES (tienen defaults seguros)
SWAP_PERCENTAGE=0.90
MIN_SWAP_AMOUNT=10
MAX_DAILY_SWAP=10000
MIN_USDC_BUFFER=1000
```

**⚠️ IMPORTANTE:**
- Reemplaza `0x123...` con tu clave privada real
- No incluyas espacios alrededor del `=`
- No incluyas comillas
- El archivo `.env` ya está en `.gitignore` (no se subirá a Git)

### 3.3. Cargar variables en Node.js

Si estás ejecutando el servidor localmente, asegúrate de tener `dotenv` instalado:

```bash
npm install dotenv
```

Y en tu `server-auto.js`, al inicio del archivo:

```javascript
require('dotenv').config();
```

---

## ✅ Paso 4: Verificar que Funcionó

### 4.1. Revisar Logs del Servidor

Después de reiniciar el servidor, busca en los logs:

```
[mtr-swap] ✅ Service initialized
[mtr-swap] Swap wallet: 0x...
[mtr-swap] MTR pool wallet: 0x...
```

Si ves esto, el servicio está activado.

Si ves:
```
[mtr-swap] ⚠️ SWAP_WALLET_PRIVATE_KEY not set, auto-swap disabled
```

Significa que la variable no está configurada correctamente.

### 4.2. Probar con un Depósito Pequeño

1. Deposita 10-20 USDC a la wallet de plataforma
2. Revisa los logs:
   ```
   [deposit-listener] ✅ Credited X credits...
   [deposit-listener] 🔄 Triggering auto-swap...
   [mtr-swap] 🔄 Auto-buying MTR: X USDC
   [mtr-swap] ✅ Successfully bought X MTR...
   ```

### 4.3. Verificar en Base de Datos

Ejecuta en Supabase SQL Editor:

```sql
SELECT * FROM swap_logs 
ORDER BY created_at DESC 
LIMIT 5;
```

Deberías ver registros de los swaps ejecutados.

---

## 🔒 Seguridad: Mejores Prácticas

### ✅ Hacer:

1. **Usar tu wallet de tesorería existente** (ya está configurada y funcionando)
   - O crear wallet separada solo si necesitas separación por políticas de seguridad
2. **Monitorear logs** regularmente
3. **Revisar swaps** en Basescan periódicamente
4. **Mantener backup** de la clave privada en lugar seguro
5. **Asegurar suficiente ETH** para gas (~0.01 ETH mínimo)

### ❌ No hacer:

1. **NUNCA** compartas tu clave privada
2. **NUNCA** subas el archivo `.env` a Git
3. **NUNCA** uses la misma clave en múltiples servicios
4. **NUNCA** dejes la wallet con demasiados fondos

---

## 📊 Valores Recomendados por Escenario

### Escenario 1: Plataforma Pequeña (< 1000 usuarios)

```bash
SWAP_PERCENTAGE=0.85          # 85% para comprar MTR
MIN_SWAP_AMOUNT=5             # Mínimo 5 USDC
MAX_DAILY_SWAP=5000           # Máximo 5k USDC/día
MIN_USDC_BUFFER=500           # Buffer de 500 USDC
```

### Escenario 2: Plataforma Mediana (1000-10000 usuarios)

```bash
SWAP_PERCENTAGE=0.90          # 90% para comprar MTR
MIN_SWAP_AMOUNT=10            # Mínimo 10 USDC
MAX_DAILY_SWAP=10000          # Máximo 10k USDC/día
MIN_USDC_BUFFER=1000          # Buffer de 1000 USDC
```

### Escenario 3: Plataforma Grande (> 10000 usuarios)

```bash
SWAP_PERCENTAGE=0.90          # 90% para comprar MTR
MIN_SWAP_AMOUNT=50            # Mínimo 50 USDC (solo swaps grandes)
MAX_DAILY_SWAP=50000          # Máximo 50k USDC/día
MIN_USDC_BUFFER=5000          # Buffer de 5000 USDC
```

---

## 🆘 Troubleshooting

### Problema: "Service disabled"

**Causa:** `SWAP_WALLET_PRIVATE_KEY` no está configurada

**Solución:**
1. Verifica que agregaste la variable en Render
2. Verifica que el nombre es exactamente `SWAP_WALLET_PRIVATE_KEY`
3. Verifica que el valor empieza con `0x`
4. Reinicia el servidor

### Problema: "Insufficient USDC balance"

**Causa:** La wallet no tiene suficiente USDC

**Solución:**
1. Envía USDC a la wallet configurada en `SWAP_WALLET_PRIVATE_KEY`
2. Verifica el balance en Basescan

### Problema: "Insufficient ETH for gas"

**Causa:** La wallet no tiene suficiente ETH para pagar gas

**Solución:**
1. Envía ETH a la wallet (al menos 0.01 ETH)
2. Base Network es barato, pero necesitas algo de ETH

### Problema: "Daily limit exceeded"

**Causa:** Se alcanzó el límite diario de swaps

**Solución:**
1. Espera al día siguiente (el límite se resetea)
2. O aumenta `MAX_DAILY_SWAP` si es necesario

---

## 📝 Checklist Final

Antes de activar en producción:

- [ ] Ejecuté la migración SQL (`007_create_swap_logs_table.sql`)
- [ ] Tengo una wallet con USDC y ETH
- [ ] Obtuve la clave privada de la wallet
- [ ] Agregué `SWAP_WALLET_PRIVATE_KEY` en Render
- [ ] Agregué variables opcionales (o uso defaults)
- [ ] Guardé cambios en Render
- [ ] Servidor se reinició automáticamente
- [ ] Verifiqué logs: `[mtr-swap] ✅ Service initialized`
- [ ] Probé con depósito pequeño
- [ ] Verifiqué swaps en Basescan
- [ ] Verifiqué registros en `swap_logs` table

---

## 🎯 Resumen Rápido

**Mínimo necesario para activar:**

1. Agregar en Render:
   ```
   SWAP_WALLET_PRIVATE_KEY=0x... (tu clave privada)
   ```

2. Reiniciar servidor

3. Verificar logs

**¡Listo!** El sistema funcionará con los valores por defecto seguros.

---

¿Necesitas ayuda con algún paso específico? 🚀
