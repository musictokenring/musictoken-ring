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
 * Refinado a pedido del usuario: la marca que se desliza y el blanco
 * fijo son ambos una ESTRELLA (no una línea) -- tocar dentro de la zona
 * dispara un destello, y si el toque coincide casi exactamente con la
 * estrella fija (la fórmula compartida ya define qué tan cerca es
 * "perfecto", ver PERFECT_TOLERANCE_RATIO) el puntaje sale doble y el
 * destello es más grande. Cada toque además dispara un sonido breve de
 * "disparo láser" sintetizado con Web Audio -- no hace falta ningún
 * archivo de audio.
 *
 * El puntaje que se calcula ACÁ es solo para el feedback visual
 * inmediato del jugador -- el que realmente vale (el que decide la
 * batalla y el pago en dinero real) es el que recalcula el servidor de
 * forma independiente a partir de los toques crudos que se mandan en
 * onFinish. En Modo Práctica (sin dinero real, sin verificación
 * server-side) el puntaje local sigue siendo la única fuente.
 */

(function () {
    'use strict';

    // Estrella de 5 puntas, viewBox 0 0 24 24 (mismo trazo que un ícono
    // de "favorito" estándar) -- se reusa para la marca que se desliza y
    // para el blanco fijo dentro de la zona.
    var STAR_PATH = 'M12 2.5 L14.9 9.1 L22 9.8 L16.7 14.6 L18.2 21.5 L12 17.8 L5.8 21.5 L7.3 14.6 L2 9.8 L9.1 9.1 Z';

    function starSvg(opts) {
        opts = opts || {};
        var size = opts.size || 26;
        var fill = opts.fill || 'none';
        var stroke = opts.stroke || '#fff';
        var strokeWidth = opts.strokeWidth != null ? opts.strokeWidth : 1.5;
        var extra = opts.extra || '';
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" style="' + (opts.style || '') + '">' +
            '<path d="' + STAR_PATH + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '" stroke-linejoin="round"/>' +
            extra +
            '</svg>';
    }

    // Sonido de "disparo láser" sintetizado -- barrido de frecuencia
    // descendente, sin ningún archivo externo. Volumen bajo a propósito
    // ("sonido sutil", pedido explícito). Un solo AudioContext reusado
    // entre toques para no crear uno nuevo cada vez.
    var _audioCtx = null;
    function playTapSound(perfect, missed) {
        try {
            if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (_audioCtx.state === 'suspended') _audioCtx.resume();
            var now = _audioCtx.currentTime;
            var osc = _audioCtx.createOscillator();
            var gain = _audioCtx.createGain();
            if (missed) {
                // Toque fuera de la zona -- un "thud" corto y grave, no un láser.
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

    // Destello en el punto de impacto -- un círculo con degradé que crece
    // y se desvanece, animado con la Web Animations API (sin CSS global
    // nuevo, para no ensuciar el resto de la página).
    function spawnFlash(containerEl, leftPct, perfect) {
        var flash = document.createElement('div');
        var size = perfect ? 64 : 40;
        var color = perfect ? 'rgba(250,204,21,0.9)' : 'rgba(0,243,255,0.75)';
        flash.style.cssText = 'position:absolute;top:50%;left:' + leftPct + '%;width:' + size + 'px;height:' + size + 'px;' +
            'margin-left:-' + (size / 2) + 'px;margin-top:-' + (size / 2) + 'px;border-radius:50%;pointer-events:none;' +
            'background:radial-gradient(circle,' + color + ' 0%,rgba(0,0,0,0) 70%);z-index:5;';
        containerEl.appendChild(flash);
        var anim = flash.animate([
            { transform: 'scale(0.3)', opacity: 1 },
            { transform: 'scale(' + (perfect ? 2.4 : 1.6) + ')', opacity: 0 }
        ], { duration: perfect ? 450 : 300, easing: 'ease-out' });
        anim.onfinish = function () { flash.remove(); };
    }

    const FanPlaysMinigame = {
        _raf: null,
        _active: false,

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

            containerEl.innerHTML =
                '<div class="text-center text-[11px] text-gray-400 mb-1">Tocá cuando la estrella que se desliza entre en la zona -- si coincide con la estrella fija, ¡doble puntaje!</div>' +
                '<div id="fanPlaysTrack" style="position:relative;height:52px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);overflow:hidden;cursor:pointer;touch-action:manipulation;">' +
                    '<div id="fanPlaysZone" style="position:absolute;top:0;bottom:0;background:linear-gradient(90deg,rgba(0,243,255,0.18),rgba(217,70,239,0.18));border-left:2px solid rgba(0,243,255,0.5);border-right:2px solid rgba(217,70,239,0.5);"></div>' +
                    '<div id="fanPlaysTargetStar" style="position:absolute;top:50%;transform:translate(-50%,-50%);pointer-events:none;filter:drop-shadow(0 0 3px rgba(255,255,255,0.4));">' + starSvg({ size: 22, fill: 'none', stroke: 'rgba(255,255,255,0.55)', strokeWidth: 1.3 }) + '</div>' +
                    '<div id="fanPlaysIndicator" style="position:absolute;top:50%;transform:translate(-50%,-50%);pointer-events:none;filter:drop-shadow(0 0 6px rgba(0,243,255,0.9));">' + starSvg({ size: 24, fill: '#fff', stroke: '#22d3ee', strokeWidth: 1 }) + '</div>' +
                '</div>' +
                '<div class="flex justify-between mt-1 text-[10px] text-gray-500"><span id="fanPlaysLastScore"></span><span id="fanPlaysRoundCount">0/' + totalRounds + ' rondas</span></div>';

            const track = containerEl.querySelector('#fanPlaysTrack');
            const zoneEl = containerEl.querySelector('#fanPlaysZone');
            const targetStarEl = containerEl.querySelector('#fanPlaysTargetStar');
            const indicatorEl = containerEl.querySelector('#fanPlaysIndicator');
            const lastScoreEl = containerEl.querySelector('#fanPlaysLastScore');
            const roundCountEl = containerEl.querySelector('#fanPlaysRoundCount');

            function renderZoneFor(roundIndex) {
                const center = S.zoneCenterForRound(usedSeed, roundIndex);
                const half = S.ZONE_WIDTH_PCT / 2;
                zoneEl.style.left = Math.max(0, center - half) + '%';
                zoneEl.style.width = S.ZONE_WIDTH_PCT + '%';
                targetStarEl.style.left = center + '%';
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
                        // Las dos estrellas "coinciden" -- breve pulso dorado en
                        // ambas para que se vea la coincidencia, no solo el número.
                        targetStarEl.animate([{ filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.4))' }, { filter: 'drop-shadow(0 0 14px rgba(250,204,21,1))' }, { filter: 'drop-shadow(0 0 3px rgba(255,255,255,0.4))' }], { duration: 450 });
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
        }
    };

    window.FanPlaysMinigame = FanPlaysMinigame;
})();
