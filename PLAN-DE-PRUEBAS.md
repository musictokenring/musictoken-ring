# Plan de Pruebas - MusicToken Ring

## Checklist de Pruebas para Verificar Todas las Funciones

### 🔴 CRÍTICO - Funciones que DEBEN funcionar

#### 1. Conexión de Wallet
- [ ] Conectar wallet MetaMask
- [ ] Verificar que muestra la dirección correcta
- [ ] Verificar que muestra el balance de MTR
- [ ] Verificar cambio de red a Base (Chain ID 8453)
- [ ] Verificar que muestra "Wallet conectada"

#### 2. Sistema de Créditos
- [ ] Verificar que muestra "0.00 créditos = $0.00 USDC" cuando no hay créditos
- [ ] Verificar que el cálculo es 1:1 (1 crédito = 1 USDC)
- [ ] Verificar que carga el balance desde el backend
- [ ] Verificar que no hay errores en consola

#### 3. Vault de Liquidez
- [ ] Verificar que muestra el balance del vault (puede ser 0.00)
- [ ] Verificar que no muestra "Error al cargar"
- [ ] Verificar que el link a BaseScan funciona
- [ ] Verificar que se actualiza automáticamente

#### 4. Depósitos
- [ ] Verificar que muestra la dirección de depósito correcta
- [ ] Verificar que muestra el QR code para depósito
- [ ] Verificar que detecta depósitos de MTR
- [ ] Verificar que detecta depósitos de USDC
- [ ] Verificar que calcula créditos correctamente (valor USDC - 5% fee)
- [ ] Verificar que registra el fee en el vault

#### 5. Apuestas/Batallas
- [ ] Verificar que permite seleccionar canción
- [ ] Verificar que permite ingresar cantidad de créditos
- [ ] Verificar que valida balance suficiente
- [ ] Verificar que descuenta créditos al apostar
- [ ] Verificar que calcula fee del 2% del pozo
- [ ] Verificar que el ganador recibe créditos correctos (pozo - fee)

#### 6. Retiros/Claims
- [ ] Verificar que muestra créditos disponibles
- [ ] Verificar que valida mínimo 100 créditos
- [ ] Verificar que calcula fee del 5%
- [ ] Verificar que muestra USDC a recibir (créditos - 5%)
- [ ] Verificar que procesa el retiro correctamente
- [ ] Verificar que envía USDC a la wallet del usuario
- [ ] Verificar que registra el fee en el vault

#### 7. Backend API
- [ ] Verificar `/api/health` responde correctamente
- [ ] Verificar `/api/vault/balance` responde correctamente
- [ ] Verificar `/api/user/credits/:address` responde correctamente
- [ ] Verificar que CORS funciona (no hay errores de CORS)
- [ ] Verificar que todos los endpoints responden sin errores 404

### 🟡 IMPORTANTE - Funciones secundarias

#### 8. Navegación y UI
- [ ] Verificar que todos los modos funcionan (Quick, Private, Practice, Tournament, Social)
- [ ] Verificar que la selección de canciones funciona
- [ ] Verificar que los botones responden correctamente
- [ ] Verificar que no hay errores de JavaScript en consola

#### 9. Base de Datos
- [ ] Verificar que se crean usuarios correctamente
- [ ] Verificar que se registran depósitos
- [ ] Verificar que se registran retiros
- [ ] Verificar que se registran fees en vault_fees
- [ ] Verificar que se actualiza vault_balance

### 🟢 OPCIONAL - Funciones adicionales

#### 10. Funciones Sociales
- [ ] Verificar creación de desafíos sociales
- [ ] Verificar aceptación de desafíos
- [ ] Verificar compartir enlaces

---

## Cómo Ejecutar las Pruebas

### Paso 1: Preparación
1. Abre la consola del navegador (F12)
2. Ve a la pestaña "Console"
3. Ve a la pestaña "Network" para ver requests

### Paso 2: Pruebas Básicas
1. Conecta tu wallet
2. Verifica que no hay errores en consola
3. Verifica que el vault muestra balance (puede ser 0)

### Paso 3: Prueba de Depósito (Requiere fondos)
1. Copia la dirección de depósito
2. Envía una pequeña cantidad de MTR o USDC desde otra wallet
3. Espera 1-2 minutos
4. Verifica que aparecen créditos en tu cuenta

### Paso 4: Prueba de Apuesta (Requiere créditos)
1. Si tienes créditos, prueba hacer una apuesta pequeña
2. Verifica que se descuentan créditos
3. Verifica que el fee se registra

### Paso 5: Prueba de Retiro (Requiere créditos)
1. Si tienes más de 100 créditos, prueba retirar
2. Verifica que calcula el fee correctamente
3. Verifica que envía USDC a tu wallet

---

## Errores Comunes a Verificar

### ❌ Errores de CORS
- Síntoma: "Access to fetch... blocked by CORS policy"
- Solución: Verificar que el backend tiene CORS configurado

### ❌ Errores 404
- Síntoma: "GET ... 404 (Not Found)"
- Solución: Verificar que la URL del backend es correcta

### ❌ Errores de Wallet
- Síntoma: "Wallet not connected" o errores de MetaMask
- Solución: Verificar que MetaMask está instalado y conectado

### ❌ Errores de Red
- Síntoma: "Failed to fetch" o errores de red
- Solución: Verificar que el backend está corriendo en Render

---

## Checklist Rápido Pre-Producción

- [ ] Backend corriendo en Render ✅
- [ ] Frontend desplegado en Vercel ✅
- [ ] CORS configurado correctamente ✅
- [ ] Variables de entorno configuradas ✅
- [ ] Migración SQL ejecutada en Supabase
- [ ] Vault tiene balance inicial (opcional)
- [ ] No hay errores en consola del navegador
- [ ] Todos los endpoints del backend responden
- [ ] Wallet se conecta correctamente
- [ ] Balance del vault se muestra correctamente

---

## Próximos Pasos Después de las Pruebas

1. Si encuentras errores → Reportarlos y corregirlos
2. Si todo funciona → Listo para producción
3. Monitorear logs del backend en Render
4. Monitorear errores en el frontend
