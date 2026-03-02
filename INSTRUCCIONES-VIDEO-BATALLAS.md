# 🎥 Instrucciones: Agregar Video de Batallas en Vivo

## ✅ Cambios Aplicados

He actualizado la sección "Batallas en vivo EN DESARROLLO" para mostrar un video en loop.

## 📁 Ubicación del Video

Coloca tu video en la siguiente ubicación:

```
assets/videos/batallas-en-vivo.mp4
```

O si prefieres usar WebM (mejor compresión):

```
assets/videos/batallas-en-vivo.webm
```

## 🎬 Características del Video

El video se reproducirá con las siguientes características:
- ✅ **Autoplay**: Se reproduce automáticamente al cargar la página
- ✅ **Loop**: Se reproduce en bucle infinito
- ✅ **Muted**: Sin sonido (requerido para autoplay en navegadores)
- ✅ **Responsive**: Se adapta al tamaño del contenedor
- ✅ **Overlay**: El texto "Batallas en vivo" y "En desarrollo" aparecen sobre el video

## 📋 Pasos para Agregar el Video

### Opción 1: Video Local (Recomendado)

1. **Crea la carpeta** (si no existe):
   ```
   assets/videos/
   ```

2. **Coloca tu video**:
   - Nombre: `batallas-en-vivo.mp4` o `batallas-en-vivo.webm`
   - Ubicación: `assets/videos/batallas-en-vivo.mp4`

3. **Formato recomendado**:
   - **Formato**: MP4 (H.264) o WebM
   - **Resolución**: 1920x1080 o similar
   - **Duración**: Cualquiera (se repetirá en loop)
   - **Tamaño**: Optimiza para web (recomendado < 10MB)

### Opción 2: Video desde URL Externa

Si prefieres alojar el video en otro lugar (YouTube, Vimeo, CDN), puedo actualizar el código para usar una URL externa.

## 🔧 Personalización Opcional

Si quieres ajustar el video, puedes modificar estas propiedades en `index.html`:

```html
<video id="batallasVideo" 
       autoplay 
       muted 
       loop 
       playsinline 
       class="absolute inset-0 w-full h-full object-cover z-0 opacity-80">
```

**Propiedades ajustables:**
- `opacity-80` → Cambia la opacidad (0-100)
- `object-cover` → Cómo se ajusta el video (`cover`, `contain`, `fill`)
- Puedes agregar controles con `controls` (no recomendado para loop)

## 🎨 Estilo del Overlay

El texto sobre el video tiene:
- Fondo semitransparente (`bg-black/20`)
- Sombra para mejor legibilidad (`drop-shadow-lg`)
- Efecto neon en el título (`neon-text-cyan`)

## ✅ Verificación

Después de agregar el video:

1. ✅ Verifica que el archivo esté en `assets/videos/batallas-en-vivo.mp4`
2. ✅ Abre el sitio en producción
3. ✅ Verifica que el video se reproduzca automáticamente
4. ✅ Verifica que se repita en loop
5. ✅ Verifica que el texto sea legible sobre el video

## 🐛 Solución de Problemas

### El video no se reproduce
- Verifica que el archivo exista en la ruta correcta
- Verifica que el formato sea MP4 o WebM
- Revisa la consola del navegador (F12) para errores

### El video se ve muy oscuro/claro
- Ajusta `opacity-80` a otro valor (ej: `opacity-60` o `opacity-90`)
- O ajusta `bg-black/20` del overlay

### El video no se ajusta bien
- Cambia `object-cover` a `object-contain` si quieres ver todo el video
- O ajusta la resolución del video

## 📝 Nota

Si necesitas usar una URL externa o cambiar la ubicación del video, avísame y actualizo el código.
