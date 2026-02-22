# 🥊 MusicToken Ring - Frontend

Frontend completo para la plataforma de batallas musicales con blockchain.

## 📁 Estructura del Proyecto

```
MusicTokenRing-Frontend/
├── index.html              # Página principal
├── styles/
│   └── main.css           # Estilos CSS completos
├── config/
│   └── config.js          # Configuración (API URLs, contratos)
├── utils/
│   ├── api.js             # Funciones API backend
│   ├── web3.js            # Integración blockchain
│   ├── audio.js           # Manejo de audio
│   └── ui.js              # Funciones UI/UX
├── src/
│   └── app.js             # Lógica principal
└── public/
    └── assets/            # Imágenes, iconos
```

## 🚀 Setup Rápido

### 1. Configurar Backend API

Edita `config/config.js`:

```javascript
const CONFIG = {
    BACKEND_API: 'https://tu-backend.com',  // ← Cambia esto
    CHAIN_ID: 80001,  // Mumbai testnet
    CONTRACT_ADDRESS: '0x...',  // ← Smart contract address
    TOKEN_ADDRESS: '0x...',     // ← Token address
}
```

### 2. Abrir Localmente

```bash
# Opción 1: Con servidor HTTP simple
python3 -m http.server 8000

# Opción 2: Con Node.js
npx serve

# Opción 3: Con VS Code
# - Instala extensión "Live Server"
# - Click derecho en index.html → "Open with Live Server"
```

### 3. Acceder

Abre: http://localhost:8000

## 🌐 Deploy a Producción

### Opción 1: Vercel (Recomendado)

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Seguir instrucciones
```

### Opción 2: Netlify

```bash
# Instalar Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod

# Selecciona la carpeta actual
```

### Opción 3: GitHub Pages

1. Sube el código a GitHub
2. Ve a Settings → Pages
3. Selecciona branch main
4. Listo!

## ⚙️ Configuración

### Backend API

El frontend necesita un backend corriendo. Ver `/musictoken-backend`.

Endpoints requeridos:
- `GET /api/search?q={query}` - Buscar canciones
- `GET /api/track/:id` - Detalles de canción
- `POST /api/battle/start` - Iniciar batalla
- `GET /api/streaming-data/:trackId` - Datos streaming
- `POST /api/deposits/verify` - Verificar tx on-chain y acreditar recarga
- `POST /api/settlement/quote` - Cotizar MTOKEN vs referencia USD para liquidación
- `POST /api/settlement/request-cashout` - Solicitar retiro y registrar comisión

### Flujo recomendado de recarga verificable
1. El usuario transfiere tokens a la wallet de plataforma de la red elegida.
2. Pega el `txHash` en frontend y se envía a `POST /api/deposits/verify`.
3. Backend valida hash, red, contrato/token, destino, confirmaciones e idempotencia.
4. Si todo es válido, backend acredita saldo interno del usuario y devuelve `newBalance`.

### Flujo recomendado de cobro de ganancias
1. El usuario solicita retiro indicando cantidad de MTOKEN.
2. Backend consulta/caché de referencia de precio USD (oracle o proveedor autorizado).
3. Calcula fee/comisión, monto neto y crea orden de liquidación.
4. Marca la operación y responde al frontend con número de solicitud y estado.

### Smart Contracts

Necesitas deploy los contratos en Polygon:

1. **MusicToken.sol** - Token ERC-20
2. **MusicTokenRing.sol** - Lógica de batallas

Ver `/musictoken-contracts` para deploy.

### Variables de Entorno

Actualiza `config/config.js` con:

```javascript
const CONFIG = {
    // Backend
    BACKEND_API: process.env.BACKEND_API || 'http://localhost:3000',
    
    // Blockchain
    CHAIN_ID: 80001,  // 80001 = Mumbai, 137 = Polygon Mainnet
    RPC_URL: 'https://polygon-mumbai.g.alchemy.com/v2/YOUR_KEY',
    
    // Contratos
    CONTRACT_ADDRESS: '0xYourBattleContract',
    TOKEN_ADDRESS: '0xYourTokenContract',
    
    // WalletConnect
    WALLETCONNECT_PROJECT_ID: 'get-from-cloud.walletconnect.com',
}
```

## 🎨 Personalización

### Colores

Edita variables CSS en `styles/main.css`:

```css
:root {
    --neon-blue: #00f3ff;
    --neon-pink: #ff006e;
    --neon-yellow: #ffbe0b;
    --spotify-green: #1DB954;
}
```

### Fuentes

Cambiar en `<head>` de `index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet">
```

### Logo

Reemplaza el emoji 🥊 en header con tu logo:

```html
<h1 class="logo">
    <img src="logo.png" alt="MusicToken Ring">
