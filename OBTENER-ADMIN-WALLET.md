# 💼 Cómo Obtener ADMIN_WALLET_PRIVATE_KEY y ADMIN_WALLET_ADDRESS

## Opción 1: Usar una Wallet Existente de MetaMask

### Paso 1: Abrir MetaMask

1. Abre la extensión de MetaMask en tu navegador
2. Asegúrate de estar conectado a la red **Base Mainnet**

### Paso 2: Seleccionar o Crear una Wallet para Admin

**Si ya tienes una wallet que quieres usar:**
1. Selecciona la cuenta que quieres usar como admin wallet
2. Copia la dirección (empieza con `0x...`)

**Si necesitas crear una nueva wallet:**
1. Haz clic en el icono de cuenta (arriba a la derecha)
2. Selecciona **Create Account**
3. Nómbrala "Admin Wallet" o similar
4. Copia la dirección

### Paso 3: Exportar la Clave Privada

⚠️ **ADVERTENCIA DE SEGURIDAD:**
- La clave privada da acceso completo a la wallet
- NUNCA la compartas con nadie
- Solo úsala en el backend (variables de entorno)

**Pasos:**
1. En MetaMask, haz clic en los 3 puntos (⋯) junto al nombre de la cuenta
2. Selecciona **Account Details**
3. Haz clic en **Export Private Key**
4. Ingresa tu contraseña de MetaMask
5. Copia la clave privada (empieza con `0x...`)

### Paso 4: Verificar que la Wallet Tenga Fondos

1. Asegúrate de que la wallet tenga suficiente **USDC** en Base Mainnet
2. Esta wallet será la que envíe USDC cuando los usuarios reclamen créditos
3. Puedes transferir USDC desde otra wallet si es necesario

## Opción 2: Crear una Wallet Programáticamente (Avanzado)

Si prefieres crear una wallet específica para el backend:

```bash
# Usando Node.js
node -e "const { privateKeyToAccount } = require('viem/accounts'); const account = privateKeyToAccount('0x' + require('crypto').randomBytes(32).toString('hex')); console.log('Private Key:', account.privateKey); console.log('Address:', account.address);"
```

⚠️ **Guarda ambas (private key y address) de forma segura**

## Paso 5: Configurar en Vercel

1. Ve a Vercel → Settings → Environment Variables
2. Agrega dos variables:

**Variable 1: ADMIN_WALLET_ADDRESS**
- **Key**: `ADMIN_WALLET_ADDRESS`
- **Value**: La dirección de la wallet (ej: `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`)
- **Environment**: Todas (Production, Preview, Development)

**Variable 2: ADMIN_WALLET_PRIVATE_KEY**
- **Key**: `ADMIN_WALLET_PRIVATE_KEY`
- **Value**: La clave privada completa (ej: `0x1234567890abcdef...`)
- **Environment**: **Solo Production** (por seguridad)

## 🔒 Seguridad Crítica

⚠️ **IMPORTANTE:**
- La clave privada da acceso TOTAL a la wallet
- Si alguien la obtiene, puede robar todos los fondos
- NUNCA la commitees al repositorio
- NUNCA la compartas por chat/email
- Solo úsala en variables de entorno del backend
- Considera usar un hardware wallet para producción

## 💰 Fondos Necesarios

Asegúrate de que la admin wallet tenga:
- Suficiente **USDC** en Base Mainnet para pagar reclamaciones
- Un poco de **ETH** en Base para pagar gas fees de las transacciones

## ✅ Verificación

Después de configurar:
1. Verifica que la dirección sea correcta (debe empezar con `0x` y tener 42 caracteres)
2. Verifica que la clave privada sea correcta (debe empezar con `0x` y tener 66 caracteres)
3. Prueba hacer un pequeño claim para verificar que funciona
