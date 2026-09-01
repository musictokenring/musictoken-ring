/**
 * Iconos profesionales (Tabler Icons, MIT license, https://tabler.io/icons)
 * SVG outline embebidos inline -- sin dependencia externa ni webfont.
 * Reemplaza los emojis de la UI por algo mas serio/profesional (pedido
 * explicito del usuario: "se ve muy novato").
 *
 * Uso:
 *   MTRIcons.svg('bolt')                    -> string <svg>...</svg>, 24x24, stroke=currentColor
 *   MTRIcons.badge('bolt', {color:'cyan'})   -> insignia circular con glow (estilo elegido por el usuario)
 */
(function (global) {
    'use strict';

    const PATHS = {
        bolt: "<path d=\"M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11\" />",
        lock: "<path d=\"M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6\" /><path d=\"M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0\" /><path d=\"M8 11v-4a4 4 0 1 1 8 0v4\" />",
        swords: "<path d=\"M21 3v5l-11 9l-4 4l-3 -3l4 -4l9 -11l5 0\" /><path d=\"M5 13l6 6\" /><path d=\"M14.32 17.32l3.68 3.68l3 -3l-3.365 -3.365\" /><path d=\"M10 5.5l-2 -2.5h-5v5l3 2.5\" />",
        trophy: "<path d=\"M8 21l8 0\" /><path d=\"M12 17l0 4\" /><path d=\"M7 4l10 0\" /><path d=\"M17 4v8a5 5 0 0 1 -10 0v-8\" /><path d=\"M3 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /><path d=\"M17 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" />",
        target: "<path d=\"M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /><path d=\"M12 7a5 5 0 1 0 5 5\" /><path d=\"M13 3.055a9 9 0 1 0 7.941 7.945\" /><path d=\"M15 6v3h3l3 -3h-3v-3l-3 3\" /><path d=\"M15 9l-3 3\" />",
        music: "<path d=\"M3 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" /><path d=\"M13 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" /><path d=\"M9 17v-13h10v13\" /><path d=\"M9 8h10\" />",
        coin: "<path d=\"M16.7 8a3 3 0 0 0 -2.7 -2h-4a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6h-4a3 3 0 0 1 -2.7 -2\" /><path d=\"M12 3v3m0 12v3\" />",
        cash: "<path d=\"M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" /><path d=\"M3 8a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -8\" /><path d=\"M18 12h.01\" /><path d=\"M6 12h.01\" />",
        link: "<path d=\"M9 15l6 -6\" /><path d=\"M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464\" /><path d=\"M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463\" />",
        copy: "<path d=\"M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666\" /><path d=\"M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1\" />",
        robot: "<path d=\"M6 6a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -4\" /><path d=\"M12 2v2\" /><path d=\"M9 12v9\" /><path d=\"M15 12v9\" /><path d=\"M5 16l4 -2\" /><path d=\"M15 14l4 2\" /><path d=\"M9 18h6\" /><path d=\"M10 8v.01\" /><path d=\"M14 8v.01\" />",
        warning: "<path d=\"M12 9v4\" /><path d=\"M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0\" /><path d=\"M12 16h.01\" />",
        check: "<path d=\"M5 12l5 5l10 -10\" />",
        close: "<path d=\"M18 6l-12 12\" /><path d=\"M6 6l12 12\" />",
        gamepad: "<path d=\"M12 5h3.5a5 5 0 0 1 0 10h-5.5l-4.015 4.227a2.3 2.3 0 0 1 -3.923 -2.035l1.634 -8.173a5 5 0 0 1 4.904 -4.019h3.4\" /><path d=\"M14 15l4.07 4.284a2.3 2.3 0 0 0 3.925 -2.023l-1.6 -8.232\" /><path d=\"M8 9v2\" /><path d=\"M7 10h2\" /><path d=\"M14 10h2\" />",
        users: "<path d=\"M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0\" /><path d=\"M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2\" /><path d=\"M16 3.13a4 4 0 0 1 0 7.75\" /><path d=\"M21 21v-2a4 4 0 0 0 -3 -3.85\" />",
        search: "<path d=\"M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0\" /><path d=\"M21 21l-6 -6\" />",
        mobile: "<path d=\"M6 5a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2v-14\" /><path d=\"M11 4h2\" /><path d=\"M12 17v.01\" />",
        flame: "<path d=\"M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235\" />",
        sparkles: "<path d=\"M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2m-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6\" />",
        mail: "<path d=\"M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10\" /><path d=\"M3 7l9 6l9 -6\" />",
        user: "<path d=\"M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0\" /><path d=\"M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2\" />",
        bulb: "<path d=\"M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7\" /><path d=\"M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3\" /><path d=\"M9.7 17l4.6 0\" />",
        ban: "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" /><path d=\"M5.7 5.7l12.6 12.6\" />",
        arrowLeft: "<path d=\"M5 12l14 0\" /><path d=\"M5 12l6 6\" /><path d=\"M5 12l6 -6\" />",
        arrowRight: "<path d=\"M5 12l14 0\" /><path d=\"M13 18l6 -6\" /><path d=\"M13 6l6 6\" />",
        chart: "<path d=\"M4 19l16 0\" /><path d=\"M4 15l4 -6l4 2l4 -5l4 4\" />",
        diamond: "<path d=\"M6 5h12l3 5l-8.5 9.5a.7 .7 0 0 1 -1 0l-8.5 -9.5l3 -5\" /><path d=\"M10 12l-2 -2.2l.6 -1\" />",
        medal: "<path d=\"M12 4v3m-4 -3v6m8 -6v6\" /><path d=\"M12 18.5l-3 1.5l.5 -3.5l-2 -2l3 -.5l1.5 -3l1.5 3l3 .5l-2 2l.5 3.5l-3 -1.5\" />",
        book: "<path d=\"M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0\" /><path d=\"M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0\" /><path d=\"M3 6l0 13\" /><path d=\"M12 6l0 13\" /><path d=\"M21 6l0 13\" />",
        world: "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /><path d=\"M3.6 9h16.8\" /><path d=\"M3.6 15h16.8\" /><path d=\"M11.5 3a17 17 0 0 0 0 18\" /><path d=\"M12.5 3a17 17 0 0 1 0 18\" />",
        star: "<path d=\"M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245\" />",
        heart: "<path d=\"M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572\" />",
        shieldCheck: "<path d=\"M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06\" /><path d=\"M15 19l2 2l4 -4\" />",
        wallet: "<path d=\"M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12\" /><path d=\"M20 12v4h-4a2 2 0 0 1 0 -4h4\" />",
        crown: "<path d=\"M12 6l4 6l5 -4l-2 10h-14l-2 -10l5 4l4 -6\" />",
        share: "<path d=\"M3 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" /><path d=\"M15 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" /><path d=\"M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" /><path d=\"M8.7 10.7l6.6 -3.4\" /><path d=\"M8.7 13.3l6.6 3.4\" />",
        whatsapp: "<path d=\"M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9\" /><path d=\"M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1\" />",
        twitterX: "<path d=\"M4 4l11.733 16h4.267l-11.733 -16l-4.267 0\" /><path d=\"M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772\" />",
        twitter: "<path d=\"M22 4.01c-1 .49 -1.98 .689 -3 .99c-1.121 -1.265 -2.783 -1.335 -4.38 -.737s-2.643 2.06 -2.62 3.737v1c-3.245 .083 -6.135 -1.395 -8 -4c0 0 -4.182 7.433 4 11c-1.872 1.247 -3.739 2.088 -6 2c3.308 1.803 6.913 2.423 10.034 1.517c3.58 -1.04 6.522 -3.723 7.651 -7.742a13.84 13.84 0 0 0 .497 -3.753c0 -.249 1.51 -2.772 1.818 -4.013l0 .001\" />",
        facebook: "<path d=\"M7 10v4h3v7h4v-7h3l1 -4h-4v-2a1 1 0 0 1 1 -1h3v-4h-3a5 5 0 0 0 -5 5v2h-3\" />",
        telegram: "<path d=\"M15 10l-4 4l6 6l4 -16l-18 7l4 2l2 6l3 -4\" />",
        // Agregados 30-ago para reemplazar emojis sueltos por íconos reales
        // (pedido explícito del usuario) -- mismo estilo Tabler que el resto.
        refresh: "<path d=\"M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4\" /><path d=\"M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4\" />",
        clock: "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /><path d=\"M12 7v5l3 3\" />",
        mic: "<path d=\"M9 2m0 3a3 3 0 0 1 3 -3h0a3 3 0 0 1 3 3v5a3 3 0 0 1 -3 3h0a3 3 0 0 1 -3 -3z\" /><path d=\"M5 10a7 7 0 0 0 14 0\" /><path d=\"M8 21l8 0\" /><path d=\"M12 17l0 4\" />",
        flag: "<path d=\"M5 21v-18\" /><path d=\"M5 4h12a1 1 0 0 1 .78 1.63l-3.9 4.37l3.9 4.37a1 1 0 0 1 -.78 1.63h-12\" />",
        help: "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /><path d=\"M12 17l0 .01\" /><path d=\"M12 13.5a1.5 1.5 0 0 1 1 -1.5a2.6 2.6 0 1 0 -3 -4\" />",
        eye: "<path d=\"M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0\" /><path d=\"M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6\" />",
        info: "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /><path d=\"M12 9h.01\" /><path d=\"M11 12h1v4h1\" />",
        volume: "<path d=\"M15 8a5 5 0 0 1 0 8\" /><path d=\"M17.7 5a9 9 0 0 1 0 14\" /><path d=\"M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5\" />",
        headphones: "<path d=\"M4 13m0 2a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-1a2 2 0 0 1 -2 -2z\" /><path d=\"M15 13m0 2a2 2 0 0 1 2 -2h1a2 2 0 0 1 2 2v3a2 2 0 0 1 -2 2h-1a2 2 0 0 1 -2 -2z\" /><path d=\"M4 15v-3a8 8 0 0 1 16 0v3\" />",
        disc: "<path d=\"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" /><path d=\"M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" />",
        circleCheck: "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /><path d=\"M9 12l2 2l4 -4\" />",
        circleX: "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /><path d=\"M10 10l4 4m0 -4l-4 4\" />",
        send: "<path d=\"M10 14l11 -11\" /><path d=\"M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5\" />",
        rocket: "<path d=\"M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3\" /><path d=\"M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3\" /><path d=\"M15 9m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" />",
        bell: "<path d=\"M10 5a2 2 0 0 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6\" /><path d=\"M9 17v1a3 3 0 0 0 6 0v-1\" />",
    };

    // Paleta de color -> {texto, fondo translucido, borde, glow} -- calcada de
    // las clases neon-* que ya usa la app (cyan/magenta/purple/orange/yellow).
    const COLORS = {
        cyan:    { text: '#22d3ee', bg: 'rgba(6,182,212,0.15)',  glow: 'rgba(0,243,255,0.35)' },
        magenta: { text: '#e879f9', bg: 'rgba(217,70,239,0.15)', glow: 'rgba(236,72,153,0.35)' },
        orange:  { text: '#fb923c', bg: 'rgba(249,115,22,0.15)', glow: 'rgba(251,146,60,0.35)' },
        purple:  { text: '#c084fc', bg: 'rgba(168,85,247,0.15)', glow: 'rgba(168,85,247,0.35)' },
        yellow:  { text: '#facc15', bg: 'rgba(234,179,8,0.15)',  glow: 'rgba(234,179,8,0.35)' },
        red:     { text: '#f87171', bg: 'rgba(239,68,68,0.15)',  glow: 'rgba(239,68,68,0.35)' },
        green:   { text: '#4ade80', bg: 'rgba(34,197,94,0.15)',  glow: 'rgba(34,197,94,0.35)' },
        gray:    { text: '#cbd5e1', bg: 'rgba(148,163,184,0.15)', glow: 'rgba(148,163,184,0.25)' }
    };

    function svg(name, opts) {
        opts = opts || {};
        const inner = PATHS[name];
        if (!inner) {
            console.warn('[MTRIcons] icono desconocido:', name);
            return '';
        }
        const size = opts.size || 24;
        const strokeWidth = opts.strokeWidth || 2;
        const cls = opts.className ? ` class="${opts.className}"` : '';
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${cls} aria-hidden="true">${inner}</svg>`;
    }

    // Insignia circular con relleno translucido + resplandor -- Opcion B,
    // la que eligio el usuario al comparar 3 estilos.
    function badge(name, opts) {
        opts = opts || {};
        const c = COLORS[opts.color] || COLORS.cyan;
        const badgeSize = opts.badgeSize || 44;
        const iconSize = opts.size || Math.round(badgeSize * 0.5);
        const extraStyle = opts.style || '';
        const iconHtml = svg(name, { size: iconSize, strokeWidth: opts.strokeWidth });
        return `<span class="mtr-icon-badge" style="display:inline-flex;align-items:center;justify-content:center;width:${badgeSize}px;height:${badgeSize}px;border-radius:50%;background:${c.bg};box-shadow:0 0 14px ${c.glow};color:${c.text};flex-shrink:0;${extraStyle}">${iconHtml}</span>`;
    }

    // Icono suelto coloreado, sin insignia -- para usar inline junto a texto
    // (encabezados de seccion, badges de texto, botones).
    function inline(name, opts) {
        opts = opts || {};
        const c = COLORS[opts.color] || COLORS.cyan;
        const size = opts.size || 18;
        const style = `color:${c.text};vertical-align:-3px;margin-right:6px;${opts.glow === false ? '' : `filter:drop-shadow(0 0 4px ${c.glow});`}${opts.style || ''}`;
        return `<span style="${style}">${svg(name, { size })}</span>`;
    }

    // Permite declarar iconos en HTML estatico sin tocar JS:
    //   <div data-mtr-icon="bolt" data-mtr-color="cyan"></div>          -> insignia
    //   <span data-mtr-icon="link" data-mtr-inline data-mtr-color="cyan"></span>  -> icono suelto coloreado
    //   <span data-mtr-icon="link" data-mtr-plain></span>  -> SVG puro, hereda color/tamaño del texto padre
    //     (para iconos dentro de botones con su propio fondo de color, donde
    //     el glow/color fijo de "inline" desentona con el texto blanco del botón)
    function initStaticIcons(root) {
        const scope = root || document;
        scope.querySelectorAll('[data-mtr-icon]').forEach(function (el) {
            const name = el.getAttribute('data-mtr-icon');
            const isPlain = el.hasAttribute('data-mtr-plain');
            const isInline = el.hasAttribute('data-mtr-inline');
            const size = el.getAttribute('data-mtr-size');
            const badgeSize = el.getAttribute('data-mtr-badge-size');
            if (isPlain) {
                const svgOpts = {};
                if (size) svgOpts.size = parseInt(size, 10);
                el.innerHTML = svg(name, svgOpts);
                el.removeAttribute('data-mtr-icon');
                return;
            }
            const color = el.getAttribute('data-mtr-color') || 'cyan';
            const opts = { color };
            if (size) opts.size = parseInt(size, 10);
            if (badgeSize) opts.badgeSize = parseInt(badgeSize, 10);
            el.innerHTML = isInline ? inline(name, opts) : badge(name, opts);
            el.removeAttribute('data-mtr-icon');
        });
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { initStaticIcons(); });
        } else {
            initStaticIcons();
        }
    }

    global.MTRIcons = { svg, badge, inline, initStaticIcons, COLORS, PATHS };
})(typeof window !== 'undefined' ? window : this);
