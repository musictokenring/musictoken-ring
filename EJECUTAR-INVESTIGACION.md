# 🔍 GUÍA: Cómo Ejecutar la Investigación de Fuga de Fondos

## 📋 OPCIÓN 1: Ejecutar Queries SQL en Supabase (RECOMENDADO)

### Paso 1: Abre Supabase SQL Editor

1. Ve a tu proyecto en Supabase: https://supabase.com/dashboard
2. Selecciona tu proyecto
3. Ve a **SQL Editor** en el menú lateral
4. Haz clic en **New Query**

### Paso 2: Ejecuta las Queries

He creado el archivo `QUERIES-SQL-INVESTIGACION.sql` con todas las queries necesarias.

**Ejecuta estas queries en orden:**

1. **Query 1:** Claims con Wallet Incorrecta
   - Muestra todos los claims donde la wallet de destino no coincide con la wallet del usuario
   - **Busca:** Claims sospechosos

2. **Query 2:** Resumen de Claims con Wallet Incorrecta
   - Agrupa por wallet de destino y muestra totales
   - **Busca:** Montos totales robados por dirección

3. **Query 3:** Transacciones del Vault a Direcciones Desconocidas
   - Muestra retiros del vault a direcciones que no son usuarios
   - **Busca:** Transacciones sospechosas del vault

4. **Query 4:** Resumen de Transacciones Sospechosas
   - Agrupa transacciones sospechosas por dirección
   - **Busca:** Direcciones que recibieron más fondos

5. **Query 5:** Alertas de Seguridad
   - Muestra alertas de wallet mismatch
   - **Busca:** Intentos detectados de fraude

6. **Query 6:** Claims Grandes Recientes
   - Claims grandes de los últimos 30 días
   - **Busca:** Patrones de ataque

7. **Query 7:** Resumen General
   - Estadísticas generales de claims
   - **Busca:** Totales y comparaciones

8. **Query 8:** Todas las Transacciones del Vault
   - Lista completa para revisión manual
   - **Busca:** Cualquier transacción sospechosa

9. **Query 9:** Top 10 Direcciones Sospechosas
   - Las direcciones que recibieron más fondos sin ser usuarios
   - **Busca:** Direcciones del atacante

### Paso 3: Analiza los Resultados

**Qué buscar:**

1. **Claims con `wallet_status = '⚠️ MISMATCH'`**
   - Estos son claims donde alguien intentó reclamar a una wallet diferente
   - Anota las direcciones sospechosas

2. **Transacciones con `address_status = '⚠️ NO ES USUARIO'`**
   - Estas son transacciones del vault a direcciones desconocidas
   - Anota las direcciones y montos

3. **Direcciones en el Top 10**
   - Estas son las direcciones más sospechosas
   - Verifícalas en Basescan

---

## 📋 OPCIÓN 2: Ejecutar Script Node.js (Si tienes variables de entorno configuradas)

### Requisitos:

1. Variables de entorno configuradas:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. Ejecutar desde la carpeta `backend`:

```bash
cd backend
node investigate-fund-leak.js
```

**Nota:** Si no tienes las variables de entorno configuradas localmente, usa la Opción 1 (SQL Editor).

---

## 🔍 QUÉ HACER CON LOS RESULTADOS

### 1. Identificar Direcciones Sospechosas

Cuando encuentres direcciones sospechosas en los resultados:

1. **Copia la dirección**
2. **Verifícala en Basescan:**
   ```
   https://basescan.org/address/[DIRECCION]
   ```
3. **Revisa:**
   - Transacciones entrantes desde `PLATFORM_WALLET`
   - Montos transferidos
   - Fechas de las transacciones
   - Si coincide con el dominio `foodam.xyz` mencionado

### 2. Calcular Montos Totales

**Suma los montos de:**
- Claims con wallet incorrecta que fueron completados
- Transacciones del vault a direcciones desconocidas
- Esto te dará el monto total robado

### 3. Documentar Hallazgos

**Crea un documento con:**
- Direcciones sospechosas encontradas
- Montos totales robados
- Fechas de las transacciones
- Hashes de transacciones (tx_hash)
- IPs y user agents (si están disponibles)

---

## 🎯 QUERIES PRIORITARIAS

Si solo tienes tiempo para ejecutar algunas queries, ejecuta estas primero:

1. **Query 2:** Resumen de Claims con Wallet Incorrecta
   - Te dará un resumen rápido de las direcciones sospechosas

2. **Query 4:** Resumen de Transacciones Sospechosas
   - Te mostrará las direcciones que recibieron más fondos

3. **Query 9:** Top 10 Direcciones Sospechosas
   - Te dará las direcciones más críticas para investigar

---

## 📊 INTERPRETACIÓN DE RESULTADOS

### Si encuentras resultados:

✅ **Claims con wallet incorrecta:**
- Estos son intentos de fraude detectados
- Si tienen `status = 'completed'`, fueron exitosos
- Suma los `usdc_amount` para obtener el total robado

✅ **Transacciones del vault a direcciones desconocidas:**
- Estas son transferencias directas del vault
- Si tienen `status = 'completed'`, fueron exitosas
- Verifica los `tx_hash` en Basescan

✅ **Alertas de seguridad:**
- Estas son detecciones automáticas de fraude
- Si hay muchas, indica intentos de ataque
- Revisa las IPs para identificar patrones

### Si NO encuentras resultados:

✅ **No hay claims con wallet incorrecta:**
- Esto es bueno - significa que la corrección funcionó
- Pero la fuga ya pudo haber ocurrido antes

✅ **No hay transacciones sospechosas:**
- Esto es bueno - significa que no hay fugas recientes
- Pero revisa transacciones más antiguas si es necesario

---

## 🚨 ACCIONES INMEDIATAS SI ENCUENTRAS FUGA

1. **Documenta todo:**
   - Direcciones sospechosas
   - Montos robados
   - Hashes de transacciones
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

---

## 📞 SIGUIENTE PASO

**Ejecuta las queries SQL y comparte los resultados conmigo para ayudarte a interpretarlos.**

¿Quieres que te ayude a interpretar los resultados cuando los tengas?
