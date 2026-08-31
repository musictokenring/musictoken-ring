(function (global) {
    if (global.__MTR_APP_JS_LOADED__) {
        console.warn('app.js already loaded; skipping duplicate initialization.');
        return;
    }
    global.__MTR_APP_JS_LOADED__ = true;
    
    // DEFINIR selectSongForBattle INMEDIATAMENTE si no existe
    if (typeof global.selectSongForBattle === 'undefined' && typeof global.window !== 'undefined') {
        global.window.selectSongForBattle = global.window.selectSongForBattle || function(song) {
            console.warn('[app.js] selectSongForBattle placeholder llamado, esperando función real...');
            setTimeout(function() {
                if (typeof global.window.selectSongForBattle === 'function' && 
                    global.window.selectSongForBattle.toString().indexOf('placeholder') === -1) {
                    global.window.selectSongForBattle(song);
                } else {
                    console.error('[app.js] selectSongForBattle no disponible después de delay');
                }
            }, 200);
        };
    }

// =========================================
// APP.JS - MusicToken Ring
// Funciones auxiliares de búsqueda y audio
// (La lógica de juego está en game-engine.js)
// =========================================

// Log comentado para reducir ruido
// console.log('🥊 MusicToken Ring ready!');

// =========================================
// TOAST NOTIFICATION SYSTEM
// =========================================

// duration opcional: la mayoría de los toasts son avisos cortos y 3s
// (el default de siempre) alcanza de sobra. Pero para mensajes largos que
// el usuario realmente necesita leer con calma -- como el motivo del
// curador de género al rechazar una canción -- 3s no alcanza ni para
// terminar de leer la primera oración (reportado en vivo: "se desvaneció
// al instante"). Los llamados existentes sin este 3er argumento siguen
// exactamente igual que antes.
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    // CRÍTICO: el contenedor usaba un top fijo (top-20, 80px) que no
    // alcanzaba cuando el header crece (mobile con nombre de usuario largo,
    // 2 líneas -- ver fix de header mobile de esta misma sesión). Medido en
    // vivo: header a 94px de alto en mobile, toast arrancando a 80px -- 14px
    // de superposición real, tapando el inicio del mensaje. Se veía como si
    // el aviso "desapareciera rapidísimo" cuando en realidad nacía tapado.
    // Recalcular contra la altura REAL del header en cada toast, no un
    // número fijo, cubre cualquier alto (1 o 2 líneas, mobile o desktop).
    const headerEl = document.querySelector('header');
    if (headerEl) {
        const headerBottom = headerEl.getBoundingClientRect().bottom;
        container.style.top = Math.max(16, headerBottom + 8) + 'px';
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    // Click para cerrar antes de tiempo -- útil sobre todo en los toasts
    // largos con duration extendida, para no obligar a esperar los 12s
    // completos si ya se terminó de leer.
    toast.style.cursor = 'pointer';
    toast.title = 'Clic para cerrar';
    toast.addEventListener('click', () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// =========================================
// NAVEGACIÓN: scroll a la sección que el usuario acaba de pedir
// =========================================

// Reportado en vivo: al presionar un botón (elegir modo, abrir torneo,
// crear/unirse a sala, etc.) la sección pedida aparecía "muy arriba o muy
// abajo" -- el usuario tenía que scrollear a mano para encontrarla. Antes
// de esto solo `selectMode()` intentaba corregirlo, con una cuenta manual
// larga y encima solo en mobile (isMobileDevice()); el resto de botones no
// scrolleaba nada. Este helper es la versión única y genérica: centra el
// elemento en el espacio visible debajo del header sticky, en cualquier
// dispositivo. Si el elemento es más alto que el viewport, lo alinea justo
// debajo del header en vez de intentar centrarlo (no tiene sentido centrar
// algo que no entra en pantalla).
function scrollToSection(target, opts) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;
    opts = opts || {};
    const extraDelay = opts.delay || 0;

    setTimeout(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const headerEl = document.querySelector('header');
                const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 0;
                const rect = el.getBoundingClientRect();
                const currentScroll = window.pageYOffset || document.documentElement.scrollTop || 0;
                const absoluteTop = rect.top + currentScroll;
                const visibleViewport = window.innerHeight - headerHeight;
                const padding = 16;

                let targetScroll;
                if (rect.height <= visibleViewport) {
                    // Entra completo: centrarlo en el espacio visible debajo del header
                    targetScroll = absoluteTop - headerHeight - Math.max(padding, (visibleViewport - rect.height) / 2);
                } else {
                    // No entra completo: alinear su inicio justo debajo del header
                    targetScroll = absoluteTop - headerHeight - padding;
                }

                window.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
            });
        });
    }, extraDelay);
}
window.scrollToSection = scrollToSection;

