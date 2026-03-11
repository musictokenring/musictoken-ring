# 🔧 Guía Paso a Paso: Configurar Alchemy RPC

## ✅ Confirmación Importante

**¿Afectará cosas que ya funcionan?**
- ❌ **NO** - Solo cambiará la conexión al RPC
- ✅ Todo lo demás seguirá funcionando igual
- ✅ Los depósitos seguirán detectándose igual
- ✅ Los créditos seguirán acreditándose igual
- ✅ Las apuestas seguirán funcionando igual

**¿Qué resolverá?**
- ✅ Eliminará los errores `429 (over rate limit)`
- ✅ Permitirá que el sistema venda MTR cuando sea necesario
- ✅ Mejorará la velocidad y confiabilidad de las conexiones blockchain

**Sobre el buffer bajo:**
- ✅ Es **normal** si no hay muchos depósitos recientes
- ✅ Se repondrá automáticamente cuando lleguen depósitos
- ✅ El sistema está funcionando correctamente, solo necesita mejor conexión RPC

---

## 🚀 Paso a Paso: Configurar Alchemy

### Paso 1: Crear Cuenta en Alchemy

1. Ve a [https://www.alchemy.com](https://www.alchemy.com)
2. Haz clic en **"Sign Up"** o **"Get Started"**
3. Completa el registro:
   - Email
   - Contraseña
   - Confirma tu email

### Paso 2: Crear Nueva App

1. Una vez dentro del dashboard, haz clic en **"Create App"** o **"+ Create"**
2. Completa el formulario:
   - **Name:** `MusicToken Ring` (o el nombre que prefieras)
   - **Description:** `Backend RPC for MTR swaps` (opcional)
   - **Chain:** Selecciona **"Base"**
   - **Network:** Selecciona **"Base Mainnet"**
3. Haz clic en **"Create App"**

### Paso 3: Obtener API Key

1. Una vez creada la app, verás el dashboard
2. Busca la sección **"API Key"** o **"HTTP"**
3. Verás una URL como:
   ```
   https://base-mainnet.g.alchemy.com/v2/TU_API_KEY_AQUI
   ```
4. **Copia toda la URL completa** (incluye `/v2/TU_API_KEY`)

**⚠️ IMPORTANTE:** 
- La API Key es **gratuita** hasta cierto límite (más que suficiente para tu uso)
- No la compartas públicamente
- Guárdala de forma segura

### Paso 4: Configurar en Render

1. Ve a [Render Dashboard](https://dashboard.render.com)
2. Selecciona tu servicio `musictoken-ring`
3. Ve a la sección **"Environment"** o **"Environment Variables"**
4. Haz clic en **"Add Environment Variable"**
5. Agrega:
   ```
   Nombre: BASE_RPC_URL
   Valor: https://base-mainnet.g.alchemy.com/v2/TU_API_KEY_AQUI
   ```
   (Reemplaza `TU_API_KEY_AQUI` con tu API key real de Alchemy)

6. Haz clic en **"Save Changes"**
7. Render reiniciará automáticamente el servicio

### Paso 5: Verificar que Funcionó

Después del reinicio, busca en los logs:

**✅ Éxito:**
- Los errores `429 (over rate limit)` desaparecerán
- Verás menos errores de `vault-service`
- El sistema podrá ejecutar swaps sin problemas

**❌ Si hay problemas:**
- Verifica que la URL esté correcta (debe empezar con `https://base-mainnet.g.alchemy.com/v2/`)
- Verifica que la API key sea válida
- Verifica que la app esté configurada para "Base Mainnet"

---

## 📊 Qué Esperar Después

### Inmediatamente:
- ✅ Menos errores de rate limit
- ✅ Conexiones más rápidas y confiables

### Cuando llegue un depósito:
- ✅ El sistema detectará el depósito (como siempre)
- ✅ Acreditará créditos al usuario (como siempre)
- ✅ **NUEVO:** Ejecutará swap automático para comprar MTR (sin errores de rate limit)

### Cuando el buffer esté bajo:
- ✅ El sistema detectará buffer bajo
- ✅ Intentará vender MTR para reponerlo
- ✅ **NUEVO:** Lo hará sin errores de rate limit

---

## 🔒 Seguridad

**¿Es seguro usar Alchemy?**
- ✅ Sí, es un proveedor confiable y usado por muchas aplicaciones
- ✅ La API key solo permite leer/escribir en blockchain (no acceso a tu wallet)
- ✅ Puedes revocar la API key en cualquier momento desde Alchemy

**¿Cuánto cuesta?**
- ✅ Plan gratuito: 300M compute units/mes (más que suficiente para tu uso)
- ✅ Si creces mucho, tienen planes de pago, pero el gratuito es suficiente para empezar

---

## 🎯 Resumen

**Lo que cambiará:**
- ✅ Mejor conexión RPC (sin rate limits)
- ✅ Menos errores en logs
- ✅ Swaps funcionarán correctamente

**Lo que NO cambiará:**
- ❌ La lógica del sistema (sigue igual)
- ❌ Los depósitos (se detectan igual)
- ❌ Los créditos (se acreditan igual)
- ❌ Las apuestas (funcionan igual)

---

## 📝 Checklist

- [ ] Crear cuenta en Alchemy
- [ ] Crear app para "Base Mainnet"
- [ ] Copiar API Key URL completa
- [ ] Agregar `BASE_RPC_URL` en Render
- [ ] Guardar cambios
- [ ] Esperar reinicio automático
- [ ] Verificar logs (menos errores 429)

---

**¿Listo para configurar Alchemy?** Te guío paso a paso si necesitas ayuda en algún punto específico. 🚀
