# 🔧 Solución: Errores de Rate Limit en RPC

## ⚠️ Problema Identificado

Los servicios están funcionando correctamente, pero están fallando cuando intentan vender MTR debido a errores de **rate limit** del RPC público de Base:

```
[mtr-swap] ❌ Error selling MTR: HTTP request failed. Status: 429
[liquidity-manager] ⚠️ Could not sell MTR: HTTP request failed.
```

**Causa:** El RPC público `https://mainnet.base.org` tiene límites muy bajos y está rechazando las solicitudes.

---

## ✅ Solución: Usar RPC con API Key

### Opción 1: Alchemy (Recomendado)

1. **Crear cuenta en Alchemy:**
   - Ve a [https://www.alchemy.com](https://www.alchemy.com)
   - Crea una cuenta gratuita
   - Crea una nueva app para "Base Mainnet"
   - Obtén tu API Key

2. **Configurar en Render:**
   ```
   BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/TU_API_KEY
   ```

### Opción 2: Infura

1. **Crear cuenta en Infura:**
   - Ve a [https://www.infura.io](https://www.infura.io)
   - Crea una cuenta gratuita
   - Crea un nuevo proyecto
   - Selecciona "Base" como red
   - Obtén tu API Key

2. **Configurar en Render:**
   ```
   BASE_RPC_URL=https://base-mainnet.infura.io/v3/TU_API_KEY
   ```

### Opción 3: QuickNode

1. **Crear cuenta en QuickNode:**
   - Ve a [https://www.quicknode.com](https://www.quicknode.com)
   - Crea una cuenta gratuita
   - Crea un endpoint para "Base Mainnet"
   - Obtén tu URL

2. **Configurar en Render:**
   ```
   BASE_RPC_URL=https://TU_ENDPOINT.quiknode.pro/TU_API_KEY
   ```

---

## 🚀 Cómo Configurar

### Paso 1: Obtener API Key

Elige uno de los proveedores arriba y obtén tu API Key.

### Paso 2: Agregar en Render

1. Ve a Render Dashboard → Tu Servicio → Environment
2. Agrega nueva variable:
   ```
   Nombre: BASE_RPC_URL
   Valor: https://base-mainnet.g.alchemy.com/v2/TU_API_KEY
   ```
   (Reemplaza `TU_API_KEY` con tu API key real)

3. Guarda cambios
4. Render reiniciará automáticamente

---

## 📊 Resultado Esperado

Después de configurar un RPC con API key:

- ✅ Los errores `429 (over rate limit)` desaparecerán
- ✅ Los swaps funcionarán correctamente
- ✅ El liquidity manager podrá vender MTR cuando sea necesario

---

## ⚠️ Nota Importante

El RPC público `https://mainnet.base.org` es gratuito pero tiene límites muy bajos. Para producción, **siempre usa un RPC con API key** para evitar estos problemas.

---

## 🎯 Resumen

**Estado actual:**
- ✅ Servicios inicializados correctamente
- ✅ Variables configuradas
- ❌ Errores de rate limit al usar RPC público

**Solución:**
- Agregar `BASE_RPC_URL` con un proveedor que tenga API key (Alchemy, Infura, QuickNode)

**¿Quieres que te ayude a configurar uno de estos proveedores?** 🚀
