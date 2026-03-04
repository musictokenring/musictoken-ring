# Integración Ramp Network - Guía de Configuración

## 📋 Resumen

Ramp Network permite a los usuarios comprar USDC directamente en Base network usando:
- 💳 Tarjeta de crédito/débito
- 🏦 PSE (Colombia)
- 📱 Apple Pay
- 📱 Google Pay

Sin necesidad de usar bridges manuales o salir del sitio.

## 🔑 Configuración de API Keys

### 1. Staging API Key (Pruebas)
- **Estado**: En revisión por Ramp Network
- **Cuándo**: Próximamente
- **Dónde configurar**: `src/ramp-integration.js` línea 12
  ```javascript
  stagingApiKey: 'TU_STAGING_API_KEY_AQUI',
  ```

### 2. Production API Key
- **Estado**: Pendiente de due diligence
- **Cuándo**: Después de aprobación de staging
- **Dónde configurar**: `src/ramp-integration.js` línea 13
  ```javascript
  productionApiKey: 'TU_PRODUCTION_API_KEY_AQUI',
  ```

## 🚀 Cómo Funciona

1. Usuario conecta su wallet (MetaMask, Trust Wallet, etc.)
2. Usuario hace clic en "Comprar USDC con Ramp Network"
3. Se abre el widget de Ramp con configuración predefinida:
   - **Red**: Base (8453)
   - **Token**: USDC
   - **Wallet destino**: La wallet conectada del usuario
   - **Moneda fiat**: COP (Colombia) o USD
4. Usuario completa la compra en el widget
5. USDC se envía directamente a la wallet del usuario en Base
6. El backend listener detecta el depósito automáticamente
7. Créditos se acreditan automáticamente (1 USDC = 1 crédito)

## 📁 Archivos Modificados

1. **`src/ramp-integration.js`** (NUEVO)
   - Módulo principal de integración con Ramp Network
   - Maneja inicialización del SDK, configuración del widget, eventos

2. **`src/deposit-ui.js`** (MODIFICADO)
   - Agregada sección de Ramp Network en la UI de depósitos
   - Botones para montos predefinidos ($10, $20, $50 USD)
   - Botón especial para Colombia (COP)

3. **`index.html`** (MODIFICADO)
   - Agregado script de `ramp-integration.js` antes de otros scripts

## 🎨 UI Agregada

Se agregó una nueva sección en la página de depósitos con:
- Botones de montos rápidos ($10, $20, $50 USD)
- Botón especial para Colombia (COP)
- Botón principal "Comprar USDC con Ramp Network"
- Mensaje informativo sobre requerimiento de wallet

## ⚙️ Configuración Actual

```javascript
{
    hostAppName: 'Music Token Ring',
    hostLogoUrl: 'https://musictokenring.xyz/logo.png', // TODO: Actualizar con logo real
    swapAsset: 'BASE_USDC',
    swapNetwork: 'BASE',
    fiatCurrency: 'COP', // Por defecto Colombia
    variant: 'auto' // Widget overlay automático
}
```

## 🔧 Próximos Pasos

1. **Esperar API Key de Staging**
   - Ramp Network enviará el key después de revisar la solicitud
   - Actualizar `stagingApiKey` en `src/ramp-integration.js`

2. **Probar en Staging**
   - Probar con montos pequeños ($5-10 USD)
   - Verificar que USDC llegue correctamente a la wallet
   - Verificar que el backend listener detecte el depósito

3. **Configurar Logo**
   - Subir logo de MusicToken Ring a un CDN público
   - Actualizar `hostLogoUrl` en la configuración

4. **Due Diligence para Production**
   - Completar proceso de due diligence con Ramp
   - Obtener production API key
   - Actualizar `productionApiKey` en el código

5. **Monitoreo**
   - Configurar eventos de Ramp para tracking
   - Monitorear conversiones y errores
   - Ajustar UX según feedback de usuarios

## 📚 Documentación de Referencia

- **Ramp Network Docs**: https://docs.rampnetwork.com/
- **SDK Reference**: https://docs.rampnetwork.com/sdk-reference
- **Web Integration**: https://docs.rampnetwork.com/web/quick-start-embedded
- **Configuration Options**: https://docs.rampnetwork.com/configuration

## 🐛 Troubleshooting

### Widget no se abre
- Verificar que la wallet esté conectada
- Verificar que el API key esté configurado correctamente
- Revisar consola del navegador para errores

### USDC no llega a la wallet
- Verificar que la red sea Base (8453)
- Verificar que la dirección de wallet sea correcta
- Revisar transacción en BaseScan

### Backend no detecta depósito
- Verificar que el listener esté corriendo
- Verificar que la dirección de depósito sea la correcta
- Revisar logs del backend

## ✅ Checklist de Implementación

- [x] Crear módulo `ramp-integration.js`
- [x] Integrar UI en sección de depósitos
- [x] Agregar botones de montos predefinidos
- [x] Configurar para Base network y USDC
- [x] Manejar eventos del widget
- [ ] **PENDIENTE**: Recibir staging API key de Ramp
- [ ] **PENDIENTE**: Configurar staging API key
- [ ] **PENDIENTE**: Probar en staging environment
- [ ] **PENDIENTE**: Subir logo y actualizar URL
- [ ] **PENDIENTE**: Completar due diligence para production
- [ ] **PENDIENTE**: Configurar production API key
