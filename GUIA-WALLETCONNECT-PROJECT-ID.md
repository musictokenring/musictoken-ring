# 🔗 Guía: Configurar WalletConnect Project ID

## 📋 Pasos para Obtener el Project ID

### 1. Crear Cuenta en WalletConnect Dashboard
- Ve a: https://dashboard.walletconnect.com
- Crea una cuenta (es gratis)
- Verifica tu email si es necesario

### 2. Crear un Nuevo Proyecto

#### Paso 1: Haz clic en "+ Project" o "Add Project +"

#### Paso 2: Configuración Básica
- **Project Name**: `MusicToken Ring`
- **Description** (opcional): `Music Battle Arena - Web3 Gaming Platform`

#### Paso 3: Tipo de Proyecto
- ✅ Selecciona: **"dApp"** (aplicación descentralizada)
- ❌ NO selecciones "Wallet" (eso es para crear wallets)

#### Paso 4: Configuración de Redes (Chains)
- ✅ **Base** (Chain ID: 8453) - **OBLIGATORIO** (esta es tu red principal)
- ✅ Opcional: Ethereum (Chain ID: 1)
- ✅ Opcional: Polygon (Chain ID: 137)
- ✅ Opcional: BNB Smart Chain (Chain ID: 56)

#### Paso 5: Configuraciones Adicionales (si aparecen)
- ✅ **Enable WalletConnect Modal**: Sí
- ✅ **Enable Deep Linking**: Sí (para móviles)
- **Project URL**: `https://musictokenring.xyz`
- **App Icon** (opcional): Puedes subir el logo de MTR

### 3. Crear y Obtener el Project ID

1. Haz clic en **"Create Project"** o **"Save"**
2. Una vez creado, verás el **Project ID** en la página del proyecto
3. El Project ID es una cadena alfanumérica larga, algo como: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

### 4. Actualizar el Código

Una vez que tengas el Project ID, actualiza esta línea en `index.html`:

```javascript
WALLETCONNECT_PROJECT_ID: 'TU_PROJECT_ID_AQUI'
```

Reemplaza `TU_PROJECT_ID_AQUI` con el Project ID real que obtuviste.

## ⚠️ Notas Importantes

- El Project ID es **gratis** y no tiene límites para proyectos pequeños
- Puedes crear múltiples proyectos si necesitas diferentes configuraciones
- El Project ID es público y seguro compartirlo (no es una clave secreta)
- Una vez configurado, el QR code de WalletConnect funcionará correctamente

## 🔍 Dónde Encontrar el Project ID Después

Si ya creaste el proyecto:
1. Ve a la página de **Projects**
2. Haz clic en tu proyecto "MusicToken Ring"
3. El Project ID estará visible en la parte superior o en la configuración del proyecto

## ✅ Verificación

Después de actualizar el Project ID:
1. Recarga la página de musictokenring.xyz
2. Intenta conectar Binance Wallet
3. Deberías ver el QR code funcionando correctamente
4. Al escanear, debería conectarse sin problemas
