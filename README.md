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