// =========================================
// AUDIO PREVIEW MANAGEMENT
// =========================================

var currentAudio = null;
var dashboardRegion = 'latam';
var dashboardCarouselOffset = 0;
var dashboardGlowTimeout = null;
var dashboardDragInitialized = false;
const runtimeGlobal = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});

function readOwnBooleanFlag(obj, flagName) {
    try {
        if (!obj) return false;
        const descriptor = Object.getOwnPropertyDescriptor(obj, flagName);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return false;
        return descriptor.value === true;
    } catch (error) {
        console.warn(`No se pudo leer el flag ${flagName}. Se usa false por defecto.`, error);
        return false;
    }
}

var deezerStreamsEndpointAvailable = readOwnBooleanFlag(runtimeGlobal, 'MTR_ENABLE_DEEZER_STREAMS');
var deezerStreamsCircuitOpen = false;
function getDashboardRegionQueries() {
    const defaultQueries = { latam: 'latin', us: 'billboard', eu: 'europe top' };
    const externalQueries = runtimeGlobal && runtimeGlobal.MTR_DASHBOARD_REGION_QUERIES;
    if (externalQueries && typeof externalQueries === 'object') {
        const merged = { latam: defaultQueries.latam, us: defaultQueries.us, eu: defaultQueries.eu };
        if (externalQueries.latam) merged.latam = externalQueries.latam;
        if (externalQueries.us) merged.us = externalQueries.us;
        if (externalQueries.eu) merged.eu = externalQueries.eu;
        return merged;
    }
    return defaultQueries;
}

function isMetaMaskExtensionMissingError(reason) {
    const reasonMessage = reason && reason.message ? reason.message : '';
    const message = String(reasonMessage || reason || '').toLowerCase();
    return message.includes('metamask extension not found') || message.includes('failed to connect to metamask');
}

window.addEventListener('unhandledrejection', (event) => {
    if (!isMetaMaskExtensionMissingError(event.reason)) return;
    event.preventDefault();
    if (window.__mtrMetaMaskToastShown) return;
});

function togglePreview(url, button) {
    if (currentAudio && currentAudio.src === url) {
        if (currentAudio.paused) {
            currentAudio.play();
            button.textContent = '⏸ Pause';
        } else {
            currentAudio.pause();
            button.textContent = '▶ Preview';
            // Bug real reportado en vivo ("suena doble", "pause no
            // detiene"): holdBattleAudioSession() deja una segunda pista
            // sonando de fondo en volumen casi nulo (para desbloquear el
            // autoplay antes de la batalla real) que este botón nunca
            // pausaba -- quedaba sonando por debajo, mezclándose con la
            // próxima vista previa. pauseBattleAudioSession() la pausa sin
            // deshacer el desbloqueo ya logrado.
            if (window.GameEngine && typeof window.GameEngine.pauseBattleAudioSession === 'function') {
                window.GameEngine.pauseBattleAudioSession();
            }
        }
    } else {
        // Stop previous audio
        if (currentAudio) {
            currentAudio.pause();
            document.querySelectorAll('.btn-preview').forEach(btn => {
                btn.textContent = '▶ Preview';
            });
        }

        // Play new audio
        currentAudio = new Audio(url);
        currentAudio.play();
        if (window.GameEngine) {
            if (typeof window.GameEngine.holdBattleAudioSession === 'function') {
                window.GameEngine.holdBattleAudioSession(url);
            } else if (typeof window.GameEngine.primeBattleAudio === 'function') {
                window.GameEngine.primeBattleAudio(url);
            }
        }
        button.textContent = '⏸ Pause';

        currentAudio.onended = () => {
            button.textContent = '▶ Preview';
            if (window.GameEngine && typeof window.GameEngine.pauseBattleAudioSession === 'function') {
                window.GameEngine.pauseBattleAudioSession();
            }
        };
    }
}

