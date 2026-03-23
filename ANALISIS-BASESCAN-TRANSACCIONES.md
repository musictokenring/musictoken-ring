# 🔍 Análisis de Transacciones en Basescan

## 📋 Información de la Wallet de la Plataforma

**Dirección:** `0x0000000000000000000000000000000000000001`

**Dirección USDC en Base:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

---

## 🔍 Qué Buscar en Basescan

### 1. Transferencias de USDC Salientes (OUT)

**URL para ver transferencias de USDC:**
```
https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913?a=0x0000000000000000000000000000000000000001
```

**Filtros a aplicar:**
- **Tipo:** OUT (salientes)
- **Token:** USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
- **Período:** Últimos 30 días (o más si es necesario)

---

## ⚠️ Transacciones Sospechosas a Identificar

### 1. Transferencias a Direcciones Desconocidas

**Qué buscar:**
- Transferencias de USDC a direcciones que NO sean:
  - Wallets de usuarios registrados
  - Wallets de contratos conocidos (Uniswap, etc.)
  - Wallets internas del sistema

**Indicadores sospechosos:**
- Montos grandes de USDC
- Transferencias sin razón aparente
- Direcciones con poca o ninguna actividad previa
- Direcciones relacionadas con `foodam.xyz` (si conoces la dirección)

---

### 2. Patrones de Ataque

**Qué buscar:**
- Múltiples transferencias pequeñas a la misma dirección
- Transferencias en horarios inusuales
- Transferencias que coinciden con el período de la fuga reportada

---

## 📊 Pasos para Analizar en Basescan

### Paso 1: Ver Todas las Transferencias de USDC

1. Ve a: `https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913?a=0x0000000000000000000000000000000000000001`
2. Haz clic en la pestaña **"Token Transfers"**
3. Filtra por **"OUT"** (salientes)
4. Ordena por **"Value"** (mayor a menor)

### Paso 2: Identificar Transacciones Sospechosas

**Para cada transacción saliente de USDC:**

1. **Verifica la dirección de destino:**
   - Haz clic en la dirección de destino
   - Revisa si tiene actividad relacionada con `foodam.xyz`
   - Verifica si es una dirección conocida

2. **Verifica el monto:**
   - Anota el monto transferido
   - Compara con el monto reportado de la fuga

3. **Verifica la fecha:**
   - Compara con la fecha de la fuga reportada
   - Verifica si coincide con el período sospechoso

4. **Verifica el hash de transacción:**
   - Copia el hash (tx_hash)
   - Úsalo para buscar en los logs del servidor

### Paso 3: Ver Detalles de Transacciones Sospechosas

**Para cada transacción sospechosa:**

1. Haz clic en el hash de la transacción
2. Revisa:
   - **From:** Debe ser `0x0000000000000000000000000000000000000001`
   - **To:** Dirección sospechosa
   - **Value:** Monto en USDC
   - **Timestamp:** Fecha y hora exacta
   - **Block Number:** Número de bloque

---

## 🎯 Qué Hacer con las Transacciones Encontradas

### Si Encuentras Transacciones Sospechosas:

1. **Documenta:**
   - Hash de transacción (tx_hash)
   - Dirección de destino
   - Monto transferido
   - Fecha y hora
   - Block number

2. **Verifica en Supabase:**
   - Busca el hash en la tabla `vault_transactions`
   - Busca el hash en la tabla `claims`
   - Verifica si está registrado en la auditoría

3. **Verifica en Logs del Servidor:**
   - Busca el hash en los logs de Render
   - Busca requests a `/api/claim` en esa fecha
   - Verifica si hay alertas de seguridad relacionadas

4. **Investiga la Dirección de Destino:**
   - Busca la dirección en Basescan
   - Verifica si tiene relación con `foodam.xyz`
   - Revisa otras transacciones de esa dirección

---

## 📋 Checklist de Investigación

- [ ] Revisar todas las transferencias de USDC salientes
- [ ] Identificar transacciones a direcciones desconocidas
- [ ] Verificar montos grandes o sospechosos
- [ ] Comparar fechas con el período de la fuga
- [ ] Documentar todas las transacciones sospechosas
- [ ] Verificar en Supabase si están registradas
- [ ] Verificar en logs del servidor
- [ ] Investigar direcciones de destino

---

## 🔗 Enlaces Útiles

- **Wallet de la Plataforma:** https://basescan.org/address/0x0000000000000000000000000000000000000001
- **USDC Token:** https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
- **Transferencias de USDC:** https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913?a=0x0000000000000000000000000000000000000001

---

## 💡 Notas Importantes

1. **Si no encuentras transacciones sospechosas:**
   - La fuga pudo haber ocurrido antes de que se implementara la auditoría
   - Las transacciones pueden estar en otra red (Ethereum, Polygon, etc.)
   - La dirección puede haber cambiado después de la fuga

2. **Si encuentras transacciones sospechosas:**
   - Documenta todo inmediatamente
   - Verifica si están registradas en la auditoría
   - Si no están registradas, confirma que la fuga ocurrió antes de implementar las medidas de seguridad

3. **Próximos pasos:**
   - Una vez identificadas las transacciones, podemos crear queries SQL específicas para investigarlas
   - Podemos buscar en los logs del servidor usando los hashes de transacción
   - Podemos verificar si las direcciones están relacionadas con otros ataques
