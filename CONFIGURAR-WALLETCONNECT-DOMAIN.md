# 🔧 Configurar Domain en WalletConnect

## 📋 Pasos para Configurar el Domain

### 1. Haz clic en "Domain" en la sección Tools

### 2. Agregar Dominio Permitido

En la página de Domain, verás un campo para agregar dominios. Debes agregar:

**Dominio principal:**
- `musictokenring.xyz`

**Si también tienes variantes, agrega:**
- `www.musictokenring.xyz` (si usas www)
- `musictokenring.vercel.app` (si quieres permitir el dominio de Vercel para pruebas)

### 3. Verificación del Dominio

WalletConnect puede pedirte verificar el dominio. Esto generalmente implica:

1. Agregar un registro DNS específico, O
2. Subir un archivo de verificación a tu sitio web

Sigue las instrucciones que aparezcan en la pantalla.

### 4. Guardar

Una vez agregado el dominio, haz clic en "Save" o "Add Domain".

## ⚠️ Importante

- Sin configurar el domain, WalletConnect puede no funcionar correctamente en producción
- El domain debe coincidir exactamente con la URL donde está desplegada tu aplicación
- Puedes agregar múltiples dominios si tienes diferentes entornos (desarrollo, staging, producción)

## ✅ Después de Configurar

Una vez configurado el domain y copiado el Project ID:
1. Comparte el Project ID completo
2. Lo actualizaré en el código
3. WalletConnect debería funcionar perfectamente