function stopAllPreviews() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    document.querySelectorAll('.btn-preview').forEach(btn => {
        btn.textContent = '▶ Preview';
    });
    if (window.GameEngine && typeof window.GameEngine.pauseBattleAudioSession === 'function') {
        window.GameEngine.pauseBattleAudioSession();
    }
}

// =========================================
// DEEZER SEARCH (JSONP)
// =========================================

// Tamaño de pagina para busqueda de texto y para el chart de genero. 25 es el
// maximo practico de una sola llamada a /search o /chart de Deezer.
const DEEZER_PAGE_SIZE = 25;

/**
 * Muestra (o quita) el boton "Cargar más" debajo de los resultados.
 * receivedCount >= DEEZER_PAGE_SIZE es la señal de que probablemente hay mas
 * resultados disponibles (Deezer no manda un total confiable en /chart).
 */
function renderLoadMoreButton(resultsDiv, receivedCount, onClick) {
    const existing = document.getElementById('deezerLoadMoreBtn');
    if (existing) existing.remove();
    if (receivedCount < DEEZER_PAGE_SIZE) return;

    const btn = document.createElement('button');
    btn.id = 'deezerLoadMoreBtn';
    btn.type = 'button';
    btn.textContent = '⬇️ Cargar más canciones';
    btn.style.cssText = 'display:block; width:100%; margin-top:8px; padding:10px; text-align:center; ' +
        'color:#22D3EE; background:rgba(34,211,238,0.08); border:1px solid rgba(34,211,238,0.3); ' +
        'border-radius:8px; cursor:pointer;';
    btn.onclick = function () {
        btn.disabled = true;
        btn.textContent = 'Cargando…';
        onClick();
    };
    resultsDiv.appendChild(btn);
}

/**
 * Busca canciones por texto libre en Deezer (busqueda genérica o de un género
 * sin categoria propia en Deezer — ver deezerGenreId en tournament-genres.js).
 * offset > 0 agrega resultados al final en vez de reemplazar (paginación).
 */
function searchDeezer(query, resultsElementId = 'searchResults', offset = 0) {
    if (!query || !query.trim()) {
        showToast('Por favor ingresa un término de búsqueda', 'error');
        return;
    }

    const resultsDiv = document.getElementById(resultsElementId);
    if (!resultsDiv) {
        console.error('Results element not found:', resultsElementId);
        return;
    }

    if (offset === 0) {
        resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #9CA3AF;">🔍 Buscando...</p>';
    }

    // Create unique callback name
    const callbackName = `deezerCallback_${Date.now()}`;

    let timeoutId = null;

    // Create callback function
    window[callbackName] = function(data) {
        // Clean up
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        delete window[callbackName];
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) scriptEl.remove();

        const tracks = (data && data.data) || [];
        if (offset === 0 && tracks.length === 0) {
            resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #9CA3AF;">No se encontraron resultados</p>';
            return;
        }

        displaySearchResults(tracks, resultsDiv, offset > 0).then(() => {
            renderLoadMoreButton(resultsDiv, tracks.length, function () {
                searchDeezer(query, resultsElementId, offset + DEEZER_PAGE_SIZE);
            });
        });
    };

    // Create script tag for JSONP request
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${DEEZER_PAGE_SIZE}&index=${offset}&output=jsonp&callback=${callbackName}`;
    script.onerror = function() {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        delete window[callbackName];
        if (offset === 0) resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #EF4444;">❌ Error en la búsqueda</p>';
        showToast('Error al buscar', 'error');
    };

    document.head.appendChild(script);

    timeoutId = setTimeout(() => {
        delete window[callbackName];
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) scriptEl.remove();
        if (offset === 0) resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #EF4444;">⏱️ Tiempo de espera agotado</p>';
        showToast('La búsqueda tardó demasiado, intenta nuevamente', 'error');
    }, 8000);
}

/**
 * Trae el catalogo curado de un genero real de Deezer (/chart/:id/tracks) — mucho
 * mas grande que la busqueda de texto, y sin el sesgo/ruido de un keyword. Solo
 * aplica a los generos con deezerGenreId (ver backend/tournament-genres.js).
 * offset > 0 agrega resultados al final en vez de reemplazar (paginación).
 */
function searchDeezerChart(genreId, resultsElementId = 'searchResults', offset = 0) {
    const resultsDiv = document.getElementById(resultsElementId);
    if (!resultsDiv) {
        console.error('Results element not found:', resultsElementId);
        return;
    }

    if (offset === 0) {
        resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #9CA3AF;">🔍 Cargando catálogo del género...</p>';
    }

    const callbackName = `deezerChartCallback_${Date.now()}`;
    let timeoutId = null;

    window[callbackName] = function (data) {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        delete window[callbackName];
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) scriptEl.remove();

        const tracks = (data && data.data) || [];
        if (offset === 0 && tracks.length === 0) {
            resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #9CA3AF;">No se encontraron resultados</p>';
            return;
        }

        displaySearchResults(tracks, resultsDiv, offset > 0).then(() => {
            renderLoadMoreButton(resultsDiv, tracks.length, function () {
                searchDeezerChart(genreId, resultsElementId, offset + DEEZER_PAGE_SIZE);
            });
        });
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.deezer.com/chart/${genreId}/tracks?limit=${DEEZER_PAGE_SIZE}&index=${offset}&output=jsonp&callback=${callbackName}`;
    script.onerror = function () {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        delete window[callbackName];
        if (offset === 0) resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #EF4444;">❌ Error cargando el catálogo</p>';
        showToast('Error al cargar canciones del género', 'error');
    };

    document.head.appendChild(script);

    timeoutId = setTimeout(() => {
        delete window[callbackName];
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) scriptEl.remove();
        if (offset === 0) resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #EF4444;">⏱️ Tiempo de espera agotado</p>';
        showToast('La búsqueda tardó demasiado, intenta nuevamente', 'error');
    }, 8000);
}
window.searchDeezerChart = searchDeezerChart;

