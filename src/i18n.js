/* MTR i18n -- traducción de la interfaz sin tocar el markup.
 *
 * El español sigue siendo el idioma fuente: el HTML y el JS se escriben en
 * español como siempre. Cuando el idioma activo es otro, este módulo recorre
 * los nodos de texto (y placeholder/title/aria-label) y reemplaza los que
 * coinciden EXACTAMENTE (ignorando espacios de los bordes) con una entrada del
 * diccionario. Un MutationObserver aplica lo mismo al contenido que la app
 * pinta después (innerHTML, textContent, toasts), así que sumar cobertura es
 * solo agregar entradas a DICT -- no hay que marcar cada elemento.
 *
 * Claves de UNA sola palabra ("Rival", "Amigos", "Empate"...) podrían ser
 * también el título de una canción o el nombre de un jugador, así que solo se
 * aplican dentro de controles y encabezados (button, nav, label, h1-h3) o de un
 * elemento marcado con [data-i18n]. Las de varias palabras se aplican en todos
 * lados.
 *
 * Lo que NO se traduce a propósito: <script>/<style>, campos editables, y
 * cualquier cosa dentro de [data-no-i18n] (contenido del usuario: nombres,
 * canciones, mensajes).
 *
 * API: MTRI18n.lang, MTRI18n.setLang('en'|'es'), MTRI18n.t('texto en español').
 */
