/**
 * Lógica de puntaje de "Reproducciones de Fan" -- COMPARTIDA entre
 * cliente (navegador) y servidor (Node). Tiene que dar EXACTAMENTE el
 * mismo resultado en los dos lados, por eso vive en un solo archivo con
 * cero dependencias de DOM/window/módulos de Node, y se carga tal cual
 * en ambos entornos (UMD mínimo casero).
 *
 * Por qué existe esto (seguridad, no solo prolijidad): en un modo con
 * dinero real y dos jugadores humanos, cada uno corre el mini-juego en
 * su propio dispositivo -- si confiáramos en que cada cliente nos
 * mande "mi puntaje fue X", cualquiera podría editarlo en el navegador
 * y ganar todas las batallas reales sin tocar la pantalla. La solución:
 * el servidor emite una semilla al arrancar la batalla, el CLIENTE
 * arma las rondas a partir de esa semilla (mismo horario y misma
 * posición de zona que va a poder recalcular el servidor), el cliente
 * manda los TOQUES CRUDOS (no el puntaje), y el servidor recalcula el
 * puntaje real de forma independiente con las mismas funciones de acá
 * abajo. Si no coincide con lo que el cliente afirma, se usa el
 * recalculado por el servidor -- nunca el del cliente.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(); // Node (backend)
    } else {
        root.FanPlaysScoring = factory(); // navegador
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var ROUND_MS = 2200;
    var ZONE_WIDTH_PCT = 16;
    var MIN_TAP_GAP_MS = 150;
    // "Perfecto": tocar tan cerca del centro de la zona que la estrella que
    // se desliza coincide con la estrella fija dibujada ahí -- dentro de
    // esta fracción del medio-ancho de la zona, el toque vale DOBLE.
    // Pedido explícito del usuario ("si coincide con su misma forma...
    // será doble puntuación"). Vive acá (no solo en el cliente) porque
    // afecta el puntaje que el servidor recalcula para dinero real.
    var PERFECT_TOLERANCE_RATIO = 0.18;

    // mulberry32 -- PRNG determinístico chico y rápido, misma salida en
    // cualquier motor JS (navegador o Node) para la misma semilla.
    function mulberry32(seed) {
        return function () {
            seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
            var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Semilla independiente por ronda (no hace falta rehacer las rondas
    // anteriores para verificar una sola) -- multiplicador impar grande
    // para decorrelacionar rondas consecutivas.
    function roundSeedFor(seed, roundIndex) {
        return (seed ^ Math.imul(roundIndex + 1, 0x9E3779B1)) >>> 0;
    }

    function zoneCenterForRound(seed, roundIndex) {
        var rng = mulberry32(roundSeedFor(seed, roundIndex));
        return 10 + rng() * 80; // 10..90
    }

    // Posición del indicador (0..100) en el momento absoluto tMs desde
    // el inicio de la batalla -- vaivén triangular, alineado a los
    // límites fijos de cada ronda (round i = [i*ROUND_MS, (i+1)*ROUND_MS)).
    function indicatorPctAtTime(tMs) {
        var roundElapsed = ((tMs % ROUND_MS) + ROUND_MS) % ROUND_MS;
        var frac = roundElapsed / ROUND_MS;
        return frac < 0.5 ? frac * 2 * 100 : (1 - (frac - 0.5) * 2) * 100;
    }

    function roundIndexForTime(tMs) {
        return Math.floor(tMs / ROUND_MS);
    }

    function totalRoundsFor(durationMs) {
        return Math.max(1, Math.floor(durationMs / ROUND_MS));
    }

    // Puntaje 0-100 de UN toque, dado el momento (ms desde el inicio de
    // la batalla) y la semilla de la partida. null si el toque cae fuera
    // de la ventana total de la batalla.
    function scoreForTap(atMs, seed, durationMs) {
        if (atMs < 0 || atMs > durationMs) return null;
        var roundIndex = roundIndexForTime(atMs);
        var zoneCenter = zoneCenterForRound(seed, roundIndex);
        var indicatorPct = indicatorPctAtTime(atMs);
        var half = ZONE_WIDTH_PCT / 2;
        var dist = Math.abs(indicatorPct - zoneCenter);
        if (dist > half) return 0;
        var base = 100 * (1 - dist / half);
        // Toque "perfecto" -- coincide con la estrella fija -- vale doble.
        // Un puntaje devuelto por acá mayor a 100 SIEMPRE significa
        // "perfecto"; lo usa la UI del cliente para disparar el destello
        // grande sin tener que recalcular la distancia por su cuenta.
        if (dist <= half * PERFECT_TOLERANCE_RATIO) return Math.round(base * 2);
        return Math.round(base);
    }

    // Solo para la UI (destello/sonido especial) -- ¿este toque hubiera
    // sido "perfecto" en este momento? Usa la misma tolerancia que
    // scoreForTap para no duplicar el número mágico en dos lugares.
    function isPerfectTap(atMs, seed) {
        var roundIndex = roundIndexForTime(atMs);
        var zoneCenter = zoneCenterForRound(seed, roundIndex);
        var indicatorPct = indicatorPctAtTime(atMs);
        var half = ZONE_WIDTH_PCT / 2;
        return Math.abs(indicatorPct - zoneCenter) <= half * PERFECT_TOLERANCE_RATIO;
    }

    /**
     * Recalcula el puntaje FINAL (0-100, promedio) a partir de la lista
     * cruda de toques -- es la única fuente de verdad tanto en cliente
     * (para la UI en vivo) como en servidor (para lo que realmente se
     * paga). Rondas sin toque cuentan como 0. Descarta/ignora toques
     * inválidos en vez de confiar ciegamente en ellos:
     *  - fuera de la ventana [0, durationMs]
     *  - repetidos en la misma ronda (se queda con el primero)
     *  - separados por menos de MIN_TAP_GAP_MS del toque anterior válido
     *    (indicio de macro/script, no de un humano tocando con intención)
     */
    function computeScoreFromTaps(taps, seed, durationMs) {
        var totalRounds = totalRoundsFor(durationMs);
        var perRound = new Array(totalRounds).fill(null);
        var lastValidAt = -Infinity;

        (taps || [])
            .filter(function (t) { return t && typeof t.atMs === 'number'; })
            .sort(function (a, b) { return a.atMs - b.atMs; })
            .forEach(function (t) {
                if (t.atMs - lastValidAt < MIN_TAP_GAP_MS) return; // anti-bot
                var roundIndex = roundIndexForTime(t.atMs);
                if (roundIndex < 0 || roundIndex >= totalRounds) return;
                if (perRound[roundIndex] !== null) return; // ya hay un toque válido en esa ronda
                var score = scoreForTap(t.atMs, seed, durationMs);
                if (score === null) return;
                perRound[roundIndex] = score;
                lastValidAt = t.atMs;
            });

        var sum = 0;
        for (var i = 0; i < totalRounds; i++) sum += perRound[i] === null ? 0 : perRound[i];
        return {
            average: Math.round((sum / totalRounds) * 10) / 10,
            roundsHit: perRound.filter(function (s) { return s !== null && s > 0; }).length,
            totalRounds: totalRounds
        };
    }

    return {
        ROUND_MS: ROUND_MS,
        ZONE_WIDTH_PCT: ZONE_WIDTH_PCT,
        MIN_TAP_GAP_MS: MIN_TAP_GAP_MS,
        PERFECT_TOLERANCE_RATIO: PERFECT_TOLERANCE_RATIO,
        mulberry32: mulberry32,
        zoneCenterForRound: zoneCenterForRound,
        indicatorPctAtTime: indicatorPctAtTime,
        isPerfectTap: isPerfectTap,
        roundIndexForTime: roundIndexForTime,
        totalRoundsFor: totalRoundsFor,
        scoreForTap: scoreForTap,
        computeScoreFromTaps: computeScoreFromTaps
    };
});