// =========================================
// DISPLAY SEARCH RESULTS
// =========================================

async function fetchTrackStreams(trackId) {
    if (!deezerStreamsEndpointAvailable || deezerStreamsCircuitOpen) {
        return { current: 0, avg24h: 0 };
    }

    deezerStreamsCircuitOpen = true;

    try {
        const response = await fetch(`https://api.deezer.com/v1/tracks/${trackId}/streams?interval=5m`);
        if (!response.ok) throw new Error('No stream endpoint');
        const data = await response.json();
        deezerStreamsCircuitOpen = false;
        return {
            current: Number(data.current_streams || 0),
            avg24h: Number(data.avg_24h || 0)
        };
    } catch (error) {
        deezerStreamsEndpointAvailable = false;
        if (error instanceof TypeError) {
            console.warn('El endpoint de streams de Deezer no está disponible en navegador (CORS). Se desactiva para evitar errores repetidos.');
        } else {
            console.warn('Se desactiva endpoint de streams de Deezer tras error de red/respuesta:', error);
        }
        deezerStreamsCircuitOpen = false;
        return { current: 0, avg24h: 0 };
    }
}

function getTrackIndicator(streams, avg24h) {
    if (!avg24h || !streams) return '';
    if (streams > avg24h * 1.05) return '<span class="stream-indicator up">▲</span>';
    if (streams < avg24h * 0.95) return '<span class="stream-indicator down">▼</span>';
    return '<span class="stream-indicator neutral">•</span>';
}

