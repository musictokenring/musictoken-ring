# 🧪 TEST WEBHOOK NOWPayments

## ✅ Configuración Completada

- **Webhook URL:** `https://musictoken-ring.onrender.com/webhook/nowpayments`
- **IPN Secret:** `zZiKQXP/1Nwz/lJt64K5yCOL8GRlPlqd`
- **Variable de entorno:** `IPN_SECRET` (agregar en Render)

---

## 📋 PASOS PARA PROBAR

### 1. Agregar IPN_SECRET en Render

1. Ve a **Render Dashboard** > Tu servicio backend
2. **Environment** > Agregar variable:
   ```
   IPN_SECRET=zZiKQXP/1Nwz/lJt64K5yCOL8GRlPlqd
   ```
3. **Save Changes** (el servicio se reiniciará automáticamente)

### 2. Probar Depósito desde Widget

1. Abre la página de depósitos en tu sitio
2. Localiza el **widget de NOWPayments**
3. Ingresa un monto pequeño: **1 USDC** (o menos si permite)
4. **IMPORTANTE:** En el campo de comentarios/email del widget, ingresa:
   - Tu email: `tu@email.com`
   - O tu wallet: `0x...` (si el widget lo permite)
5. Completa el pago usando cualquier método disponible

### 3. Verificar Logs del Servidor

#### En Render Dashboard:
1. Ve a tu servicio backend
2. Click en **Logs**
3. Busca estas líneas:

```
[nowpayments-webhook] Received payment notification: { payment_id, status, amount }
[nowpayments] Processing deposit: { payment_id, status, amount, currency }
[nowpayments] ✅ Deposit processed successfully: { payment_id, userId, creditsAwarded, fee }
```

#### Logs Esperados (Éxito):

```
[nowpayments-webhook] Received payment notification: {
  payment_id: 'xxxxx',
  status: 'finished',
  amount: '1.00'
}
[nowpayments] Processing deposit: {
  payment_id: 'xxxxx',
  status: 'finished',
  amount: '1.00',
  currency: 'USDC'
}
[nowpayments] ✅ Deposit processed successfully: {
  payment_id: 'xxxxx',
  userId: 'xxx',
  creditsAwarded: 0.95,
  fee: 0.05,
  vaultFee: 0.0375,
  tradingFundFee: 0.0125
}
```

#### Logs de Error (si hay problema):

```
[nowpayments-webhook] Missing signature header
[nowpayments-webhook] Invalid signature
[nowpayments] ❌ Error processing deposit: [mensaje de error]
```

### 4. Verificar en Base de Datos

#### Tabla `deposits`:
```sql
SELECT 
    tx_hash,
    wallet_address,
    amount,
    credits_awarded,
    fee_amount,
    vault_fee,
    trading_fund_fee,
    status,
    payment_id,
    created_at
FROM deposits
WHERE payment_id LIKE '%NOWPAYMENTS%'
ORDER BY created_at DESC
LIMIT 5;
```

#### Tabla `user_credits`:
```sql
SELECT 
    u.email,
    u.wallet_address,
    uc.credits
FROM users u
JOIN user_credits uc ON u.id = uc.user_id
WHERE u.email = 'tu@email.com'  -- O wallet_address
ORDER BY uc.updated_at DESC;
```

---

## 🔍 VERIFICACIONES

### ✅ Checklist de Verificación:

- [ ] IPN_SECRET agregado en Render
- [ ] Servicio reiniciado después de agregar variable
- [ ] Depósito realizado desde widget (1 USDC)
- [ ] Email/wallet incluido en comentarios del widget
- [ ] Webhook recibido (ver logs)
- [ ] Signature verificada correctamente
- [ ] Créditos acreditados (0.95 créditos para 1 USDC)
- [ ] Fee registrado (0.05 USDC)
- [ ] Vault fee registrado (0.0375 USDC = 75%)
- [ ] Trading fund fee registrado (0.0125 USDC = 25%)
- [ ] Estado del depósito: `processed`

---

## 🐛 TROUBLESHOOTING

### Error: "Missing signature"
- **Causa:** NOWPayments no está enviando el header `x-nowpayments-sig`
- **Solución:** Verificar configuración en NOWPayments Dashboard

### Error: "Invalid signature"
- **Causa:** IPN_SECRET incorrecto o no coincide
- **Solución:** 
  1. Verificar que `IPN_SECRET` en Render sea exactamente: `zZiKQXP/1Nwz/lJt64K5yCOL8GRlPlqd`
  2. Verificar que el IPN Secret en NOWPayments Dashboard sea el mismo
  3. Reiniciar servicio después de cambiar variable

### Error: "Payment not finished"
- **Causa:** El pago aún está en proceso
- **Solución:** Esperar a que el pago se complete (NOWPayments enviará otro webhook)

### Error: "Already processed"
- **Causa:** El depósito ya fue procesado (idempotencia funcionando)
- **Solución:** ✅ Esto es correcto, significa que el sistema está evitando duplicados

### No se reciben créditos
- **Causa:** Email/wallet no coincide con usuario en DB
- **Solución:** 
  1. Verificar que el email/wallet en comentarios del widget coincida con tu cuenta
  2. El depósito quedará como `pending_user_link` hasta que se vincule

---

## 📊 CÁLCULOS ESPERADOS

Para un depósito de **1 USDC**:

- **Monto depositado:** 1.00 USDC
- **Fee (5%):** 0.05 USDC
- **Créditos acreditados (95%):** 0.95 créditos
- **Vault fee (75% del fee):** 0.0375 USDC
- **Trading fund fee (25% del fee):** 0.0125 USDC

---

## 📝 NOTAS

1. **Idempotencia:** El sistema verifica `payment_id` para evitar procesar el mismo depósito dos veces
2. **Email/Wallet:** Es crítico incluir email o wallet en comentarios del widget para vincular el depósito
3. **Polling:** El webhook retorna 200 OK rápidamente, pero el procesamiento puede tomar unos segundos
4. **Logs:** Todos los eventos importantes se registran en los logs del servidor

---

**Estado:** ✅ Listo para probar
