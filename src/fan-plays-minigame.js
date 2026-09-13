/**
 * Reproducciones de Fan -- mini-juego de precisión rítmica
 * ============================================================
 * Fase 1 del rediseño de resolución de batallas (Modo Práctica, sin
 * dinero real). Reemplaza el viejo mecanismo "cosmético" (popularidad
 * estática de Deezer + Math.random() sin ninguna acción del jugador)
 * por algo genuinamente real y medible: qué tan preciso sos tocando en
 * el momento justo.
 *
 * Mecánica: un indicador se mueve de un lado a otro de una pista. Hay
 * una "zona" resaltada en una posición aleatoria. Tocás cuando el
 * indicador está adentro de la zona -- cuanto más cerca del centro,
 * más puntaje esa ronda (0-100). Al tocar (o al vencerse el tiempo de
 * la ronda sin tocar, que cuenta como 0), arranca una ronda nueva con
 * una zona nueva, hasta que se acaba el tiempo total de la batalla.
 * El puntaje final es el promedio de todas las rondas jugadas --
 * recompensa precisión sostenida, no solo tocar rápido.
 *
 * Nada de esto depende de ninguna API externa ni de ningún dato de
 * streaming -- es 100% generado y medido acá mismo, en el momento,
 * por eso es honesto llamarlo "real": es tu desempeño real, no un
 * número inventado disfrazado de otra cosa.
 */