</h1>
```


## 🚑 Cuando GitHub pide "Resolve conflicts" (sin editar marcas manualmente)

## ✅ Solución real (sin web editor y sin tocar markers)

### Opción A: desde GitHub (sin terminal local)

Si no sabes dónde correr comandos, hazlo directo en GitHub Actions:

1. Ve a **Actions** en tu repo.
2. Abre el workflow **Auto Resolve PR Conflicts**.
3. Click en **Run workflow**.
4. Ingresa:
   - `pr_number`: número del PR (ej. `87`)
   - `strategy`: `ours`
5. Ejecuta. El workflow intentará resolver y empujar el commit a la rama del PR.

Si el run sale en rojo:
- abre el run y revisa el paso que falló,
- si dice `Author identity unknown`, vuelve a ejecutar con la versión nueva del workflow (ya configura `user.name` y `user.email` del bot),
- si dice `Permission denied to push`, revisa en **Settings → Actions → General → Workflow permissions** que esté en **Read and write permissions**,
- si falla muy rápido con script no encontrado, usa la versión nueva del workflow que primero resuelve `head/base` del PR y hace checkout de la rama del PR antes de ejecutar el resolver.

Después vuelve al PR: si todo salió bien, desaparece el estado de "Resolve conflicts" sin editar código manualmente.

**Importante (GitHub 2026):** si en **Actions** solo ves "Get started with GitHub Actions" y no aparece el workflow, normalmente significa que ese YAML todavía **no existe en la rama por defecto** del repo (o Actions está deshabilitado). En ese caso:
- habilita Actions en Settings si aplica,
- o primero incorpora `.github/workflows/auto-resolve-pr-conflicts.yml` en la rama por defecto,
- o usa la Opción B por terminal mientras tanto.

### Opción B: por terminal (si la tienes)

Cuando GitHub muestre conflictos en un PR, resuélvelos por CLI en la rama del PR y empuja el resultado:

```bash
git switch <rama-del-pr>
git fetch origin
bash scripts/merge-with-auto-resolve.sh origin/<rama-base-del-pr> ours
git push origin HEAD
```

Para tu caso típico de pantalla (PR hacia `feature/wall-street-v2`), usa:

```bash
git switch codex/fix-code-issues-and-reverse-broken-merges-v0e0um
git fetch origin
bash scripts/merge-with-auto-resolve.sh origin/feature/wall-street-v2 ours
git push origin HEAD
```

> Esto crea el commit de resolución en la rama del PR. Luego GitHub quita “Resolve conflicts” automáticamente.

Si una fusión queda atorada y aparecen conflictos en `index.html` o scripts runtime, **no edites markers a mano**.

Usa:

```bash
bash scripts/resolve-current-conflicts.sh ours
```

Qué hace:
- resuelve hotspots runtime con estrategia `ours` (o `theirs`),
- resuelve el resto de archivos en conflicto con la misma estrategia,
- ejecuta `npm run check`,
- crea el merge commit automáticamente (`git commit --no-edit`).

Si quieres priorizar cambios de la otra rama:

```bash
bash scripts/resolve-current-conflicts.sh theirs
```

## 🛠️ Resolver de conflictos de PR (force)

Si necesitas forzar la resolución de conflictos contra `main` en tu rama actual:

```bash
bash scripts/resolve-pr20-force.sh main ours origin
```

> Usa `bash ...` explícitamente para evitar problemas de permisos/entorno en Codespaces.

Opciones útiles:

```bash
# Simulación sin cambios
bash scripts/resolve-pr20-force.sh main ours origin --dry-run

