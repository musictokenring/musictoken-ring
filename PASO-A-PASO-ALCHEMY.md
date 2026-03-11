# 🚀 Guía Paso a Paso: Configurar Alchemy RPC

## ✅ Confirmación

**NO afectará nada que ya funciona** - Solo mejorará la conexión RPC.

---

## 📋 PASO 1: Crear Cuenta en Alchemy

### 1.1. Ir a Alchemy

1. Abre tu navegador
2. Ve a: **https://www.alchemy.com**
3. Haz clic en **"Sign Up"** o **"Get Started"** (botón en la esquina superior derecha)

### 1.2. Registrarse

1. Completa el formulario:
   - **Email:** Tu email
   - **Password:** Crea una contraseña segura
   - Acepta los términos y condiciones
2. Haz clic en **"Create Account"**
3. **Verifica tu email** (revisa tu bandeja de entrada y haz clic en el enlace de verificación)

### 1.3. Iniciar Sesión

1. Una vez verificado, inicia sesión en Alchemy
2. Te llevará al Dashboard

---

## 📋 PASO 2: Crear Nueva App

### 2.1. Acceder al Dashboard

1. Una vez dentro, verás el dashboard de Alchemy
2. Busca el botón **"Create App"** o **"+ Create"** (generalmente en la parte superior)

### 2.2. Completar Formulario

1. **Name:** Escribe `MusicToken Ring` (o el nombre que prefieras)
2. **Description:** `Backend RPC for MTR swaps` (opcional, puedes dejarlo vacío)
3. **Chain:** Selecciona **"Base"** del menú desplegable
4. **Network:** Selecciona **"Base Mainnet"** (asegúrate de que sea Mainnet, no Testnet)

### 2.3. Crear App

1. Haz clic en **"Create App"**
2. Espera unos segundos mientras se crea
3. Te llevará a la página de detalles de tu app

---

## 📋 PASO 3: Obtener API Key

### 3.1. Encontrar la API Key

1. En la página de detalles de tu app, busca la sección **"API Key"** o **"HTTP"**
2. Verás algo como:

```
API Key
https://base-mainnet.g.alchemy.com/v2/abc123xyz456...
```

3. **Copia TODA la URL completa** (desde `https://` hasta el final)
   - Debe verse así: `https://base-mainnet.g.alchemy.com/v2/TU_API_KEY_AQUI`
   - ⚠️ **NO copies solo la parte después de `/v2/`**, copia toda la URL

### 3.2. Guardar la API Key

- **Guárdala en un lugar seguro** (notas, documento, etc.)
- La necesitarás en el siguiente paso

---

## 📋 PASO 4: Configurar en Render

### 4.1. Ir a Render Dashboard

1. Abre una nueva pestaña en tu navegador
2. Ve a: **https://dashboard.render.com**
3. Inicia sesión si es necesario

### 4.2. Seleccionar tu Servicio

1. En el dashboard, busca y haz clic en tu servicio: **"musictoken-ring"**
2. Te llevará a la página del servicio

### 4.3. Ir a Environment Variables

1. En el menú lateral izquierdo, busca **"Environment"** (bajo la sección "MANAGE")
2. Haz clic en **"Environment"**
3. Verás una lista de todas las variables de entorno actuales

### 4.4. Agregar Nueva Variable

1. Busca el botón **"Add Environment Variable"** o **"+ Add"**
2. Haz clic en él
3. Se abrirá un formulario con dos campos:
   - **Key** (o "Nombre")
   - **Value** (o "Valor")

### 4.5. Completar el Formulario

1. **En el campo "Key" (Nombre):**
   ```
   BASE_RPC_URL
   ```
   (Exactamente así, sin espacios, todo en mayúsculas)

2. **En el campo "Value" (Valor):**
   Pega la URL completa que copiaste de Alchemy:
   ```
   https://base-mainnet.g.alchemy.com/v2/TU_API_KEY_AQUI
   ```
   (Reemplaza `TU_API_KEY_AQUI` con tu API key real de Alchemy)

### 4.6. Guardar

1. Haz clic en **"Save"** o **"Add Variable"**
2. Render mostrará un mensaje de confirmación
3. **Render reiniciará automáticamente** tu servicio (esto es normal y necesario)

---

## 📋 PASO 5: Verificar que Funcionó

### 5.1. Esperar el Reinicio

1. Espera 1-2 minutos mientras Render reinicia el servicio
2. Puedes ver el progreso en la sección "Events" o "Logs"

### 5.2. Revisar los Logs

1. Ve a **"Logs"** en el menú lateral
2. Busca los logs más recientes (después del reinicio)
3. Deberías ver:

**✅ Éxito:**
- Los errores `429 (over rate limit)` deberían desaparecer o reducirse mucho
- Menos errores de `vault-service`
- El sistema funcionando normalmente

**❌ Si aún hay problemas:**
- Verifica que la URL esté correcta (debe empezar con `https://base-mainnet.g.alchemy.com/v2/`)
- Verifica que no haya espacios extra en la URL
- Verifica que la API key sea válida en Alchemy

---

## 🔍 Verificación Adicional

### Verificar que la Variable se Guardó Correctamente

1. Ve a **Environment** en Render
2. Busca `BASE_RPC_URL` en la lista
3. Verifica que el valor sea correcto (debería empezar con `https://base-mainnet.g.alchemy.com/v2/`)

### Probar que Funciona

Después de unos minutos, los logs deberían mostrar:
- ✅ Menos errores `429`
- ✅ El sistema funcionando normalmente
- ✅ Si hay un depósito, el swap debería funcionar sin errores

---

## 🆘 Si Tienes Problemas

### Problema: "Invalid API Key"

**Solución:**
- Verifica que copiaste toda la URL completa (no solo la parte después de `/v2/`)
- Verifica que no haya espacios al inicio o final
- Verifica que la app en Alchemy esté configurada para "Base Mainnet"

### Problema: "App not found"

**Solución:**
- Verifica que creaste la app para "Base Mainnet" (no Testnet)
- Verifica que la app esté activa en Alchemy

### Problema: Siguen apareciendo errores 429

**Solución:**
- Espera unos minutos más (puede tomar tiempo propagarse)
- Verifica que el servicio se reinició después de agregar la variable
- Verifica que la variable `BASE_RPC_URL` existe en Render

---

## ✅ Checklist Final

Marca cada paso cuando lo completes:

- [ ] Cuenta creada en Alchemy
- [ ] Email verificado
- [ ] App creada para "Base Mainnet"
- [ ] API Key URL copiada completa
- [ ] Variable `BASE_RPC_URL` agregada en Render
- [ ] Valor pegado correctamente (URL completa)
- [ ] Cambios guardados
- [ ] Servicio reiniciado automáticamente
- [ ] Logs verificados (menos errores 429)

---

## 🎯 Resultado Esperado

Después de completar todos los pasos:

- ✅ **Menos errores** en los logs
- ✅ **Swaps funcionarán** correctamente cuando lleguen depósitos
- ✅ **Venta de MTR funcionará** cuando el buffer esté bajo
- ✅ **Todo lo demás sigue igual** (depósitos, créditos, apuestas)

---

**¿En qué paso estás?** Avísame cuando completes cada paso y te ayudo con el siguiente. 🚀