(function (global) {
    'use strict';

    var SUPPORTED = ['es', 'en'];
    var STORAGE_KEY = 'mtr_lang';

    // Español -> inglés. Claves con los espacios internos normalizados a uno.
    var DICT = {
        en: {
            // --- Barra de navegación y encabezados ---
            'Jugar': 'Play',
            'Torneos': 'Tournaments',
            'Cartera': 'Wallet',
            'Perfil': 'Profile',
            'Entrar': 'Log in',
            'créditos': 'credits',
            'crédito': 'credit',
            'Notificaciones de tus desafíos': 'Notifications for your challenges',

            // --- Bienvenida (visitantes) ---
            'Batallas de música en vivo': 'Live music battles',
            'Tu canción contra la suya.': 'Your song against theirs.',
            'Gana el mejor gusto.': 'Best taste wins.',
            'Elegí una canción, desafiá a un amigo o a cualquiera en segundos y apostá créditos. Empezá gratis con el Modo Práctica.':
                'Pick a song, challenge a friend or anyone in seconds and bet credits. Start free with Practice Mode.',
            'Crear cuenta gratis': 'Create free account',
            'CREAR CUENTA GRATIS': 'CREATE FREE ACCOUNT',
            'Entrar con tu wallet': 'Log in with your wallet',
            'Práctica sin riesgo': 'Risk-free practice',
            'Entrá con Google o email': 'Sign in with Google or email',
            'Recargá y retirá en pesos': 'Top up and cash out',

            // --- Jugar ---
            'Torneos Express · 14 géneros': 'Express Tournaments · 14 genres',
            'Cada 10 minutos · apuestas en créditos': 'Every 10 minutes · bets in credits',
            'Nuevo': 'New',
            'Programa de Artistas': 'Artist Program',
            'Reclamá tus canciones y sumá regalías cada vez que las elijan en una batalla':
                'Claim your songs and earn royalties every time they are picked in a battle',
            'Elige tu modo': 'Choose your mode',
            'Batalla, apuesta y demuestra tu gusto musical': 'Battle, bet and prove your music taste',
            'Modo Práctica': 'Practice Mode',
            'Sin riesgo contra la CPU. Perfecto para empezar.': 'Risk-free against the CPU. Perfect to get started.',
            'Sin riesgo': 'No risk',
            'Aprende': 'Learn',
            'PRACTICAR': 'PRACTICE',
            'Desafío Social': 'Social Challenge',
            'Desafía a un amigo por redes sociales. Mínimo 1 crédito.': 'Challenge a friend over social media. Minimum 1 credit.',
            'Redes': 'Social',
            'DESAFIAR': 'CHALLENGE',
            'Sala Privada': 'Private Room',
            'Invita a tus amigos. Personaliza reglas y apuestas.': 'Invite your friends. Customize rules and bets.',
            'Amigos': 'Friends',
            'Código': 'Code',
            'CREAR SALA': 'CREATE ROOM',
            'Modo Rápido': 'Quick Mode',
            'Matchmaking automático. Encuentra rival en segundos.': 'Automatic matchmaking. Find an opponent in seconds.',
            'JUGAR AHORA': 'PLAY NOW',
            'Jugar ahora': 'Play now',
            'Entrar a la batalla': 'Join the battle',

            // --- Torneos ---
            '14 géneros · Express cada 10 min · apuestas en créditos': '14 genres · Express every 10 min · bets in credits',

            // --- Cartera ---
            'SALDO DISPONIBLE': 'AVAILABLE BALANCE',
            '· 1 crédito ≈ $1': '· 1 credit ≈ $1',
            'DEPOSITAR': 'DEPOSIT',
            'RETIRAR': 'WITHDRAW',
            'Añadir saldo (USD)': 'Add balance (USD)',
            'Compra con tarjeta o paga en cripto. Se acredita al confirmarse el pago.':
                'Buy with a card or pay in crypto. Credited once the payment is confirmed.',
            'Comprar con Tarjeta': 'Buy with Card',
            'No necesitás wallet.': 'No wallet needed.',
            'Pagar en pesos (COP)': 'Pay in Colombian pesos (COP)',
            'Pagar con Cripto': 'Pay with Crypto',
            '(avanzado)': '(advanced)',
            'Requiere USDT/BTC/ETH en tu wallet.': 'Requires USDT/BTC/ETH in your wallet.',
            'Fees: Depósito 5% · Apuesta 2% · Retiro 5%': 'Fees: Deposit 5% · Bet 2% · Withdrawal 5%',

            // --- Perfil ---
            'Jugador': 'Player',
            'Wallet no conectada': 'Wallet not connected',
            'Con tu cuenta vas a tener': 'With your account you get',
            'Tus victorias, derrotas e historial de batallas': 'Your wins, losses and battle history',
            'Saldo en créditos para apostar, recargable en pesos': 'A credit balance to bet with, refillable anytime',
            'Aviso cuando alguien acepte tu desafío': 'A heads-up when someone accepts your challenge',
            'Victorias': 'Wins',
            'Derrotas': 'Losses',
            'Saldo total': 'Total balance',
            'Historial de batallas': 'Battle history',
            'Retirar a cripto (USDC / USDT)': 'Withdraw to crypto (USDC / USDT)',
            'Mis retiros en pesos (COP)': 'My peso withdrawals (COP)',
            'Notificaciones': 'Notifications',
            'Activadas': 'On',
            'Desactivadas': 'Off',
            'Cerrar sesión': 'Log out',
            'Idioma': 'Language',
            'Invitado': 'Guest',
            'No disponible': 'Not available',
            'Instalá la app': 'Install the app',
            'Wallet conectada': 'Wallet connected',
            'Conectar wallet': 'Connect wallet',

            // --- Selector de modos (layout clásico) y Wall Street of Beats ---
            'Elige tu Modo de Juego': 'Choose your Game Mode',
            'Selecciona cómo quieres competir': 'Choose how you want to compete',
            'Desafía a un amigo por redes sociales. Mínimo 1 crédito (~$1).': 'Challenge a friend over social media. Minimum 1 credit (~$1).',
            'Express cada 10 min por género. Grand Prix semanal con premio gordo.': 'Express every 10 min per genre. Weekly Grand Prix with a big prize.',
            'Torneo': 'Tournament',
            'Premios': 'Prizes',
            'UNIRSE AL TORNEO': 'JOIN THE TOURNAMENT',
            'Crear cuenta': 'Sign up',
            'Creá tu cuenta para jugar': 'Create your account to play',
            'Entrá gratis con Google o email: recargá en pesos, jugá con créditos y retirá.': 'Sign in free with Google or email: top up, play with credits and cash out.',
            'Top streams por región (últimos 5 min)': 'Top streams by region (last 5 min)',
            'Filtrar géneros': 'Filter genres',
            '← Todos los géneros': '← All genres',

            // --- Retiros ---
            'Reclamar Premios': 'Claim Prizes',
            'Elegí cómo retirar tus créditos: en': 'Choose how to withdraw your credits: in',
            'cripto': 'crypto',
            '(USDC o USDT, desde cualquier país) o en': '(USDC or USDT, from any country) or in',
            'pesos colombianos': 'Colombian pesos',
            'por Mercado Pago.': 'via Mercado Pago.',
            'Debes iniciar sesión para reclamar créditos.': 'You need to log in to claim credits.',
            'Créditos disponibles:': 'Available credits:',
            'Retirar en cripto · USDC o USDT': 'Withdraw in crypto · USDC or USDT',
            'Red': 'Network',
            'USDC en Base (recomendado, comisión de red mínima)': 'USDC on Base (recommended, minimal network fee)',
            'USDT en TRON (TRC-20)': 'USDT on TRON (TRC-20)',
            'Dirección de destino': 'Destination address',
            'Créditos a retirar': 'Credits to withdraw',
            'Retirar': 'Withdraw',
            'No hace falta conectar ninguna wallet: pegá la dirección de tu wallet o de tu cuenta en un exchange (Binance, etc.)':
                'No need to connect a wallet: paste the address of your wallet or your exchange account (Binance, etc.)',
            'en la misma red que elegiste': 'on the same network you selected',
            '. La primera vez a una dirección nueva la confirma nuestro equipo antes de enviar.': '. The first payout to a new address is confirmed by our team before sending.',
            'Retirar en pesos (COP) · Mercado Pago': 'Withdraw in Colombian pesos (COP) · Mercado Pago',
            'Retirar en pesos': 'Withdraw in pesos',
            '🇨🇴 Retirar en pesos (COP) · Mercado Pago': '🇨🇴 Withdraw in Colombian pesos (COP) · Mercado Pago',
            '🌎 Todos los géneros': '🌎 All genres',
            'Balance disponible:': 'Available balance:',
            'Créditos estables:': 'Stable credits:',
            '1 crédito ≈ 1 USD nominal': '1 credit ≈ 1 USD nominal',
            'Sin volatilidad del MTR on-chain:': 'No on-chain MTR volatility:',
            'el valor jugable es estable': 'the playable value is stable',
            'Fee de Retiro:': 'Withdrawal fee:',
            '5% (va al vault de liquidez)': '5% (goes to the liquidity vault)',
            'Vault de Liquidez:': 'Liquidity Vault:',
            'Ver en BaseScan': 'View on BaseScan',

            // --- Bonos / avisos ---
            'Crear con créditos de prueba (no retirable, tu invitado también juega gratis)':
                'Create with trial credits (not withdrawable, your guest also plays free)',
            'Fuiste invitado GRATIS a probar MusicToken Ring': 'You were invited to try MusicToken Ring for FREE',
            'Avisos en tu iPhone': 'Alerts on your iPhone',
            'No te pierdas la batalla': "Don't miss the battle",
            'Activar': 'Turn on',
            'Activando...': 'Turning on...',
            'Notificaciones activadas. Te vamos a avisar.': "Notifications on. We'll let you know.",

            // --- Selección de canción / batalla / resultado ---
            'Buscar canción': 'Search song',
            'Buscar': 'Search',
            'Volver': 'Back',
            'Cancelar': 'Cancel',
            'Confirmar': 'Confirm',
            'Cerrar': 'Close',
            'Continuar': 'Continue',
            'Compartir': 'Share',
            'Copiar': 'Copy',
            'Copiado': 'Copied',
            '¡Copiado!': 'Copied!',
            'Copiar link': 'Copy link',
            'Jugar de nuevo': 'Play again',
            'Volver al inicio': 'Back to home',
            '¡Ganaste!': 'You won!',
            'Perdiste': 'You lost',
            'Empate': 'Draw',
            'VICTORIA': 'VICTORY',
            'DERROTA': 'DEFEAT',
            'Cargando...': 'Loading...',
            'Cargando…': 'Loading…',
            'Esperando rival...': 'Waiting for opponent...',
            'Buscando rival...': 'Looking for an opponent...',
            'Elige tu canción': 'Pick your song',
            'Elegí tu canción': 'Pick your song',
            'Apuesta': 'Bet',
            'Tu apuesta': 'Your bet',
            'Pozo': 'Pot',
            'Rival': 'Opponent',
            'Tú': 'You',
            'Vos': 'You',
            'EN CURSO': 'LIVE',
            'Batalla en curso': 'Battle in progress',
            'Preparando batalla…': 'Getting the battle ready…',
            'Iniciar sesión': 'Log in',
            'Revisando tu canción con IA': 'Checking your song with AI',
            'Suele tardar unos segundos…': 'This usually takes a few seconds…',
            'BATALLA SORPRESA': 'SURPRISE BATTLE',
            'Tu fanatismo le ganó a la fama: tu canción era la menos popular de las dos y ganaste por destreza.':
                'Your fandom beat fame: your song was the less popular of the two and you won on skill.',
            'Volver a intentarlo': 'Try again',
            'Perdiste esta vez': 'You lost this time',
            '¡VICTORIA!': 'VICTORY!',
            'Derrota': 'Defeat',
            'Jugar de Nuevo': 'Play Again',
            'Continuar en práctica': 'Keep practicing',
            'Mejor suerte la próxima vez': 'Better luck next time',
            'Batalla de práctica · sin apuesta -- tus créditos no cambiaron': 'Practice battle · no bet -- your credits did not change',
            'Batalla amistosa · sin apuesta -- tus créditos no cambiaron': 'Friendly battle · no bet -- your credits did not change',
            'Saldo insuficiente': 'Insufficient balance'
        }
    };

    // Textos con partes variables: [regex sobre el texto normalizado, reemplazo].
    var PATTERNS = {
        en: [
            [/^• ([\d.,]+)% del top$/, '• $1% of top'],
            [/^([\d.,]+) créditos$/, '$1 credits'],
            [/^= \$([\d.,]+) USD nominal$/, '= $$$1 USD nominal']
        ]
    };

    function detectLang() {
        try {
            var q = new URLSearchParams(location.search).get('lang');
            if (q && SUPPORTED.indexOf(q) !== -1) {
                try { localStorage.setItem(STORAGE_KEY, q); } catch (e) {}
                return q;
            }
        } catch (e) {}
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
        } catch (e) {}
        // Sin preferencia guardada: español para quien tiene el navegador en
        // español (el público actual), inglés para el resto del mundo.
        var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'es';
        return /^es\b/i.test(nav) ? 'es' : 'en';
    }

    var lang = detectLang();
    var table = null;

    function norm(s) { return s.replace(/\s+/g, ' ').trim(); }

    function buildTable() {
        table = null;
        if (lang === 'es' || !DICT[lang]) return;
        table = Object.create(null);
        var d = DICT[lang];
        Object.keys(d).forEach(function (k) { table[norm(k)] = d[k]; });
    }

    function matchPattern(key) {
        var list = PATTERNS[lang];
        if (!list) return undefined;
        for (var i = 0; i < list.length; i++) {
            if (list[i][0].test(key)) return key.replace(list[i][0], list[i][1]);
        }
        return undefined;
    }

    function t(s) {
        if (!table || typeof s !== 'string') return s;
        var key = norm(s);
        var hit = table[key];
        if (hit === undefined) hit = matchPattern(key);
        return hit === undefined ? s : hit;
    }

    var SINGLE_WORD_ALWAYS = { 'créditos': 1, 'crédito': 1 };
    var CHROME_TAGS = { BUTTON: 1, NAV: 1, LABEL: 1, H1: 1, H2: 1, H3: 1, A: 1 };

    function inChrome(el) {
        for (var n = el, depth = 0; n && n.nodeType === 1 && depth < 6; n = n.parentNode, depth++) {
            if (CHROME_TAGS[n.tagName] || n.hasAttribute('data-i18n')) return true;
        }
        return false;
    }

    var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, OPTION: 0, CODE: 1, PRE: 1 };
    var ATTRS = ['placeholder', 'title', 'aria-label'];

    function skipped(el) {
        for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
            if (SKIP_TAGS[n.tagName]) return true;
            if (n.hasAttribute('data-no-i18n') || n.isContentEditable) return true;
        }
        return false;
    }

    function translateTextNode(node) {
        var v = node.nodeValue;
        if (!v || v.length > 400) return;
        var key = norm(v);
        if (!key) return;
        var hit = table[key];
        if (hit === undefined) hit = matchPattern(key);
        if (hit === undefined) return;
        if (node.parentNode && skipped(node.parentNode)) return;
        if (key.indexOf(' ') === -1 && !SINGLE_WORD_ALWAYS[key] && !inChrome(node.parentNode)) return;
        // Conserva los espacios de los bordes: suelen separar el texto de un
        // icono o de un número vecino ("0 créditos").
        var lead = v.match(/^\s*/)[0];
        var trail = v.match(/\s*$/)[0];
        var next = lead + hit + trail;
        // Solo escribir si cambia: reescribir el mismo texto genera otra mutación
        // y el observer entraría en bucle (p. ej. "USD nominal" -> "USD nominal").
        if (next !== v) node.nodeValue = next;
    }

    function translateAttrs(el) {
        for (var i = 0; i < ATTRS.length; i++) {
            var a = el.getAttribute(ATTRS[i]);
            if (!a) continue;
            var hit = table[norm(a)];
            if (hit !== undefined && hit !== a) el.setAttribute(ATTRS[i], hit);
        }
    }

    function translateTree(root) {
        if (!table || !root) return;
        if (root.nodeType === 3) { translateTextNode(root); return; }
        if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
        if (root.nodeType === 1) {
            if (skipped(root)) return;
            translateAttrs(root);
        }
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                if (n.nodeType === 1 && (SKIP_TAGS[n.tagName] || n.hasAttribute('data-no-i18n'))) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        var n;
        while ((n = walker.nextNode())) {
            if (n.nodeType === 3) translateTextNode(n);
            else translateAttrs(n);
        }
    }

    var observer = null;
    function startObserver() {
        if (observer || !table || !document.body) return;
        observer = new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                var r = records[i];
                if (r.type === 'characterData') translateTextNode(r.target);
                else if (r.type === 'attributes') { if (r.target.nodeType === 1 && !skipped(r.target)) translateAttrs(r.target); }
                else for (var j = 0; j < r.addedNodes.length; j++) translateTree(r.addedNodes[j]);
            }
        });
        // Traducir dentro del callback dispara nuevas mutaciones, pero el texto
        // traducido ya no coincide con ninguna clave, así que no hay bucle.
        observer.observe(document.body, {
            childList: true, subtree: true, characterData: true,
            attributes: true, attributeFilter: ATTRS
        });
    }

    function apply() {
        document.documentElement.setAttribute('lang', lang);
        if (!table) return;
        translateTree(document.body);
        startObserver();
    }

    function setLang(next) {
        if (SUPPORTED.indexOf(next) === -1 || next === lang) return;
        try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
        // Volver al español requiere el texto original, que ya se reemplazó:
        // recargar es lo más simple y seguro (la sesión de Supabase persiste).
        // Sin quitar ?lang= de la URL, ese parámetro volvería a mandar.
        try {
            var url = new URL(location.href);
            if (url.searchParams.has('lang')) {
                url.searchParams.delete('lang');
                location.replace(url.toString());
                return;
            }
        } catch (e) {}
        location.reload();
    }

    buildTable();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', apply);
    } else {
        apply();
    }

    global.MTRI18n = {
        get lang() { return lang; },
        supported: SUPPORTED.slice(),
        setLang: setLang,
        t: t,
        translate: translateTree
    };
})(typeof window !== 'undefined' ? window : this);