# Resolver usando la versión remota en conflictos
bash scripts/resolve-pr20-force.sh main theirs origin
```

### Resolver 2 PRs atorados (#20 y #21)

Si tienes ambas fusiones bloqueadas, ejecuta en secuencia:

```bash
bash scripts/resolve-stuck-prs.sh --prs 20,21 --strategy ours --remote origin
```

También puedes correr uno por uno:

```bash
bash scripts/resolve-pr-by-number.sh --pr 20 --strategy ours --remote origin
bash scripts/resolve-pr-by-number.sh --pr 21 --strategy ours --remote origin
```


## ✅ Control de integridad antes de fusionar

Para evitar que entren marcas de conflictos o artefactos de ramas al runtime:

```bash
npm run check
```

Este check ahora valida:
- sintaxis de `app.js` y `top-streams-fallback.js` (raíz y `src/`),
- marcadores de conflicto (`<<<<<<<`, `=======`, `>>>>>>>`) en **todos** los archivos versionados,
- includes únicos de runtime en `index.html`,
- consistencia de versión entre `mtr-build`, `window.MTR_BUILD_ID` y `?v=` de scripts.

Además, GitHub Actions ejecuta automáticamente esta validación en cada PR/push para bloquear fusiones contaminadas.

## 🧪 Testing

### Test Búsqueda

1. Abre la app
2. Escribe "blinding lights" en buscador
3. Deberían aparecer resultados de Spotify
4. Click en "▶️ Preview" para escuchar

### Test Batalla

1. Selecciona 2 canciones diferentes
2. Click "Confirmar Selección"
3. Coloca apuestas
4. Click "Iniciar Batalla"
5. Deberías escuchar ambas canciones
6. El timer cuenta regresiva de 60s
7. Al final, muestra ganador

### Test Wallet

1. Click "Connect Wallet"
2. Conecta MetaMask
3. Debería mostrar tu balance de $MTOKEN

## 📱 Responsive

La app es responsive y funciona en:
- ✅ Desktop (1920x1080+)
- ✅ Laptop (1366x768+)
- ✅ Tablet (768x1024)
- ✅ Mobile (375x667+)

## 🐛 Troubleshooting

### "Error buscando canciones"

**Problema:** Backend no responde
**Solución:** 
- Verifica que backend está corriendo
- Check URL en config.js
- Revisa consola del navegador (F12)

### "No se puede reproducir audio"

**Problema:** Spotify preview no disponible
**Solución:**
- Algunas canciones no tienen preview
- Prueba con otra canción
- Verifica que no estés en modo "mute"

### "Wallet no conecta"

**Problema:** MetaMask no instalado
**Solución:**
- Instala MetaMask extension
- Cambia a red Polygon Mumbai
- Recarga la página

### "CORS Error"

**Problema:** Backend rechaza peticiones
**Solución:**
- En backend, habilita CORS:
```javascript
app.use(cors({
  origin: 'https://tu-frontend.com'
}))
```

## 📊 Performance

### Optimizaciones

1. **Lazy Loading** - Imágenes cargan on-demand
2. **CSS Minificado** - Reduce tamaño
3. **Caching** - Browser cache habilitado
4. **CDN** - Assets en CDN para speed

### Métricas Target

- ⚡ First Paint: < 1s
- 🎨 LCP: < 2.5s
- 📱 Mobile Score: 90+
- 💻 Desktop Score: 95+

## 🔒 Seguridad

### Best Practices Implementadas

- ✅ Input sanitization
- ✅ XSS protection
- ✅ HTTPS only en producción
- ✅ Content Security Policy
- ✅ No private keys en código

### Headers de Seguridad

Agrega en tu servidor:

```
Content-Security-Policy: default-src 'self'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
```

## 📖 Documentación API

Ver archivos individuales:
- `utils/api.js` - Funciones API
- `utils/web3.js` - Web3 integration
- `utils/audio.js` - Audio management

## 🎯 Roadmap

### v1.0 (Actual)
- [x] Búsqueda Spotify
- [x] Sistema de batallas
- [x] Apuestas básicas
- [x] Audio previews

### v1.1 (Próximo)
- [ ] Wallet integration completa
- [ ] Transacciones on-chain
- [ ] Historial de batallas
- [ ] Leaderboard real

### v2.0 (Futuro)
- [ ] NFT minting
- [ ] Tournaments
- [ ] Mobile app
- [ ] Social features

## 💡 Tips

1. **Testing Local**: Usa `http-server` o `live-server`
2. **Deploy**: Vercel es la opción más fácil
3. **Debug**: Usa Chrome DevTools (F12)
4. **Performance**: Usa Lighthouse para análisis

## 📞 Soporte

¿Problemas? 
1. Check console (F12)
2. Revisa este README
3. Verifica backend está corriendo
4. Crea issue en GitHub

## 🏆 Créditos

Desarrollado para MusicToken Ring
- Spotify API para música
- Ethers.js para blockchain
- Polygon para transacciones

---

**¡Listo para hacer batallas musicales épicas!** 🎵🥊💰