async function displaySearchResults(tracks, resultsDiv, append = false) {
    const enrichedTracks = await Promise.all(tracks.map(async (track) => {
        const streamData = await fetchTrackStreams(track.id);
        return { track, streamData };
    }));

    let html = '';
    enrichedTracks.forEach(({ track, streamData }) => {
        const trackData = {
            id: track.id,
            name: track.title,
            artist: track.artist.name,
            image: track.album.cover_big,
            preview: track.preview,
            current_streams: streamData.current,
            avg_24h: streamData.avg24h
        };
        const indicator = getTrackIndicator(streamData.current, streamData.avg24h);

        // FORMATO ROBUSTO - llamar directamente a window.selectSongForBattle si está disponible
        var trackJson = JSON.stringify(trackData).replace(/'/g, "&#39;");
        html += `
            <div class="track-item" onclick='(function(t){if(window.selectSongForBattle){window.selectSongForBattle(t);}else if(typeof handleTrackSelect==="function"){handleTrackSelect(t);}else{console.error("No handler");}})(${trackJson})'>
                <img src="${track.album.cover_medium}" alt="${track.title}">
                <div class="track-info">
                    <div class="track-name">${track.title}</div>
                    <div class="track-artist">${track.artist.name} ${indicator}</div>
                </div>
                ${track.preview ? `
                    <button class="btn-preview" onclick="event.stopPropagation(); togglePreview('${track.preview}', this)">
                        ▶ Preview
                    </button>
                ` : '<span style="color:#6B7280; font-size:12px; padding: 12px;">Sin preview</span>'}
            </div>
        `;
    });

    if (append) {
        // Quitamos el boton "Cargar más" antes de agregar la nueva tanda; se
        // vuelve a crear en renderLoadMoreButton() con el offset actualizado.
        const existingLoadMore = document.getElementById('deezerLoadMoreBtn');
        if (existingLoadMore) existingLoadMore.remove();
        resultsDiv.insertAdjacentHTML('beforeend', html);
    } else {
        resultsDiv.innerHTML = html;
    }
}

function formatDeltaArrow(current, avg24h) {
    if (!avg24h || !current) return '<span class="stream-delta neutral">• N/D</span>';
    const delta = ((current - avg24h) / avg24h) * 100;
    if (delta >= 0) return `<span class="stream-delta up">▲ ${delta.toFixed(1)}%</span>`;
    return `<span class="stream-delta down">▼ ${Math.abs(delta).toFixed(1)}%</span>`;
}

function formatDashboardStat(track, streamData, totalRank) {
    if (streamData && streamData.current && streamData.avg24h) {
        return formatDeltaArrow(streamData.current, streamData.avg24h);
    }

    const rank = Number((track && track.rank) || 0);
    if (rank > 0 && totalRank > 0) {
        const rankShare = (rank / totalRank) * 100;
        return `<span class="stream-delta neutral">• ${rankShare.toFixed(1)}% del top</span>`;
    }

    return '<span class="stream-delta neutral">• N/D</span>';
}

function getFallbackDashboardTracks(region) {
    const fallbackByRegion = {
        latam: [
            { title: 'Luna', artist: { name: 'Feid' }, album: { cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/9f4c9025e2f4f4be85a8d0f95f3bc5fe/250x250-000000-80-0-0.jpg' }, rank: 1000 },
            { title: 'Si Antes Te Hubiera Conocido', artist: { name: 'KAROL G' }, album: { cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/4aa4b9f4674f7f9f7428962456f31cc7/250x250-000000-80-0-0.jpg' }, rank: 940 },
            { title: 'Perro Negro', artist: { name: 'Bad Bunny' }, album: { cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/236f9df9f6f95cc8c6f0707dbe6839df/250x250-000000-80-0-0.jpg' }, rank: 900 }
        ],
        us: [
            { title: 'Espresso', artist: { name: 'Sabrina Carpenter' }, album: { cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/94bfaf6f3b278ba8e56ef8fca0ca65a4/250x250-000000-80-0-0.jpg' }, rank: 1000 },
            { title: 'Lose Control', artist: { name: 'Teddy Swims' }, album: { cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/c025cd9e3f0980d7f33173f66c66fdfd/250x250-000000-80-0-0.jpg' }, rank: 960 },
            { title: 'Beautiful Things', artist: { name: 'Benson Boone' }, album: { cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/4ff4d2e2e89ae5fd3df5e6eabf78f8f6/250x250-000000-80-0-0.jpg' }, rank: 920 }
        ],
        eu: [
            { title: "Stumblin' In", artist: { name: 'Cyril' }, album: { cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/3f4b8cf4be2f16ebf3d6f8cfad8aa7c1/250x250-000000-80-0-0.jpg' }, rank: 1000 },
            { title: 'Mwaki', artist: { name: 'Zerb' }, album: { cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/cc8f20c021f39d8444ec4f7f6d1d6e57/250x250-000000-80-0-0.jpg' }, rank: 950 },
            { title: 'Texas Hold ’Em', artist: { name: 'Beyoncé' }, album: { cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/c5dfcb2f5a13f5327dd58476fdd0f9ed/250x250-000000-80-0-0.jpg' }, rank: 910 }
        ]
    };

    return fallbackByRegion[region] || fallbackByRegion.latam;
}

function renderDashboardTracks(list, tracksWithStream) {
    const totalRank = tracksWithStream.reduce((sum, item) => sum + Number(((item && item.track) && item.track.rank) || 0), 0);

    list.innerHTML = tracksWithStream.map(({ track, streamData }) => {
        const album = (track && track.album) || {};
        const artist = (track && track.artist) || {};
        const cover = album.cover_medium || '';
        const title = (track && track.title) || 'Sin título';
        const artistName = artist.name || 'Artista desconocido';

        return `
            <article class="stream-card">
                <img src="${cover}" alt="${title}">
                <div class="stream-card-info">
                    <strong>${title}</strong>
                    <span>${artistName}</span>
                    ${formatDashboardStat(track, streamData, totalRank)}
                </div>
            </article>
        `;
    }).join('');

    updateDashboardCarousel();
}

async function loadDashboardRegion(region) {
    dashboardRegion = region;
    dashboardCarouselOffset = 0;
    const list = document.getElementById('streamDashboardTrackList');
    if (!list) return;

    list.innerHTML = '<p style="padding:16px; color:#9CA3AF;">Cargando top tracks...</p>';
    const queries = getDashboardRegionQueries();
    const query = queries[region] || 'music';

    const callbackName = `dashboardCallback_${Date.now()}`;
    let completed = false;
    const timeoutId = setTimeout(() => {
        if (completed) return;
        completed = true;
        delete window[callbackName];
        renderDashboardTracks(list, getFallbackDashboardTracks(region).map((track) => ({ track, streamData: null })));
    }, 7000);

    window[callbackName] = async function(data) {
        if (completed) return;
        completed = true;
        clearTimeout(timeoutId);
        delete window[callbackName];
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) scriptEl.remove();

        const tracks = ((data && data.data) || []).slice(0, 8);
        if (!tracks.length) {
            renderDashboardTracks(list, getFallbackDashboardTracks(region).map((track) => ({ track, streamData: null })));
            return;
        }

        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

        renderDashboardTracks(list, tracksWithStream);
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=8&output=jsonp&callback=${callbackName}`;
    script.onerror = () => {
        if (completed) return;
        completed = true;
        clearTimeout(timeoutId);
        delete window[callbackName];
        renderDashboardTracks(list, getFallbackDashboardTracks(region).map((track) => ({ track, streamData: null })));
    };
    document.head.appendChild(script);
}

function updateDashboardCarousel() {
    const track = document.getElementById('streamDashboardTrackList');
    if (!track) return;
    const scrollStep = Math.max(220, Math.floor(track.clientWidth * 0.55));
    track.scrollTo({ left: dashboardCarouselOffset * scrollStep, behavior: 'smooth' });
    triggerDashboardGlow();
}

function moveDashboardCarousel(direction) {
    dashboardCarouselOffset = Math.max(0, dashboardCarouselOffset + direction);
    updateDashboardCarousel();
}

function triggerDashboardGlow() {
    const wrap = document.querySelector('.stream-carousel-wrap');
    if (!wrap) return;
    wrap.classList.remove('glow-active');
    void wrap.offsetWidth;
    wrap.classList.add('glow-active');

    if (dashboardGlowTimeout) clearTimeout(dashboardGlowTimeout);
    dashboardGlowTimeout = setTimeout(() => {
        wrap.classList.remove('glow-active');
    }, 900);
}

function initDashboardDragScroll() {
    if (dashboardDragInitialized) return;
    const track = document.getElementById('streamDashboardTrackList');
    if (!track) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    track.addEventListener('pointerdown', (e) => {
        isDown = true;
        startX = e.clientX;
        scrollLeft = track.scrollLeft;
        track.setPointerCapture(e.pointerId);
    });

    track.addEventListener('pointermove', (e) => {
        if (!isDown) return;
        const walk = (e.clientX - startX) * 1.2;
        track.scrollLeft = scrollLeft - walk;
        triggerDashboardGlow();
    });

    const stopDrag = () => {
        isDown = false;
    };

    track.addEventListener('pointerup', stopDrag);
    track.addEventListener('pointercancel', stopDrag);
    track.addEventListener('pointerleave', stopDrag);
    track.addEventListener('scroll', triggerDashboardGlow, { passive: true });

    dashboardDragInitialized = true;
}

function setDashboardRegion(region) {
    document.querySelectorAll('.stream-region-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.region === region);
    });
    loadDashboardRegion(region);
}

// =========================================
// TRACK SELECTION HANDLER
// =========================================

function handleTrackSelect(track) {
    // Stop any playing preview
    stopAllPreviews();
    
    console.log('[handleTrackSelect] Llamado con:', track);
    
    // FUNCIÓN MEJORADA - Buscar de múltiples formas con reintentos
    var selectFn = null;
    var attempts = 0;
    var maxAttempts = 3;
    
    function trySelect() {
        attempts++;
        
        // Intentar 1: window.selectSongForBattle
        if (typeof window !== 'undefined' && typeof window.selectSongForBattle === 'function') {
            var fn = window.selectSongForBattle;
            // Verificar que no sea el placeholder
            if (fn.toString().indexOf('placeholder') === -1) {
                try {
                    console.log('[handleTrackSelect] ✅ Usando window.selectSongForBattle');
                    fn(track);
                    return true;
                } catch (e) {
                    console.error('[handleTrackSelect] Error llamando selectSongForBattle:', e);
                }
            }
        }
        
        // Intentar 2: selectSongForBattle global
        if (typeof selectSongForBattle === 'function') {
            try {
                console.log('[handleTrackSelect] ✅ Usando selectSongForBattle global');
                selectSongForBattle(track);
                return true;
            } catch (e) {
                console.error('[handleTrackSelect] Error:', e);
            }
        }
        
        // Intentar 3: selectTrack (fallback original)
        if (typeof selectTrack === 'function') {
            try {
                console.log('[handleTrackSelect] ✅ Usando selectTrack (fallback)');
                selectTrack(track);
                return true;
            } catch (e) {
                console.error('[handleTrackSelect] Error:', e);
            }
        }
        
        // Si no funcionó y aún hay intentos, esperar y reintentar
        if (attempts < maxAttempts) {
            console.warn('[handleTrackSelect] Intento', attempts, 'fallido, reintentando en 150ms...');
            setTimeout(trySelect, 150);
            return false;
        }
        
        // Si todos los intentos fallaron
        console.error('[handleTrackSelect] ❌ NO se encontró handler después de', maxAttempts, 'intentos');
        console.error('[handleTrackSelect] window.selectSongForBattle:', typeof window !== 'undefined' ? typeof window.selectSongForBattle : 'window undefined');
        console.error('[handleTrackSelect] selectSongForBattle:', typeof selectSongForBattle);
        console.error('[handleTrackSelect] selectTrack:', typeof selectTrack);
        return false;
    }
    
    // Iniciar intentos
    if (!trySelect()) {
        // Si falló inmediatamente, mostrar mensaje al usuario
        if (typeof showToast === 'function') {
            showToast('Error: Sistema no completamente cargado. Recarga la página (Ctrl+Shift+R)', 'error');
        }
    }
}

// =========================================
// EVENT LISTENERS
// =========================================

var dashboardBootstrapDone = false;

function bootstrapAppSearchAndDashboard() {
    if (dashboardBootstrapDone) return;
    dashboardBootstrapDone = true;

    const searchInput = document.getElementById('songSearch');
    if (searchInput && !searchInput.dataset.boundEnter) {
        searchInput.dataset.boundEnter = '1';
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value;
                if (typeof searchSong === 'function') {
                    searchSong();
                } else {
                    searchDeezer(query);
                }
            }
        });
    }

    if (!window.MTR_INLINE_TOP_STREAMS_ACTIVE) {
        loadDashboardRegion(dashboardRegion);
        initDashboardDragScroll();
        setInterval(() => loadDashboardRegion(dashboardRegion), 300000);
    }
    console.log('🎵 Search system initialized!');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapAppSearchAndDashboard);
} else {
    bootstrapAppSearchAndDashboard();
}

window.addEventListener('pageshow', () => {
    const dashboardList = document.getElementById('streamDashboardTrackList');
    if (dashboardList && dashboardList.children.length === 0) {
        loadDashboardRegion(dashboardRegion);
    }
});

// =========================================
// EXPORT FOR GLOBAL ACCESS
// =========================================

window.showToast = showToast;
window.togglePreview = togglePreview;
window.stopAllPreviews = stopAllPreviews;
window.searchDeezer = searchDeezer;
window.displaySearchResults = displaySearchResults;
// EXPONER handleTrackSelect GLOBALMENTE
window.handleTrackSelect = handleTrackSelect;

// Asegurar que esté disponible inmediatamente
if (typeof handleTrackSelect === 'function') {
    console.log('[app.js] ✅ handleTrackSelect expuesto globalmente');
} else {
    console.error('[app.js] ❌ ERROR: handleTrackSelect no se pudo exponer');
}

// Fallbacks: keep mode buttons functional even if inline scripts fail to parse/load.
if (typeof window.selectMode !== 'function') {
    window.selectMode = function selectModeFallback(mode) {
        const modeSelector = document.getElementById('modeSelector');
        const songSelection = document.getElementById('songSelection');
        const modeTitle = document.getElementById('modeTitle');
        const titles = {
            quick: '⚔️ Modo Rápido',
            private: '🎪 Sala Privada',
            tournament: '🏆 Torneo',
            practice: '🎯 Práctica'
        };

        if (modeSelector) modeSelector.classList.add('hidden');
        if (songSelection) songSelection.classList.remove('hidden');
        if (modeTitle) modeTitle.textContent = titles[mode] || '🎮 Seleccionar Modo';
        window.currentMode = mode || null;
    };
}

if (typeof window.backToModes !== 'function') {
    window.backToModes = function backToModesFallback() {
        const modeSelector = document.getElementById('modeSelector');
        const songSelection = document.getElementById('songSelection');
        if (songSelection) songSelection.classList.add('hidden');
        if (modeSelector) modeSelector.classList.remove('hidden');
    };
}

if (!window.MTR_INLINE_TOP_STREAMS_ACTIVE) {
    window.setDashboardRegion = setDashboardRegion;
    window.moveDashboardCarousel = moveDashboardCarousel;
}

// =========================================
// SONIDO DE INTERACCIÓN (UI click)
// Pedido en vivo: darle "adicción" táctil a la app -- un sonido corto de
// selección en cada botón, como en un juego. Sintetizado con Web Audio
// API (sin archivo de audio que cargar/alojar): un "blip" ascendente de
// dos tonos, ~100ms, volumen bajo. Se crea/reanuda el AudioContext
// siempre DENTRO del propio handler de click (un gesto real del
// usuario), así nunca choca con las políticas de autoplay de móvil que
// ya resuelve el sistema de audio de las batallas (ver game-engine.js,
// ensureUserAudio/unlockAudioFromGesture) -- son sistemas totalmente
// separados a propósito, este no reutiliza el <audio> de las canciones.
(function () {
    var ctx = null;
    function getCtx() {
        if (ctx) return ctx;
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        return ctx;
    }

    function playUiClick() {
        try {
            var audioCtx = getCtx();
            if (!audioCtx) return;
            if (audioCtx.state === 'suspended') audioCtx.resume();
            var t = audioCtx.currentTime;

            // Tono principal: blip ascendente rápido.
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(720, t);
            osc.frequency.exponentialRampToValueAtTime(1180, t + 0.045);
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.16, t + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(t);
            osc.stop(t + 0.1);

            // Segundo tono, una quinta arriba y más suave: le da el
            // "brillo" de campanita en vez de sonar como un simple beep.
            var osc2 = audioCtx.createOscillator();
            var gain2 = audioCtx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(1080, t + 0.01);
            osc2.frequency.exponentialRampToValueAtTime(1760, t + 0.05);
            gain2.gain.setValueAtTime(0.0001, t + 0.01);
            gain2.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
            gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
            osc2.connect(gain2).connect(audioCtx.destination);
            osc2.start(t + 0.01);
            osc2.stop(t + 0.12);
        } catch (_e) { /* nunca debe romper un click real por esto */ }
    }
    window.playUiClick = playUiClick;

    // Delegado en fase de CAPTURA (no burbuja): así suena SIEMPRE, incluso
    // en botones que llaman e.stopPropagation()/stopImmediatePropagation()
    // en su propio handler (ej. el botón de Desafío Social) -- captura
    // corre antes de que esos handlers tengan oportunidad de cortar la
    // propagación. Selector amplio a propósito: cubre los <button> de
    // siempre y las tarjetas clickeables que son <div>/<article> con
    // cursor-pointer (modo de juego, tarjetas de streams, etc.) sin tener
    // que tocar cada una una por una.
    document.addEventListener('click', function (ev) {
        var el = ev.target && ev.target.closest
            ? ev.target.closest('button, [role="button"], .cursor-pointer, .stream-card, .mtr2-navitem, .mtr2-mode, .mtr2-cta')
            : null;
        if (!el || el.disabled) return;
        playUiClick();
    }, true);
})();

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
