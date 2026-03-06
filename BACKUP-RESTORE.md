# 🔄 Guía de Restauración de Backup

Este documento contiene información sobre cómo restaurar el sistema a un punto de funcionamiento estable.

## 📅 Punto de Restauración Actual

**Fecha de Backup:** 2026-03-06 12:52:47
**Tag de Git:** `backup-20260306-125247`
**Branch de Backup:** `backup-stable-20260306`
**Commit:** `d3418e1`

## ✅ Estado del Sistema en este Backup

### Funcionalidades Verificadas y Funcionando:

1. **Sistema Multi-Red de Depósitos**
   - ✅ Detección automática de depósitos directos
   - ✅ Detección mejorada de depósitos indirectos
   - ✅ Sincronización automática con vault balance
   - ✅ Escaneo en chunks para rangos grandes
   - ✅ Soporte para Base, Ethereum, Polygon, Optimism, Arbitrum

2. **Sistema de Créditos**
   - ✅ UI actualizada correctamente
   - ✅ Balance reflejado automáticamente
   - ✅ 1 crédito = 1 USDC fijo
   - ✅ Actualización forzada después de cargar balance

3. **Migraciones SQL**
   - ✅ Todas las migraciones aplicadas y verificadas
   - ✅ Función `decrement_user_credits` creada
   - ✅ Columna `network` en tabla `deposits`
   - ✅ Constraints y índices correctos

4. **Servidor Backend**
   - ✅ Inicialización bajo demanda de servicios
   - ✅ Manejo robusto de errores 503/404
   - ✅ Endpoints funcionando correctamente
   - ✅ Multi-chain listener integrado

5. **Scripts de Utilidad**
   - ✅ `verify-migrations.js` - Verificación de migraciones SQL
   - ✅ `verify-server.js` - Verificación del servidor
   - ✅ `process-missing-deposit.js` - Procesar depósitos faltantes
   - ✅ `find-user-deposit.js` - Encontrar depósitos del usuario

## 🔧 Cómo Restaurar este Backup

### Opción 1: Restaurar desde Tag

```bash
# Ver todos los tags disponibles
git tag -l

# Restaurar al tag específico
git checkout backup-YYYYMMDD-HHMMSS

# O crear un nuevo branch desde el tag
git checkout -b restore-backup backup-YYYYMMDD-HHMMSS
```

### Opción 2: Restaurar desde Branch de Backup

```bash
# Ver branches de backup disponibles
git branch -a | grep backup

# Cambiar al branch de backup
git checkout backup-stable-YYYYMMDD

# O crear un nuevo branch desde el backup
git checkout -b restore-from-backup backup-stable-YYYYMMDD
```

### Opción 3: Restaurar desde Commit Específico

```bash
# Ver historial de commits
git log --oneline

# Restaurar al commit específico
git checkout d3418e1

# O crear un nuevo branch desde el commit
git checkout -b restore-backup d3418e1
```

## 📋 Checklist de Restauración

Después de restaurar el código, verifica:

- [ ] **Migraciones SQL aplicadas**
  ```bash
  node backend/verify-migrations.js
  ```

- [ ] **Servidor funcionando**
  ```bash
  node backend/verify-server.js
  ```

- [ ] **Variables de entorno configuradas**
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `PLATFORM_WALLET_ADDRESS`
  - `USDC_ADDRESS` (y variantes por red)
  - `BASE_RPC_URL`, `ETHEREUM_RPC_URL`, etc.

- [ ] **Dependencias instaladas**
  ```bash
  npm install
  ```

- [ ] **Servidor iniciado correctamente**
  - Verificar logs: `[multi-chain] ✅ Multi-chain listener initialization complete`
  - Verificar logs: `[server] ✅ All services initialized`

## 🗄️ Estado de la Base de Datos

### Tablas Principales:
- ✅ `users` - Usuarios registrados
- ✅ `user_credits` - Saldo de créditos
- ✅ `deposits` - Depósitos procesados (con columna `network`)
- ✅ `claims` - Retiros procesados
- ✅ `vault_balance` - Balance del vault
- ✅ `vault_fees` - Fees acumuladas
- ✅ `platform_settings` - Configuración de la plataforma
- ✅ `social_challenges` - Desafíos sociales

### Funciones RPC:
- ✅ `increment_user_credits(user_id_param, credits_to_add)`
- ✅ `decrement_user_credits(user_id_param, credits_to_subtract)`
- ✅ `update_vault_balance(amount_to_add, tx_hash_param)`
- ✅ `get_vault_balance()`

### Constraints Importantes:
- ✅ `deposits.tx_hash` UNIQUE (previene duplicados)
- ✅ `social_challenges.bet_amount >= 5`
- ✅ RLS habilitado en todas las tablas públicas

## 📝 Notas Importantes

1. **No restaurar sobre cambios no guardados**: Asegúrate de hacer commit o stash de cambios actuales antes de restaurar.

2. **Backup de base de datos**: Este backup solo restaura el código. Para restaurar la base de datos, necesitarías un backup de Supabase.

3. **Variables de entorno**: Las variables de entorno no están en el código, asegúrate de tenerlas configuradas en Render/local.

4. **Estado conocido funcionando**: Este backup representa un estado donde:
   - El sistema multi-red detecta depósitos automáticamente
   - La UI refleja correctamente los créditos
   - Las migraciones están aplicadas
   - El servidor está estable

## 🆘 Si Algo Sale Mal

1. **Verificar logs del servidor** en Render Dashboard
2. **Ejecutar scripts de verificación**:
   ```bash
   node backend/verify-migrations.js
   node backend/verify-server.js
   ```
3. **Revisar errores específicos** y consultar este documento
4. **Restaurar desde este backup** si es necesario

## 📞 Información de Contacto

Para problemas relacionados con este backup, consulta:
- Commits relacionados en git log
- Logs del servidor en Render
- Documentación en `VERIFICAR-MIGRACIONES.md`
- Scripts de utilidad en `backend/`

---

**Última actualización:** 2026-03-06 12:52:47
**Versión del sistema:** Multi-red mejorado con detección de depósitos indirectos
