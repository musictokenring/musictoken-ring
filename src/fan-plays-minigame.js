/**
 * Reproducciones de Fan -- mini-juego de precisión rítmica (UI cliente)
 * ============================================================
 * El horario de rondas y la posición de cada zona salen de una SEMILLA
 * determinística (la misma que el servidor usa para recalcular el
 * puntaje real a partir de los toques crudos -- ver
 * src/fan-plays-scoring.js y backend/server-auto.js, endpoints
 * /api/battles/:id/fanplay-seed y .../submit-fanplay-score). Este
 * archivo depende de que fan-plays-scoring.js ya esté cargado
 * (window.FanPlaysScoring).
 *
 * Refinado tres veces a pedido del usuario: primero estrellas + destello
 * + doble puntaje "perfecto" + sonido láser; después aspecto 3D
 * (degradés, brillo, giro suave) + destello con chispas + un estallido
 * estilo cómic ("¡PERFECTO!") cuando las dos estrellas coinciden; y por
 * último ondas de fondo tipo ecualizador (moviéndose todo el tiempo,
 * de fondo en toda la pista) + una moneda MTR que salta al estilo
 * "bloque de Mario Bros" cada vez que hay match perfecto.
 *
 * El puntaje que se calcula ACÁ es solo para el feedback visual
 * inmediato del jugador -- el que realmente vale (el que decide la
 * batalla y el pago en dinero real) es el que recalcula el servidor de
 * forma independiente a partir de los toques crudos que se mandan en
 * onFinish.
 */

