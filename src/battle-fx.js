/* MTRBattleFX -- onomatopeyas estilo cómic (Batman 66: ¡POW! ¡ZAS! ¡BAM!)
 * que estallan sobre la arena durante una batalla.
 *
 * Cada estallido: estrella dentada con trama de puntos (halftone), líneas de
 * velocidad girando detrás, texto grueso con contorno negro y sombra 3D,
 * entrada con rebote + temblor corto de la arena. Todo con Web Animations y
 * SVG inline: sin imágenes ni librerías.
 *
 * Es solo decoración: nunca lee ni cambia el estado de la batalla. Quien
 * llama decide CUÁNDO (cambio de líder, combo, final, ganador).
 *
 * API:
 *   MTRBattleFX.burst(text, { side: 'left'|'right'|'center', palette: 'cyan'|'magenta'|'gold'|'red', size: 1 })
 *   MTRBattleFX.random(side)        -> onomatopeya al azar del set de golpes
 *   MTRBattleFX.clear()
 */
(function (global) {
    'use strict';

    var HITS = ['¡POW!', '¡ZAS!', '¡BAM!', '¡KAPOW!', '¡WHAM!', '¡CRASH!', '¡BOOM!', '¡ZOK!'];
    var PALETTES = {
        cyan:    { burst: '#22d3ee', burst2: '#0891b2', text: '#fef08a', dots: 'rgba(8,47,73,0.35)' },
        magenta: { burst: '#f472b6', burst2: '#c026d3', text: '#fef08a', dots: 'rgba(80,7,36,0.35)' },
        gold:    { burst: '#facc15', burst2: '#f97316', text: '#ffffff', dots: 'rgba(124,45,18,0.35)' },
        red:     { burst: '#ef4444', burst2: '#991b1b', text: '#fde047', dots: 'rgba(69,10,10,0.4)' }
    };
    var reduceMotion = false;
    try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

    var live = [];
    var lastAt = 0;
    var uid = 0;

    function injectFont() {
        if (document.getElementById('mtrFxFont')) return;
        var l = document.createElement('link');
        l.id = 'mtrFxFont';
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Bangers&display=swap';
        document.head.appendChild(l);
    }

    // Estrella dentada irregular (como las viñetas de los cómics), en un
    // viewBox de 200x200 centrado.
    function starPoints(spikes, seed) {
        var pts = [];
        var rnd = function (i) { var x = Math.sin(seed * 9301 + i * 49297) * 233280; return x - Math.floor(x); };
        for (var i = 0; i < spikes * 2; i++) {
            var outer = i % 2 === 0;
            var r = outer ? 92 - rnd(i) * 14 : 52 + rnd(i) * 12;
            var a = (Math.PI * i) / spikes - Math.PI / 2 + (rnd(i + 99) - 0.5) * 0.12;
            pts.push((100 + Math.cos(a) * r).toFixed(1) + ',' + (100 + Math.sin(a) * r).toFixed(1));
        }
        return pts.join(' ');
    }

    // El "escenario" de la batalla (panel oscuro con las dos canciones). Va
    // ahí y no sobre toda la arena: así un estallido nunca tapa la pista del
    // mini-juego (la estrella que hay que tocar), que está debajo.
    function host() {
        return document.getElementById('battleCanvasWrap') || null;
    }

    function burst(text, opts) {
        opts = opts || {};
        var arena = host();
        if (!arena || !arena.isConnected) return;
        // No más de un estallido cada 450 ms: varios juntos se ven a ruido.
        var now = Date.now();
        if (now - lastAt < 450) return;
        lastAt = now;
        injectFont();

        var cs = getComputedStyle(arena);
        if (cs.position === 'static') arena.style.position = 'relative';
        // Recortado al panel, como una viñeta: que nunca se salga encima del
        // header ni de la pista del mini-juego que está debajo.
        if (cs.overflow !== 'hidden') arena.style.overflow = 'hidden';

        var pal = PALETTES[opts.palette] || PALETTES.gold;
        var side = opts.side || 'center';
        var scale = opts.size || 1;
        var id = 'mtrfx' + (++uid);
        var rect = arena.getBoundingClientRect();
        // Tamaño relativo a la arena: legible en celular sin tapar todo en escritorio.
        var w = Math.max(130, Math.min(300, rect.width * 0.34, rect.height * 0.78)) * scale;
        var xPct = side === 'left' ? 24 : side === 'right' ? 76 : 50;
        var yPct = side === 'center' ? 46 : 38 + Math.random() * 16;
        xPct += (Math.random() - 0.5) * 8;
        // Que entre completo a lo ancho (en celular el panel es angosto).
        var minPct = (w / 2 + 6) / rect.width * 100;
        xPct = Math.max(minPct, Math.min(100 - minPct, xPct));
        var tilt = (side === 'right' ? 1 : -1) * (6 + Math.random() * 8);

        var el = document.createElement('div');
        el.className = 'mtr-fx-burst';
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = 'position:absolute;left:' + xPct + '%;top:' + yPct + '%;width:' + w + 'px;height:' + w + 'px;' +
            'margin-left:' + (-w / 2) + 'px;margin-top:' + (-w / 2) + 'px;pointer-events:none;z-index:60;will-change:transform,opacity;';
        var fontSize = Math.round(w * (text.length > 7 ? 0.17 : text.length > 5 ? 0.22 : 0.27));
        el.innerHTML =
            '<svg viewBox="0 0 200 200" width="100%" height="100%" style="position:absolute;inset:0;overflow:visible;">' +
                '<defs>' +
                    '<pattern id="' + id + 'd" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">' +
                        '<circle cx="3.5" cy="3.5" r="1.6" fill="' + pal.dots + '"/></pattern>' +
                    '<radialGradient id="' + id + 'g" cx="50%" cy="45%" r="60%">' +
                        '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>' +
                        '<stop offset="35%" stop-color="' + pal.burst + '"/>' +
                        '<stop offset="100%" stop-color="' + pal.burst2 + '"/></radialGradient>' +
                '</defs>' +
                // líneas de velocidad
                '<g class="mtr-fx-rays" style="transform-origin:100px 100px;">' + rays(pal.burst) + '</g>' +
                // sombra desplazada (look impreso)
                '<polygon points="' + starPoints(12, uid) + '" transform="translate(7 8)" fill="#05060a" opacity="0.85"/>' +
                '<polygon points="' + starPoints(12, uid) + '" fill="url(#' + id + 'g)" stroke="#05060a" stroke-width="6" stroke-linejoin="round"/>' +
                '<polygon points="' + starPoints(12, uid) + '" fill="url(#' + id + 'd)"/>' +
            '</svg>' +
            '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(' + tilt + 'deg);">' +
                '<span style="font-family:Bangers,\'Arial Black\',Impact,sans-serif;font-size:' + fontSize + 'px;line-height:1;letter-spacing:1px;white-space:nowrap;' +
                'color:' + pal.text + ';-webkit-text-stroke:' + Math.max(3, Math.round(fontSize / 9)) + 'px #05060a;paint-order:stroke fill;' +
                'text-shadow:' + Math.round(fontSize / 12) + 'px ' + Math.round(fontSize / 10) + 'px 0 #05060a;">' + escapeHtml(text) + '</span>' +
            '</div>';
        arena.appendChild(el);
        live.push(el);

        var hold = opts.hold || 750;
        if (reduceMotion) {
            el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }],
                { duration: hold + 500, easing: 'linear' }).onfinish = function () { remove(el); };
            return;
        }
        el.animate([
            { transform: 'scale(0.1) rotate(' + (tilt * 3) + 'deg)', opacity: 0 },
            { transform: 'scale(1.28) rotate(' + (-tilt * 0.4) + 'deg)', opacity: 1, offset: 0.14 },
            { transform: 'scale(0.94) rotate(' + (tilt * 0.2) + 'deg)', opacity: 1, offset: 0.24 },
            { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 0.32 },
            { transform: 'scale(1.03) rotate(0deg)', opacity: 1, offset: 0.8 },
            { transform: 'scale(1.35) rotate(0deg)', opacity: 0 }
        ], { duration: hold + 600, easing: 'cubic-bezier(.2,.9,.3,1)' }).onfinish = function () { remove(el); };
        var raysEl = el.querySelector('.mtr-fx-rays');
        if (raysEl) raysEl.animate([{ transform: 'rotate(0deg) scale(0.8)' }, { transform: 'rotate(40deg) scale(1.15)' }],
            { duration: hold + 600, easing: 'ease-out' });
        shake(arena, opts.strong ? 9 : 5);
    }

    function rays(color) {
        var out = '';
        for (var i = 0; i < 18; i++) {
            var a = (i / 18) * Math.PI * 2;
            var x1 = 100 + Math.cos(a) * 70, y1 = 100 + Math.sin(a) * 70;
            var x2 = 100 + Math.cos(a) * 135, y2 = 100 + Math.sin(a) * 135;
            out += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
                '" stroke="' + color + '" stroke-width="' + (i % 2 ? 2 : 4) + '" stroke-linecap="round" opacity="0.55"/>';
        }
        return out;
    }

    function shake(el, px) {
        if (reduceMotion || !el.animate) return;
        el.animate([
            { transform: 'translate(0,0)' },
            { transform: 'translate(' + (-px) + 'px,' + (px * 0.4) + 'px)' },
            { transform: 'translate(' + px + 'px,' + (-px * 0.3) + 'px)' },
            { transform: 'translate(' + (-px * 0.5) + 'px,' + (px * 0.2) + 'px)' },
            { transform: 'translate(0,0)' }
        ], { duration: 280, easing: 'ease-out' });
    }

    function remove(el) {
        var i = live.indexOf(el);
        if (i !== -1) live.splice(i, 1);
        if (el.parentNode) el.parentNode.removeChild(el);
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; });
    }

    function random(side, opts) {
        opts = opts || {};
        var word = HITS[Math.floor(Math.random() * HITS.length)];
        burst(word, { side: side, palette: opts.palette || (side === 'left' ? 'cyan' : side === 'right' ? 'magenta' : 'gold'), size: opts.size });
    }

    function clear() { live.slice().forEach(remove); }

    global.MTRBattleFX = { burst: burst, random: random, clear: clear };
})(typeof window !== 'undefined' ? window : this);
