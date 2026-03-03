# 🎥 Cómo Agregar el Video al Repositorio

## ✅ Video Listo

- **Nombre:** `batallas-en-vivo.mp4`
- **Resolución:** 1280x720p
- **Ubicación requerida:** `assets/videos/batallas-en-vivo.mp4`

## 📋 Pasos para Agregar el Video

### Opción 1: Copiar Manualmente y Hacer Push

1. **Copia el archivo** `batallas-en-vivo.mp4` a la carpeta:
   ```
   assets/videos/batallas-en-vivo.mp4
   ```

2. **Agrega el archivo a Git:**
   ```bash
   git add assets/videos/batallas-en-vivo.mp4
   ```

3. **Haz commit:**
   ```bash
   git commit -m "feat: Agregar video batallas-en-vivo.mp4 (1280x720p)"
   ```

4. **Haz push:**
   ```bash
   git push origin main
   ```

### Opción 2: Usar PowerShell (Windows)

```powershell
# Copiar el archivo (ajusta la ruta de origen)
Copy-Item "C:\ruta\a\tu\video\batallas-en-vivo.mp4" -Destination "assets\videos\batallas-en-vivo.mp4"

# Agregar a Git
git add assets/videos/batallas-en-vivo.mp4

# Commit
git commit -m "feat: Agregar video batallas-en-vivo.mp4 (1280x720p)"

# Push
git push origin main
```

## ⚠️ Nota Importante sobre Tamaño

Si el archivo de video es muy grande (> 50MB), Git puede tener problemas. En ese caso:

1. **Optimiza el video** antes de subirlo (recomendado < 10MB)
2. O usa **Git LFS** (Large File Storage)
3. O aloja el video en un **CDN** y actualiza la URL en el código

## ✅ Verificación

Después de hacer push:

1. ✅ Verifica que el archivo esté en GitHub
2. ✅ Espera a que Vercel redesplegue automáticamente
3. ✅ Prueba el sitio en producción
4. ✅ Verifica que el video se reproduzca en loop

## 🎬 Características del Video

- ✅ Se reproducirá automáticamente
- ✅ Loop infinito
- ✅ Sin sonido (muted)
- ✅ Responsive (se adaptará al contenedor)
- ✅ Resolución 1280x720p es perfecta para web

## 📝 Si Necesitas Ayuda

Si el archivo es muy grande o tienes problemas, puedo:
1. Actualizar el código para usar una URL externa (YouTube, Vimeo, CDN)
2. Configurar Git LFS para archivos grandes
3. Optimizar el video antes de subirlo