(function () {
    'use strict';

    // Estrella de 5 puntas, viewBox 0 0 24 24.
    var STAR_PATH = 'M12 2.5 L14.9 9.1 L22 9.8 L16.7 14.6 L18.2 21.5 L12 17.8 L5.8 21.5 L7.3 14.6 L2 9.8 L9.1 9.1 Z';

    // Degradés compartidos (se inyectan una sola vez por instancia de
    // juego) -- le dan el aspecto 3D: la estrella que se desliza es
    // "sólida" con un brillo tipo vidrio/metal; la fija es más fantasma,
    // como el hueco que hay que llenar.
    function starDefsSvg() {
        return '<svg width="0" height="0" style="position:absolute">' +
            '<defs>' +
                '<radialGradient id="fpStarMoving" cx="35%" cy="28%" r="80%">' +
                    '<stop offset="0%" stop-color="#ffffff"/>' +
                    '<stop offset="30%" stop-color="#bff4ff"/>' +
                    '<stop offset="70%" stop-color="#22d3ee"/>' +
                    '<stop offset="100%" stop-color="#0e7490"/>' +
                '</radialGradient>' +
                '<radialGradient id="fpStarTarget" cx="35%" cy="28%" r="80%">' +
                    '<stop offset="0%" stop-color="rgba(255,255,255,0.5)"/>' +
                    '<stop offset="60%" stop-color="rgba(255,255,255,0.14)"/>' +
                    '<stop offset="100%" stop-color="rgba(255,255,255,0.03)"/>' +
                '</radialGradient>' +
                '<radialGradient id="fpBurstGrad" cx="50%" cy="45%" r="60%">' +
                    '<stop offset="0%" stop-color="#fff7cc"/>' +
                    '<stop offset="55%" stop-color="#facc15"/>' +
                    '<stop offset="100%" stop-color="#f97316"/>' +
                '</radialGradient>' +
            '</defs>' +
        '</svg>';
    }

    function movingStarSvg() {
        // Relleno con degradé (volumen) + trazo oscuro (borde definido) +
        // una elipse de brillo (glare) arriba a la izquierda -- el truco
        // clásico para que un ícono plano lea como "objeto con volumen".
        // Agrandada (26px -> 36px) a pedido explícito -- tiene que quedar
        // en un tamaño cómodo para tocar, sobre todo en el dedo de un
        // celular, no solo "visible".
        return '<svg width="36" height="36" viewBox="0 0 24 24">' +
            '<path d="' + STAR_PATH + '" fill="url(#fpStarMoving)" stroke="#0891b2" stroke-width="0.8" stroke-linejoin="round"/>' +
            '<ellipse cx="9.3" cy="7.2" rx="2.1" ry="1.1" fill="rgba(255,255,255,0.85)" transform="rotate(-25 9.3 7.2)"/>' +
        '</svg>';
    }

    function targetStarSvg() {
        return '<svg width="33" height="33" viewBox="0 0 24 24">' +
            '<path d="' + STAR_PATH + '" fill="url(#fpStarTarget)" stroke="rgba(255,255,255,0.5)" stroke-width="1.2" stroke-linejoin="round"/>' +
        '</svg>';
    }

    // Sonido de "disparo láser" sintetizado -- barrido de frecuencia
    // descendente, sin ningún archivo externo. Volumen bajo a propósito
    // ("sonido sutil", pedido explícito).
    var _audioCtx = null;
    function playTapSound(perfect, missed) {
        try {
            if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (_audioCtx.state === 'suspended') _audioCtx.resume();
            var now = _audioCtx.currentTime;
            var osc = _audioCtx.createOscillator();
            var gain = _audioCtx.createGain();
            if (missed) {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(180, now);
                osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
                gain.gain.setValueAtTime(0.08, now);
            } else {
                osc.type = perfect ? 'square' : 'sawtooth';
                osc.frequency.setValueAtTime(perfect ? 1500 : 950, now);
                osc.frequency.exponentialRampToValueAtTime(perfect ? 350 : 180, now + (perfect ? 0.18 : 0.13));
                gain.gain.setValueAtTime(perfect ? 0.16 : 0.11, now);
            }
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.connect(gain);
            gain.connect(_audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.22);
        } catch (e) { /* audio nunca debe romper el juego */ }
    }

    // Capa de audio extra pedida explícitamente: una ovación de tribuna
    // (aplausos) que suena JUNTO con el láser cuando el toque es
    // perfecto -- no reemplaza el sonido del toque, se suma. Sintetizada
    // con ruido blanco filtrado (el "rugido" de fondo) más varios
    // golpecitos cortos superpuestos (los "aplausos" individuales), sin
    // ningún archivo de audio externo.
    function scheduleCrowdCheerNodes() {
        var now = _audioCtx.currentTime;

        // "Rugido" de fondo: ruido blanco con un simple pasa-altos (corta
        // solo el retumbe grave, deja pasar casi toda la energía del
        // ruido -- un pasa-banda angosto lo dejaba casi inaudible) y una
        // envolvente que sube de golpe y baja gradual.
        var duration = 1.1;
        var bufferSize = Math.floor(_audioCtx.sampleRate * duration);
        var buffer = _audioCtx.createBuffer(1, bufferSize, _audioCtx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        var noise = _audioCtx.createBufferSource();
        noise.buffer = buffer;
        var highpass = _audioCtx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.setValueAtTime(500, now);
        var roarGain = _audioCtx.createGain();
        roarGain.gain.setValueAtTime(0.0001, now);
        roarGain.gain.exponentialRampToValueAtTime(0.55, now + 0.08);
        roarGain.gain.exponentialRampToValueAtTime(0.3, now + 0.4);
        roarGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        noise.connect(highpass);
        highpass.connect(roarGain);
        roarGain.connect(_audioCtx.destination);
        noise.start(now);
        noise.stop(now + duration);

        // Golpecitos individuales (los "aplausos") -- ruido corto y
        // agudo, esparcidos en los primeros ~0.6s para simular una
        // ráfaga de manos aplaudiendo, no un solo "pum" seco.
        var clapCount = 9;
        for (var c = 0; c < clapCount; c++) {
            var at = now + Math.random() * 0.6;
            var clapSize = Math.floor(_audioCtx.sampleRate * 0.045);
            var clapBuffer = _audioCtx.createBuffer(1, clapSize, _audioCtx.sampleRate);
            var clapData = clapBuffer.getChannelData(0);
            for (var j = 0; j < clapSize; j++) clapData[j] = (Math.random() * 2 - 1) * (1 - j / clapSize);
            var clap = _audioCtx.createBufferSource();
            clap.buffer = clapBuffer;
            var clapFilter = _audioCtx.createBiquadFilter();
            clapFilter.type = 'highpass';
            clapFilter.frequency.value = 1000;
            var clapGain = _audioCtx.createGain();
            clapGain.gain.setValueAtTime(0.4, at);
            clapGain.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
            clap.connect(clapFilter);
            clapFilter.connect(clapGain);
            clapGain.connect(_audioCtx.destination);
            clap.start(at);
            clap.stop(at + 0.08);
        }
    }

    function playCrowdCheer() {
        try {
            if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            // CRÍTICO: resume() es asíncrono -- si se seguía de largo sin
            // esperarlo, los nodos podían programarse mientras el contexto
            // todavía estaba "suspended" y el navegador los descartaba en
            // silencio (sin ningún error visible, por eso "no se
            // escuchaba" nada aunque el código corriera entero). Ahora se
            // arman los nodos recién cuando el contexto confirma que ya
            // está "running".
            if (_audioCtx.state === 'suspended') {
                _audioCtx.resume().then(scheduleCrowdCheerNodes).catch(function () { /* ignore */ });
            } else {
                scheduleCrowdCheerNodes();
            }
        } catch (e) { /* audio nunca debe romper el juego */ }
    }

    // Destello "rico" en el punto de impacto: núcleo brillante + anillo
    // expandiéndose + un puñado de chispas volando hacia afuera. Todo con
    // la Web Animations API (sin CSS global nuevo).
    function spawnFlash(trackEl, leftPct, perfect) {
        var color1 = perfect ? 'rgba(250,204,21,1)' : 'rgba(34,211,238,0.95)';
        var color2 = perfect ? 'rgba(249,115,22,0.55)' : 'rgba(217,70,239,0.45)';

        var core = document.createElement('div');
        var coreSize = perfect ? 70 : 42;
        core.style.cssText = 'position:absolute;top:50%;left:' + leftPct + '%;width:' + coreSize + 'px;height:' + coreSize + 'px;margin-left:-' + (coreSize / 2) + 'px;margin-top:-' + (coreSize / 2) + 'px;border-radius:50%;pointer-events:none;z-index:6;background:radial-gradient(circle,' + color1 + ' 0%,' + color2 + ' 45%,rgba(0,0,0,0) 75%);';
        trackEl.appendChild(core);
        core.animate([
            { transform: 'scale(0.2)', opacity: 1 },
            { transform: 'scale(' + (perfect ? 2.6 : 1.7) + ')', opacity: 0 }
        ], { duration: perfect ? 520 : 300, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = function () { core.remove(); };

        var ringSize = coreSize * 1.35;
        var ring = document.createElement('div');
        ring.style.cssText = 'position:absolute;top:50%;left:' + leftPct + '%;width:' + ringSize + 'px;height:' + ringSize + 'px;margin-left:-' + (ringSize / 2) + 'px;margin-top:-' + (ringSize / 2) + 'px;border-radius:50%;pointer-events:none;z-index:6;border:2px solid ' + color1 + ';';
        trackEl.appendChild(ring);
        ring.animate([
            { transform: 'scale(0.4)', opacity: 0.9 },
            { transform: 'scale(' + (perfect ? 2.1 : 1.5) + ')', opacity: 0 }
        ], { duration: perfect ? 480 : 280, easing: 'ease-out' }).onfinish = function () { ring.remove(); };

        var sparkCount = perfect ? 8 : 4;
        for (var i = 0; i < sparkCount; i++) {
            var angle = (Math.PI * 2 * i / sparkCount) + Math.random() * 0.5;
            var dist = perfect ? 34 + Math.random() * 18 : 18 + Math.random() * 10;
            var dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
            var s = perfect ? 5 : 3;
            var spark = document.createElement('div');
            spark.style.cssText = 'position:absolute;top:50%;left:' + leftPct + '%;width:' + s + 'px;height:' + s + 'px;margin-left:-' + (s / 2) + 'px;margin-top:-' + (s / 2) + 'px;border-radius:50%;pointer-events:none;z-index:6;background:' + color1 + ';box-shadow:0 0 4px ' + color1 + ';';
            trackEl.appendChild(spark);
            (function (spark, dx, dy) {
                spark.animate([
                    { transform: 'translate(0,0) scale(1)', opacity: 1 },
                    { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.3)', opacity: 0 }
                ], { duration: perfect ? 500 : 320, easing: 'ease-out' }).onfinish = function () { spark.remove(); };
            })(spark, dx, dy);
        }
    }

    // Estallido estilo cómic ("¡PERFECTO!") -- pedido explícito del
    // usuario -- una explosión de picos con degradé dorado, texto en
    // negrita con contorno blanco, y una animación de rebote (entra
    // chico girado, sobrepasa el tamaño final, se asienta, se desvanece).
    function spawnComicBurst(hostEl, leftPct) {
        var spikes = 12, outerR = 46, innerR = 23, pts = [];
        for (var i = 0; i < spikes * 2; i++) {
            var r = i % 2 === 0 ? outerR : innerR;
            var a = (Math.PI * i) / spikes - Math.PI / 2;
            pts.push((60 + r * Math.cos(a)).toFixed(1) + ',' + (60 + r * Math.sin(a)).toFixed(1));
        }
        var wrap = document.createElement('div');
        wrap.style.cssText = 'position:absolute;top:50%;left:' + leftPct + '%;width:120px;height:120px;margin-left:-60px;margin-top:-60px;pointer-events:none;z-index:10;';
        wrap.innerHTML =
            '<svg width="120" height="120" viewBox="0 0 120 120" style="position:absolute;inset:0;overflow:visible;">' +
                '<polygon points="' + pts.join(' ') + '" fill="url(#fpBurstGrad)" stroke="#7c2d12" stroke-width="2.5"/>' +
            '</svg>' +
            '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:Arial Black,Arial,sans-serif;font-weight:900;font-style:italic;font-size:13px;color:#7c2d12;text-shadow:1.5px 0 0 #fff,-1.5px 0 0 #fff,0 1.5px 0 #fff,0 -1.5px 0 #fff;letter-spacing:0.5px;white-space:nowrap;transform:rotate(-8deg);">¡PERFECTO!</div>';
        hostEl.appendChild(wrap);
        wrap.animate([
            { transform: 'translate(0,0) scale(0.2) rotate(-20deg)', opacity: 0 },
            { transform: 'translate(0,0) scale(1.3) rotate(6deg)', opacity: 1, offset: 0.4 },
            { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, offset: 0.65 },
            { transform: 'translate(0,0) scale(0.85) rotate(0deg)', opacity: 0 }
        ], { duration: 750, easing: 'cubic-bezier(.34,1.56,.64,1)' }).onfinish = function () { wrap.remove(); };
    }

    // Mismo logo que ya usa el header de la app (ver index.html) -- así
    // la moneda que salta es reconocible como "de verdad" MTR, no un
    // ícono genérico de moneda.
    var MTR_LOGO_URL = 'https://pink-blank-vicuna-260.mypinata.cloud/ipfs/bafybeiah2fffgw6y6aomfx5b5pgav7wedo3qdtqxqteg2glvmgzs6fpivu';

    // Moneda MTR que salta al estilo "bloque de Mario Bros" -- pedido
    // explícito del usuario -- en cada match perfecto. Segunda vuelta,
    // también pedida explícitamente: mucho más grande y centrada en TODA
    // la pantalla (position:fixed sobre document.body, no relativa a la
    // pista) para que el momento se sienta como un premio grande -- "eso
    // le da más adicción al juego". pointer-events:none todo el tiempo,
    // así nunca tapa ni bloquea el toque de la ronda siguiente aunque
    // aparezca sobre el resto de la pantalla.
    function spawnMtrCoin() {
        var size = 130;
        var wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;top:50%;left:50%;width:' + size + 'px;height:' + size + 'px;margin-left:-' + (size / 2) + 'px;margin-top:-' + (size / 2) + 'px;pointer-events:none;z-index:99999;';
        wrap.innerHTML =
            '<div style="position:absolute;inset:-40px;border-radius:50%;background:radial-gradient(circle,rgba(250,204,21,0.5) 0%,rgba(250,204,21,0) 70%);"></div>' +
            '<div style="position:absolute;inset:0;border-radius:50%;overflow:hidden;border:4px solid #fde047;box-shadow:0 0 40px rgba(250,204,21,0.9),0 10px 30px rgba(0,0,0,0.5);background:radial-gradient(circle,#fde047,#f59e0b);">' +
                '<img src="' + MTR_LOGO_URL + '" style="width:100%;height:100%;object-fit:cover;" alt="" onerror="this.remove()">' +
            '</div>';
        document.body.appendChild(wrap);
        // Pedido explícito: que quede visible más tiempo para captar la
        // atención del jugador -- en vez de solo estirar la misma curva de
        // antes (que se sentiría lenta/pastosa), son 3 fases: entrada
        // rápida (~15%), una espera larga con pulso y giro continuo
        // (~70%, para que no se sienta "congelada" mientras dura), y un
        // desvanecido rápido al final (~15%). Casi el doble de duración
        // que antes (950ms -> 1900ms).
        wrap.animate([
            { transform: 'perspective(700px) translateY(50px) scale(0.15) rotateY(0deg)', opacity: 0, offset: 0 },
            { transform: 'perspective(700px) translateY(-18px) scale(1.3) rotateY(300deg)', opacity: 1, offset: 0.15 },
            { transform: 'perspective(700px) translateY(-10px) scale(1.05) rotateY(480deg)', opacity: 1, offset: 0.3 },
            { transform: 'perspective(700px) translateY(-16px) scale(1.15) rotateY(660deg)', opacity: 1, offset: 0.48 },
            { transform: 'perspective(700px) translateY(-10px) scale(1.05) rotateY(840deg)', opacity: 1, offset: 0.65 },
            { transform: 'perspective(700px) translateY(-14px) scale(1.12) rotateY(1020deg)', opacity: 1, offset: 0.82 },
            { transform: 'perspective(700px) translateY(-8px) scale(1) rotateY(1160deg)', opacity: 1, offset: 0.9 },
            { transform: 'perspective(700px) translateY(-30px) scale(0.7) rotateY(1260deg)', opacity: 0, offset: 1 }
        ], { duration: 1900, easing: 'ease-in-out' }).onfinish = function () { wrap.remove(); };
    }

    // "Tablerito" de moneditas de la suerte -- pedido explícito: un
    // indicador chico de cuántas veces se consiguió el match perfecto,
    // una fila para el jugador y otra para el rival, para comparar de un
    // vistazo sin tener que leer números. Cada logro agrega una moneda
    // nueva con una lucecita (glow) -- no hay un máximo fijo, la fila
    // simplemente crece (son eventos raros, en la práctica no van a ser
    // muchas por batalla).
    function appendCoinDot(hostEl, countEl) {
        if (!hostEl) return;
        var dot = document.createElement('div');
        dot.style.cssText = 'width:11px;height:11px;border-radius:50%;background:radial-gradient(circle,#fff7cc 0%,#fde047 45%,#f59e0b 100%);box-shadow:0 0 5px rgba(250,204,21,0.9),0 0 2px rgba(255,255,255,0.9);flex-shrink:0;';
        hostEl.appendChild(dot);
        dot.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
        if (countEl) countEl.textContent = '(' + hostEl.children.length + ')';
    }

    // Ondas de fondo tipo ecualizador -- pedido explícito ("ondas
    // vibrantes moviéndose" de fondo en todo el espacio de la animación).
    // Dos capas, cada una con 2 ciclos de onda dibujados uno al lado del
    // otro dentro del mismo viewBox -- animar transform:translateX() de
    // 0% a -50% (con la Web Animations API, infinito) desplaza EXACTO un
    // ciclo completo, así el loop no se nota. Puramente decorativo, con
    // opacidad baja para no competir con las estrellas.
    function waveTilePath(amplitude, yBase, w) {
        var y = yBase, a = amplitude;
        return 'M0,' + y +
            ' C ' + (w * 0.125) + ',' + (y - a) + ' ' + (w * 0.375) + ',' + (y - a) + ' ' + (w * 0.5) + ',' + y +
            ' C ' + (w * 0.625) + ',' + (y + a) + ' ' + (w * 0.875) + ',' + (y + a) + ' ' + w + ',' + y +
            ' C ' + (w * 1.125) + ',' + (y - a) + ' ' + (w * 1.375) + ',' + (y - a) + ' ' + (w * 1.5) + ',' + y +
            ' C ' + (w * 1.625) + ',' + (y + a) + ' ' + (w * 1.875) + ',' + (y + a) + ' ' + (w * 2) + ',' + y;
    }

    function waveBackgroundSvg() {
        var tileW = 200, h = 76;
        var wave1 = '<svg id="fanPlaysWave1" width="100%" height="100%" viewBox="0 0 ' + (tileW * 2) + ' ' + h + '" preserveAspectRatio="none" style="position:absolute;inset:0;">' +
            '<path d="' + waveTilePath(9, h * 0.35, tileW) + '" stroke="rgba(34,211,238,0.4)" stroke-width="2" fill="none"/>' +
        '</svg>';
        var wave2 = '<svg id="fanPlaysWave2" width="100%" height="100%" viewBox="0 0 ' + (tileW * 2) + ' ' + h + '" preserveAspectRatio="none" style="position:absolute;inset:0;">' +
            '<path d="' + waveTilePath(13, h * 0.68, tileW) + '" stroke="rgba(217,70,239,0.32)" stroke-width="2" fill="none"/>' +
        '</svg>';
        return '<div style="position:absolute;inset:0;overflow:hidden;pointer-events:none;">' + wave1 + wave2 + '</div>';
    }

    const FanPlaysMinigame = {
        _raf: null,
        _active: false,
        _spinAnim: null,

        /**
         * @param {HTMLElement} containerEl
         * @param {number} durationSec
         * @param {function} onTick - (liveAvg0to100, roundsResolved) => void
         * @param {function} onFinish - (finalAvg0to100, roundsResolved, rawTaps, totalRounds) => void
         * @param {number} [seed] - semilla determinística; si no se pasa, se genera una local (solo válido para Modo Práctica, sin verificación server-side posible)
         */
        start(containerEl, durationSec, onTick, onFinish, seed) {
            if (!containerEl || !window.FanPlaysScoring) return;
            this.stop();

            const S = window.FanPlaysScoring;
            const usedSeed = (seed != null) ? seed : Math.floor(Math.random() * 2147483647);
            const durationMs = durationSec * 1000;
            const totalRounds = S.totalRoundsFor(durationMs);

            let battleStartAt = null;
            let rawTaps = [];
            let lastTapAt = -Infinity;
            let resolvedRounds = new Array(totalRounds).fill(null);
            let finished = false;

            containerEl.style.position = containerEl.style.position || 'relative';
            containerEl.innerHTML = starDefsSvg() +
                '<div class="text-center text-[11px] text-gray-400 mb-1">Tocá cuando la estrella que se desliza entre en la zona -- si coincide con la estrella fija, ¡doble puntaje!</div>' +
                // overflow:visible a propósito -- el destello y el estallido
                // cómic de un toque perfecto se salen del alto de la pista.
                // Pedido explícito: que el juego quede en un tamaño
                // cómodo para el jugador, no apretado -- pista de 52px a
                // 76px (junto con las estrellas más grandes de arriba).
                '<div id="fanPlaysTrack" style="position:relative;height:76px;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);overflow:visible;cursor:pointer;touch-action:manipulation;perspective:300px;">' +
                    waveBackgroundSvg() +
                    '<div style="position:absolute;inset:0;border-radius:10px;overflow:hidden;">' +
                        '<div id="fanPlaysZone" style="position:absolute;top:0;bottom:0;background:linear-gradient(90deg,rgba(0,243,255,0.18),rgba(217,70,239,0.18));border-left:2px solid rgba(0,243,255,0.5);border-right:2px solid rgba(217,70,239,0.5);"></div>' +
                    '</div>' +
                    '<div id="fanPlaysTargetStar" style="position:absolute;top:50%;transform:translate(-50%,-50%);pointer-events:none;filter:drop-shadow(0 0 3px rgba(255,255,255,0.35));">' + targetStarSvg() + '</div>' +
                    '<div id="fanPlaysIndicator" style="position:absolute;top:50%;transform:translate(-50%,-50%);pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5)) drop-shadow(0 0 7px rgba(0,243,255,0.85));">' + movingStarSvg() + '</div>' +
                '</div>' +
                '<div class="flex justify-between mt-1 text-[10px] text-gray-500"><span id="fanPlaysLastScore"></span><span id="fanPlaysRoundCount">0/' + totalRounds + ' rondas</span></div>';

            // Tablerito de moneditas: pedido explícito de ubicarlo justo
            // debajito del contador de tiempo, no acá abajo de la pista --
            // ese placeholder lo arma createBattleUI() (game-engine.js) y
            // vive fuera de containerEl. Si por algún motivo no está (otro
            // contexto que reuse este módulo sin ese placeholder), se cae
            // a un lugar propio dentro de containerEl para no perder la
            // función por completo.
            var achievementsHost = document.getElementById('fanPlaysAchievementsTop') || containerEl;
            achievementsHost.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:center;gap:10px;">' +
                    '<div style="display:flex;align-items:center;gap:4px;">' +
                        '<span style="color:#22d3ee;font-weight:700;font-size:10px;">VOS</span>' +
                        '<div id="fanPlaysMyCoins" style="display:flex;gap:2px;flex-wrap:wrap;min-height:11px;"></div>' +
                        '<span id="fanPlaysMyCoinsCount" style="color:#9ca3af;font-size:10px;"></span>' +
                    '</div>' +
                    '<span style="color:#4b5563;font-size:10px;">·</span>' +
                    '<div style="display:flex;align-items:center;gap:4px;">' +
                        '<span style="color:#e879f9;font-weight:700;font-size:10px;">RIVAL</span>' +
                        '<div id="fanPlaysCpuCoins" style="display:flex;gap:2px;flex-wrap:wrap;min-height:11px;"></div>' +
                        '<span id="fanPlaysCpuCoinsCount" style="color:#9ca3af;font-size:10px;"></span>' +
                    '</div>' +
                '</div>';

            const track = containerEl.querySelector('#fanPlaysTrack');
            const zoneEl = containerEl.querySelector('#fanPlaysZone');
            const targetStarEl = containerEl.querySelector('#fanPlaysTargetStar');
            const indicatorEl = containerEl.querySelector('#fanPlaysIndicator');
            const indicatorInner = indicatorEl.firstElementChild;
            const myCoinsEl = achievementsHost.querySelector('#fanPlaysMyCoins');
            const myCoinsCountEl = achievementsHost.querySelector('#fanPlaysMyCoinsCount');
            const lastScoreEl = containerEl.querySelector('#fanPlaysLastScore');
            const roundCountEl = containerEl.querySelector('#fanPlaysRoundCount');

            // Ajuste MÍNIMO, no un recentrado -- reportado en vivo que
            // block:'center' se pasaba de largo: dejaba solo la pista
            // chica en el medio de la pantalla y tapaba todo lo de
            // arriba (timer, VS) y de abajo (mensaje de resultado).
            // createBattleUI() ya deja bien ubicado el tope de la arena;
            // acá solo se corrige si el FONDO de la pista queda tapado
            // por abajo -- y en ese caso se baja SOLO lo que falta para
            // que entre, ni un píxel más, para no perder de vista lo de
            // arriba sin necesidad.
            setTimeout(function () {
                try {
                    var rect = containerEl.getBoundingClientRect();
                    var header = document.querySelector('header');
                    var headerHeight = header ? header.offsetHeight : 64;
                    var margin = 12;
                    var alreadyVisible = rect.top >= headerHeight && rect.bottom <= window.innerHeight - margin;
                    if (alreadyVisible) return;
                    var overflowBottom = rect.bottom - (window.innerHeight - margin);
                    if (overflowBottom > 0) {
                        window.scrollBy({ top: overflowBottom, behavior: 'smooth' });
                    }
                } catch (e) { /* ignore */ }
            }, 450);

            // Giro suave y constante -- junto con el degradé/brillo de
            // movingStarSvg(), es lo que vende el aspecto "3D" (un objeto
            // sólido rotando, no un ícono plano pegado a la pantalla). Va en
            // el SVG interno, no en el div que ya usa transform para
            // centrarse y para moverse por la pista.
            this._spinAnim = indicatorInner.animate(
                [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
                { duration: 3400, iterations: Infinity, easing: 'linear' }
            );

            // Scroll infinito de las dos ondas de fondo -- direcciones y
            // velocidades distintas para que se sientan orgánicas, no un
            // patrón mecánico repitiéndose igual.
            var wave1El = containerEl.querySelector('#fanPlaysWave1');
            var wave2El = containerEl.querySelector('#fanPlaysWave2');
            this._waveAnims = [];
            if (wave1El) this._waveAnims.push(wave1El.animate([{ transform: 'translateX(0%)' }, { transform: 'translateX(-50%)' }], { duration: 3200, iterations: Infinity, easing: 'linear' }));
            if (wave2El) this._waveAnims.push(wave2El.animate([{ transform: 'translateX(-50%)' }, { transform: 'translateX(0%)' }], { duration: 4600, iterations: Infinity, easing: 'linear' }));

            function renderZoneFor(roundIndex) {
                const center = S.zoneCenterForRound(usedSeed, roundIndex);
                const half = S.ZONE_WIDTH_PCT / 2;
                zoneEl.style.left = Math.max(0, center - half) + '%';
                zoneEl.style.width = S.ZONE_WIDTH_PCT + '%';
                targetStarEl.style.left = center + '%';
                // Pequeño "acomodo" al aparecer la zona nueva, para que no
                // se sienta estática -- refuerza la lectura 3D.
                targetStarEl.animate([{ transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: 220, easing: 'ease-out' });
            }

            function currentRoundIndex(tMs) { return S.roundIndexForTime(tMs); }

            function handleTap(e) {
                if (finished || battleStartAt == null) return;
                const now = performance.now();
                if (now - lastTapAt < S.MIN_TAP_GAP_MS) return; // anti-bot / doble toque accidental
                const atMs = now - battleStartAt;
                if (atMs < 0 || atMs > durationMs) return;
                const roundIndex = currentRoundIndex(atMs);
                if (roundIndex >= totalRounds || resolvedRounds[roundIndex] !== null) return; // ya se tocó esta ronda

                lastTapAt = now;
                rawTaps.push({ atMs: Math.round(atMs) });

                const score = S.scoreForTap(atMs, usedSeed, durationMs);
                const perfect = score != null && score > 100;
                resolvedRounds[roundIndex] = score == null ? 0 : score;

                const indicatorPct = S.indicatorPctAtTime(atMs);
                if (resolvedRounds[roundIndex] > 0) {
                    spawnFlash(track, indicatorPct, perfect);
                    if (perfect) {
                        spawnComicBurst(track, indicatorPct);
                        spawnMtrCoin();
                        appendCoinDot(myCoinsEl, myCoinsCountEl);
                        playCrowdCheer();
                        targetStarEl.animate([{ filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.35))' }, { filter: 'drop-shadow(0 0 16px rgba(250,204,21,1))' }, { filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.35))' }], { duration: 500 });
                    }
                }
                playTapSound(perfect, resolvedRounds[roundIndex] === 0);

                if (lastScoreEl) {
                    lastScoreEl.textContent = perfect
                        ? ('¡PERFECTO! +' + resolvedRounds[roundIndex] + ' pts (doble)')
                        : (resolvedRounds[roundIndex] > 0 ? ('¡Bien! +' + resolvedRounds[roundIndex] + ' pts') : 'Fuera de zona -- 0 pts');
                }
                var hitCount = resolvedRounds.filter(function (s) { return s !== null; }).length;
                if (roundCountEl) roundCountEl.textContent = hitCount + '/' + totalRounds + ' rondas';

                var liveSum = resolvedRounds.reduce(function (a, s) { return a + (s || 0); }, 0);
                if (typeof onTick === 'function') onTick(Math.round((liveSum / totalRounds) * 10) / 10, hitCount);
            }

            track.addEventListener('mousedown', handleTap);
            track.addEventListener('touchstart', handleTap, { passive: true });

            this._active = true;
            let lastRenderedRound = -1;

            const loop = () => {
                if (!this._active) return;
                const now = performance.now();
                if (battleStartAt == null) battleStartAt = now;
                const elapsed = now - battleStartAt;

                if (elapsed >= durationMs) {
                    finished = true;
                    this._active = false;
                    track.removeEventListener('mousedown', handleTap);
                    track.removeEventListener('touchstart', handleTap);
                    if (this._spinAnim) { this._spinAnim.cancel(); this._spinAnim = null; }
                    if (this._waveAnims) { this._waveAnims.forEach(function (a) { a.cancel(); }); this._waveAnims = null; }
                    var finalSum = resolvedRounds.reduce(function (a, s) { return a + (s || 0); }, 0);
                    var finalAvg = Math.round((finalSum / totalRounds) * 10) / 10;
                    var roundsHit = resolvedRounds.filter(function (s) { return s !== null; }).length;
                    if (typeof onFinish === 'function') onFinish(finalAvg, roundsHit, rawTaps, totalRounds);
                    return;
                }

                const roundIndex = currentRoundIndex(elapsed);
                if (roundIndex !== lastRenderedRound && roundIndex < totalRounds) {
                    lastRenderedRound = roundIndex;
                    renderZoneFor(roundIndex);
                }

                indicatorEl.style.left = S.indicatorPctAtTime(elapsed) + '%';
                this._raf = requestAnimationFrame(loop);
            };
            this._raf = requestAnimationFrame(loop);
        },

        stop() {
            this._active = false;
            if (this._raf) {
                cancelAnimationFrame(this._raf);
                this._raf = null;
            }
            if (this._spinAnim) {
                this._spinAnim.cancel();
                this._spinAnim = null;
            }
            if (this._waveAnims) {
                this._waveAnims.forEach(function (a) { a.cancel(); });
                this._waveAnims = null;
            }
        },

        /**
         * Desempeño simulado de la CPU -- NO es deshonesto simularlo (a
         * diferencia de fingir datos externos reales): todo videojuego con
         * modo vs. CPU simula su nivel de juego, es una convención
         * universalmente entendida. Lo único que hay que cuidar es que la
         * dificultad sea PAREJA y quede documentada acá mismo, nunca
         * ajustada en secreto para favorecer a la casa.
         */
        simulateCpuScore() {
            const baseline = 62;
            const spread = 22;
            const score = baseline + (Math.random() * 2 - 1) * spread;
            return Math.max(5, Math.min(97, Math.round(score)));
        },

        /**
         * Tasa fija y documentada de "perfectos" simulados de la CPU --
         * mismo criterio que simulateCpuScore(): nunca se ajusta en
         * secreto, vive acá a la vista. 10% por ronda, un valor parejo
         * (ni imposible de igualar ni regalado).
         */
        CPU_PERFECT_RATE: 0.10,

        // Llamado desde game-engine.js (el simulador de la CPU vive ahí,
        // no acá) cada vez que a la CPU "le toca" un perfecto -- agrega la
        // moneda a la fila del rival dentro de ESTE contenedor de juego.
        markOpponentPerfect(containerEl) {
            // El tablerito vive en #fanPlaysAchievementsTop (debajo del
            // contador de tiempo, ver createBattleUI en game-engine.js),
            // no dentro de containerEl -- salvo que ese placeholder no
            // exista, ahí sí se cae a buscarlo adentro (ver start()).
            var host = document.getElementById('fanPlaysAchievementsTop') || containerEl;
            if (!host) return;
            appendCoinDot(host.querySelector('#fanPlaysCpuCoins'), host.querySelector('#fanPlaysCpuCoinsCount'));
        }
    };

    window.FanPlaysMinigame = FanPlaysMinigame;
})();
