/**
 * Reproducciones de Fan -- mini-juego de precisión rítmica (UI cliente)
 * ============================================================
 * Rediseñado para verificación server-side: el horario de rondas y la
 * posición de cada zona salen de una SEMILLA determinística (la misma
 * que el servidor va a usar para recalcular el puntaje real a partir
 * de los toques crudos -- ver src/fan-plays-scoring.js y
 * backend/server-auto.js, endpoints /api/battles/:id/fanplay-seed y
 * .../submit-fanplay-score). Este archivo depende de que
 * fan-plays-scoring.js ya esté cargado (window.FanPlaysScoring).
 *
 * El puntaje que se calcula ACÁ es solo para el feedback visual
 * inmediato del jugador -- el que realmente vale (el que decide la
 * batalla y el pago) es el que recalcula el servidor de forma
 * independiente a partir de los toques crudos que se mandan en
 * onFinish. En Modo Práctica (sin dinero real, sin verificación
 * server-side) el puntaje local sigue siendo la única fuente, por eso
 * onFinish siempre lo manda también.
 */

(function () {
    'use strict';

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

            let battleStartAt = null; // se fija en el primer frame (performance.now())
            let rawTaps = []; // {atMs} -- lo único que se manda al servidor
            let lastTapAt = -Infinity;
            let resolvedRounds = new Array(totalRounds).fill(null); // solo para feedback visual local
            let finished = false;

            containerEl.innerHTML =
                '<div class="text-center text-[11px] text-gray-400 mb-1">Tocá cuando el indicador entre en la zona -- más al centro, más reproducciones</div>' +
                '<div id="fanPlaysTrack" style="position:relative;height:44px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);overflow:hidden;cursor:pointer;touch-action:manipulation;">' +
                    '<div id="fanPlaysZone" style="position:absolute;top:0;bottom:0;background:linear-gradient(90deg,rgba(0,243,255,0.25),rgba(217,70,239,0.25));border-left:2px solid rgba(0,243,255,0.6);border-right:2px solid rgba(217,70,239,0.6);"></div>' +
                    '<div id="fanPlaysIndicator" style="position:absolute;top:-4px;bottom:-4px;width:4px;background:#fff;box-shadow:0 0 10px rgba(255,255,255,0.9);"></div>' +
                '</div>' +
                '<div class="flex justify-between mt-1 text-[10px] text-gray-500"><span id="fanPlaysLastScore"></span><span id="fanPlaysRoundCount">0/' + totalRounds + ' rondas</span></div>';

            const track = containerEl.querySelector('#fanPlaysTrack');
            const zoneEl = containerEl.querySelector('#fanPlaysZone');
            const indicatorEl = containerEl.querySelector('#fanPlaysIndicator');
            const lastScoreEl = containerEl.querySelector('#fanPlaysLastScore');
            const roundCountEl = containerEl.querySelector('#fanPlaysRoundCount');

            function renderZoneFor(roundIndex) {
                const center = S.zoneCenterForRound(usedSeed, roundIndex);
                const half = S.ZONE_WIDTH_PCT / 2;
                zoneEl.style.left = Math.max(0, center - half) + '%';
                zoneEl.style.width = S.ZONE_WIDTH_PCT + '%';
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
                resolvedRounds[roundIndex] = score == null ? 0 : score;

                if (lastScoreEl) {
                    lastScoreEl.textContent = (resolvedRounds[roundIndex] > 0)
                        ? ('¡Bien! +' + resolvedRounds[roundIndex] + ' pts')
                        : 'Fuera de zona -- 0 pts';
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