(function () {
    'use strict';

    const FanPlaysMinigame = {
        _raf: null,
        _active: false,

        /**
         * @param {HTMLElement} containerEl - dónde se dibuja el juego
         * @param {number} durationSec - duración total de la batalla
         * @param {function} onTick - (liveScore0to100, roundsPlayed) => void, llamado en cada ronda resuelta
         * @param {function} onFinish - (finalScore0to100, roundsPlayed) => void, llamado al terminar el tiempo
         */
        start(containerEl, durationSec, onTick, onFinish) {
            if (!containerEl) return;
            this.stop(); // por si quedó una instancia previa sin limpiar

            const ROUND_MS = 2200; // tiempo máximo por ronda antes de contar como fallo
            const ZONE_WIDTH_PCT = 16; // ancho de la zona objetivo, % de la pista
            const MIN_TAP_GAP_MS = 150; // anti-bot: ignora toques más rápidos que esto (spam/macro)

            let scores = [];
            let roundStart = 0;
            let zoneCenterPct = 50;
            let lastTapAt = 0;
            let finished = false;
            let battleEndAt = Date.now() + durationSec * 1000;

            containerEl.innerHTML =
                '<div class="text-center text-[11px] text-gray-400 mb-1">Tocá cuando el indicador entre en la zona -- más al centro, más reproducciones</div>' +
                '<div id="fanPlaysTrack" style="position:relative;height:44px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);overflow:hidden;cursor:pointer;touch-action:manipulation;">' +
                    '<div id="fanPlaysZone" style="position:absolute;top:0;bottom:0;background:linear-gradient(90deg,rgba(0,243,255,0.25),rgba(217,70,239,0.25));border-left:2px solid rgba(0,243,255,0.6);border-right:2px solid rgba(217,70,239,0.6);"></div>' +
                    '<div id="fanPlaysIndicator" style="position:absolute;top:-4px;bottom:-4px;width:4px;background:#fff;box-shadow:0 0 10px rgba(255,255,255,0.9);"></div>' +
                '</div>' +
                '<div class="flex justify-between mt-1 text-[10px] text-gray-500"><span id="fanPlaysLastScore"></span><span id="fanPlaysRoundCount">0 rondas</span></div>';

            const track = containerEl.querySelector('#fanPlaysTrack');
            const zoneEl = containerEl.querySelector('#fanPlaysZone');
            const indicatorEl = containerEl.querySelector('#fanPlaysIndicator');
            const lastScoreEl = containerEl.querySelector('#fanPlaysLastScore');
            const roundCountEl = containerEl.querySelector('#fanPlaysRoundCount');

            function placeZone() {
                zoneCenterPct = 10 + Math.random() * (90 - 10);
                const half = ZONE_WIDTH_PCT / 2;
                zoneEl.style.left = Math.max(0, zoneCenterPct - half) + '%';
                zoneEl.style.width = ZONE_WIDTH_PCT + '%';
            }

            function currentIndicatorPct(now) {
                // Ping-pong triangular entre 0% y 100% de la pista, período fijo
                // por ronda -- así cada ronda es "ganable" en el tiempo que dura.
                const elapsed = now - roundStart;
                const period = ROUND_MS; // ida y vuelta completa
                const t = (elapsed % period) / period; // 0..1
                // Triangular: 0->1->0
                return t < 0.5 ? (t * 2) * 100 : (1 - (t - 0.5) * 2) * 100;
            }

            function newRound() {
                roundStart = Date.now();
                placeZone();
            }

            function resolveRound(tapPct) {
                let score = 0;
                if (tapPct != null) {
                    const half = ZONE_WIDTH_PCT / 2;
                    const dist = Math.abs(tapPct - zoneCenterPct);
                    if (dist <= half) {
                        score = Math.round(100 * (1 - dist / half));
                    }
                }
                scores.push(score);
                if (lastScoreEl) {
                    lastScoreEl.textContent = tapPct == null
                        ? 'Sin toque -- 0 pts'
                        : (score > 0 ? ('¡Bien! +' + score + ' pts') : 'Fuera de zona -- 0 pts');
                }
                if (roundCountEl) roundCountEl.textContent = scores.length + (scores.length === 1 ? ' ronda' : ' rondas');
                const live = scores.reduce((a, b) => a + b, 0) / scores.length;
                if (typeof onTick === 'function') onTick(Math.round(live), scores.length);
                newRound();
            }

            function handleTap(e) {
                if (finished) return;
                const now = Date.now();
                // Anti-bot / anti-doble-toque accidental: ignora toques
                // demasiado seguidos (un macro/script mandaría taps a
                // intervalos perfectamente regulares y muy rápidos -- un
                // humano tocando con intención no llega a ese ritmo).
                if (now - lastTapAt < MIN_TAP_GAP_MS) return;
                lastTapAt = now;

                const rect = track.getBoundingClientRect();
                const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
                // La posición del TOQUE en la pista no es lo que se evalúa
                // (tocar en cualquier lado sirve) -- lo que importa es DÓNDE
                // ESTABA EL INDICADOR en el instante del toque. Se deja la
                // posición del clic solo para no romper si en el futuro se
                // quiere un modo "tocá el indicador" en vez de "tocá cuando
                // esté en la zona".
                void rect; void clientX;

                const tapPct = currentIndicatorPct(Date.now());
                resolveRound(tapPct);
            }

            track.addEventListener('mousedown', handleTap);
            track.addEventListener('touchstart', handleTap, { passive: true });

            newRound();
            this._active = true;

            const loop = () => {
                if (!this._active) return;
                const now = Date.now();

                if (now >= battleEndAt) {
                    finished = true;
                    this._active = false;
                    track.removeEventListener('mousedown', handleTap);
                    track.removeEventListener('touchstart', handleTap);
                    const finalScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
                    if (typeof onFinish === 'function') onFinish(finalScore, scores.length);
                    return;
                }

                // Ronda vencida sin toque -- cuenta como 0 y arranca la próxima.
                if (now - roundStart >= ROUND_MS) {
                    resolveRound(null);
                }

                const pct = currentIndicatorPct(now);
                indicatorEl.style.left = pct + '%';

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
         * ajustada en secreto para favorecer a la casa -- sobre todo
         * relevante para cuando este mismo mecanismo se use en el fallback
         * de Modo Rápido con dinero real (fase futura, no esta).
         *
         * Curva: centrada en 62/100 (un jugador humano promedio, ni
         * perfecto ni torpe) con variación aleatoria uniforme de ±22 --
         * deja margen real para que un jugador atento gane la mayoría de
         * las veces, sin que sea automático.
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
