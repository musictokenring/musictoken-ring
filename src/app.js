(function (global) {
    if (global.__MTR_APP_JS_LOADED__) {
        console.warn('app.js already loaded; skipping duplicate initialization.');
        return;
    }
    global.__MTR_APP_JS_LOADED__ = true;

// =========================================
// APP.JS - MusicToken Ring
// Funciones auxiliares de búsqueda y audio
// (La lógica de juego está en game-engine.js)
// =========================================

console.log('🥊 MusicToken Ring ready!');

// =========================================
// TOAST NOTIFICATION SYSTEM
// =========================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

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
    if (!isMetaMaskExtensionMissingError(event.reason)) {
        return;
    }

    event.preventDefault();
    console.warn('MetaMask no está disponible en este navegador.');
    showToast('MetaMask no está disponible. Instala la extensión para conectar tu wallet.', 'error');
});

function togglePreview(url, button) {
    if (currentAudio && currentAudio.src === url) {
        if (currentAudio.paused) {
            currentAudio.play();
            button.textContent = '⏸ Pause';
        } else {
            currentAudio.pause();
            button.textContent = '▶ Preview';
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
        button.textContent = '⏸ Pause';
        
        currentAudio.onended = () => {
            button.textContent = '▶ Preview';
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
}

// =========================================
// DEEZER SEARCH (JSONP)
// =========================================

function searchDeezer(query, resultsElementId = 'searchResults') {
    if (!query || !query.trim()) {
        showToast('Por favor ingresa un término de búsqueda', 'error');
        return;
    }
    
    const resultsDiv = document.getElementById(resultsElementId);
    if (!resultsDiv) {
        console.error('Results element not found:', resultsElementId);
        return;
    }
    
    resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #9CA3AF;">🔍 Buscando...</p>';
    
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
        
        if (!data.data || data.data.length === 0) {
            resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #9CA3AF;">No se encontraron resultados</p>';
            return;
        }
        
        var logFn = window.__originalLog || console.log;
        logFn('[searchDeezer] ✅ Datos recibidos, llamando displaySearchResults...');
        logFn('[searchDeezer] Tracks recibidos:', data.data ? data.data.length : 0);
        logFn('[searchDeezer] resultsDiv:', resultsDiv);
        logFn('[searchDeezer] displaySearchResults:', typeof displaySearchResults);
        logFn('[searchDeezer] window.displaySearchResults:', typeof window.displaySearchResults);
        
        if (typeof displaySearchResults === 'function') {
            displaySearchResults(data.data, resultsDiv);
        } else if (typeof window.displaySearchResults === 'function') {
            window.displaySearchResults(data.data, resultsDiv);
        } else {
            console.error('[searchDeezer] ❌ displaySearchResults NO DISPONIBLE');
        }
    };
    
    // Create script tag for JSONP request
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=6&output=jsonp&callback=${callbackName}`;
    script.onerror = function() {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        delete window[callbackName];
        resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #EF4444;">❌ Error en la búsqueda</p>';
        showToast('Error al buscar', 'error');
    };
    
    document.head.appendChild(script);

    timeoutId = setTimeout(() => {
        delete window[callbackName];
        const scriptEl = document.getElementById(callbackName);
        if (scriptEl) scriptEl.remove();
        resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #EF4444;">⏱️ Tiempo de espera agotado</p>';
        showToast('La búsqueda tardó demasiado, intenta nuevamente', 'error');
    }, 8000);
}

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

async function displaySearchResults(tracks, resultsDiv) {
    var logFn = window.__originalLog || console.log;
    var errorFn = console.error;
    
    logFn('[displaySearchResults] ✅✅✅ FUNCIÓN LLAMADA');
    logFn('[displaySearchResults] Tracks recibidos:', tracks ? tracks.length : 0);
    logFn('[displaySearchResults] resultsDiv:', resultsDiv);
    logFn('[displaySearchResults] resultsDiv.id:', resultsDiv ? resultsDiv.id : 'N/A');
    
    if (!tracks || tracks.length === 0) {
        errorFn('[displaySearchResults] ❌ No hay tracks para mostrar');
        return;
    }
    
    if (!resultsDiv) {
        errorFn('[displaySearchResults] ❌ resultsDiv no está disponible');
        return;
    }
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

        // Usar data attribute para almacenar trackData
        html += `
            <div class="track-item" data-track-data='${JSON.stringify(trackData).replace(/'/g, "&#39;")}'>
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

    // Insertar HTML primero
    logFn('[displaySearchResults] Insertando HTML...');
    resultsDiv.innerHTML = html;
    logFn('[displaySearchResults] ✅ HTML insertado');
    
    // DESPUÉS de insertar, agregar event listeners a todos los tracks
    // Función para agregar listeners
    function attachTrackListeners() {
        const trackItems = resultsDiv.querySelectorAll('.track-item');
        logFn('[displaySearchResults] 🔍 Buscando tracks con selector .track-item...');
        logFn('[displaySearchResults] Tracks encontrados:', trackItems.length);
        
        // Verificar también con otros selectores
        var allDivs = resultsDiv.querySelectorAll('div');
        logFn('[displaySearchResults] Total divs en resultsDiv:', allDivs.length);
        
        if (trackItems.length === 0) {
            // Intentar encontrar tracks de otra manera
            var trackItemsAlt = resultsDiv.querySelectorAll('[data-track-data]');
            logFn('[displaySearchResults] Tracks con data-track-data:', trackItemsAlt.length);
            
            if (trackItemsAlt.length === 0) {
                logFn('[displaySearchResults] ⚠️ No se encontraron tracks, reintentando en 100ms...');
                setTimeout(attachTrackListeners, 100);
                return;
            } else {
                // Usar los tracks encontrados con el selector alternativo
                trackItems = trackItemsAlt;
            }
        }
        
        if (trackItems.length === 0) {
            logFn('[displaySearchResults] ⚠️ No se encontraron tracks, reintentando en 100ms...');
            setTimeout(attachTrackListeners, 100);
            return;
        }
        
        trackItems.forEach(function(trackElement, index) {
            // Remover listeners anteriores si existen
            var newElement = trackElement.cloneNode(true);
            trackElement.parentNode.replaceChild(newElement, trackElement);
            trackElement = newElement;
            
            // Agregar listener robusto
            trackElement.addEventListener('click', function(e) {
                logFn('[displaySearchResults] ✅✅✅ CLICK EN TRACK #' + index + ' DETECTADO');
                logFn('[displaySearchResults] Event:', e);
                logFn('[displaySearchResults] Target:', e.target);
                logFn('[displaySearchResults] CurrentTarget:', e.currentTarget);
                
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                const trackDataAttr = this.getAttribute('data-track-data');
                logFn('[displaySearchResults] trackDataAttr:', trackDataAttr ? 'presente (' + trackDataAttr.substring(0, 50) + '...)' : 'ausente');
                
                if (trackDataAttr) {
                    try {
                        const trackData = JSON.parse(trackDataAttr);
                        logFn('[displaySearchResults] ✅ trackData parseado:', trackData);
                        logFn('[displaySearchResults] window.handleTrackSelect:', typeof window.handleTrackSelect);
                        logFn('[displaySearchResults] handleTrackSelect:', typeof handleTrackSelect);
                        
                        if (typeof window.handleTrackSelect === 'function') {
                            logFn('[displaySearchResults] ✅ Llamando window.handleTrackSelect...');
                            try {
                                window.handleTrackSelect(trackData);
                                logFn('[displaySearchResults] ✅ window.handleTrackSelect ejecutado');
                            } catch(err) {
                                errorFn('[displaySearchResults] ❌ ERROR al ejecutar window.handleTrackSelect:', err);
                            }
                        } else if (typeof handleTrackSelect === 'function') {
                            logFn('[displaySearchResults] ✅ Llamando handleTrackSelect...');
                            try {
                                handleTrackSelect(trackData);
                                logFn('[displaySearchResults] ✅ handleTrackSelect ejecutado');
                            } catch(err) {
                                errorFn('[displaySearchResults] ❌ ERROR al ejecutar handleTrackSelect:', err);
                            }
                        } else {
                            errorFn('[displaySearchResults] ❌❌❌ handleTrackSelect NO DISPONIBLE');
                            errorFn('[displaySearchResults] window.handleTrackSelect:', typeof window.handleTrackSelect);
                            errorFn('[displaySearchResults] handleTrackSelect:', typeof handleTrackSelect);
                        }
                    } catch(err) {
                        errorFn('[displaySearchResults] ❌ Error al parsear trackData:', err);
                        errorFn('[displaySearchResults] trackDataAttr completo:', trackDataAttr);
                    }
                } else {
                    errorFn('[displaySearchResults] ❌ data-track-data no encontrado en elemento');
                    errorFn('[displaySearchResults] Elemento:', this);
                    errorFn('[displaySearchResults] Atributos:', Array.from(this.attributes).map(a => a.name + '=' + a.value));
                }
            }, true); // Fase de captura
            
            // También agregar onclick como fallback
            trackElement.onclick = function(e) {
                logFn('[displaySearchResults] ✅ CLICK (onclick fallback) en track #' + index);
                e.preventDefault();
                e.stopPropagation();
                const trackDataAttr = this.getAttribute('data-track-data');
                if (trackDataAttr) {
                    try {
                        const trackData = JSON.parse(trackDataAttr);
                        if (typeof window.handleTrackSelect === 'function') {
                            window.handleTrackSelect(trackData);
                        }
                    } catch(err) {
                        errorFn('[displaySearchResults] Error en onclick fallback:', err);
                    }
                }
            };
        });
        
        logFn('[displaySearchResults] ✅✅✅ Event listeners agregados a', trackItems.length, 'tracks');
        
        // Guardar referencia para diagnóstico
        window.__tracksWithListeners = trackItems.length;
    }
    
    // Intentar inmediatamente y con delays
    attachTrackListeners();
    setTimeout(attachTrackListeners, 50);
    setTimeout(attachTrackListeners, 200);
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
    // Usar originalLog directamente para evitar limitador
    var logFn = window.__originalLog || console.log;
    var errorFn = console.error;
    
    logFn('[handleTrackSelect] ✅✅✅ FUNCIÓN LLAMADA CON:', track);
    logFn('[handleTrackSelect] currentMode:', window.currentMode);
    
    // Stop any playing preview - FORZADO
    if (typeof stopAllPreviews === 'function') {
        stopAllPreviews();
    }
    if (typeof window.stopAllPreviews === 'function') {
        window.stopAllPreviews();
    }
    
    // También detener audio directamente como fallback
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
        logFn('[handleTrackSelect] Audio detenido (currentAudio)');
    }
    
    // Detener todos los elementos audio del DOM
    var audioElements = document.querySelectorAll('audio');
    logFn('[handleTrackSelect] Elementos audio encontrados:', audioElements.length);
    audioElements.forEach(function(audio, index) {
        try {
            if (!audio.paused) {
                audio.pause();
                logFn('[handleTrackSelect] Audio', index, 'pausado');
            }
            audio.currentTime = 0;
        } catch(e) {
            errorFn('[handleTrackSelect] Error al detener audio', index, ':', e);
        }
    });
    
    // Call the selection function if it exists
    logFn('[handleTrackSelect] Verificando selectSongForBattle...');
    logFn('[handleTrackSelect] window.selectSongForBattle:', typeof window.selectSongForBattle);
    logFn('[handleTrackSelect] selectSongForBattle:', typeof selectSongForBattle);
    
    if (typeof window.selectSongForBattle === 'function') {
        logFn('[handleTrackSelect] ✅ Llamando window.selectSongForBattle...');
        try {
            window.selectSongForBattle(track);
            logFn('[handleTrackSelect] ✅ window.selectSongForBattle ejecutado sin errores');
        } catch(e) {
            errorFn('[handleTrackSelect] ❌ ERROR al ejecutar window.selectSongForBattle:', e);
        }
    } else if (typeof selectSongForBattle === 'function') {
        logFn('[handleTrackSelect] ✅ Llamando selectSongForBattle...');
        try {
            selectSongForBattle(track);
            logFn('[handleTrackSelect] ✅ selectSongForBattle ejecutado sin errores');
        } catch(e) {
            errorFn('[handleTrackSelect] ❌ ERROR al ejecutar selectSongForBattle:', e);
        }
    } else if (typeof selectTrack === 'function') {
        logFn('[handleTrackSelect] Llamando selectTrack...');
        selectTrack(track);
    } else {
        errorFn('[handleTrackSelect] ❌❌❌ NO HAY HANDLER DISPONIBLE');
        errorFn('[handleTrackSelect] window.selectSongForBattle:', typeof window.selectSongForBattle);
        errorFn('[handleTrackSelect] selectSongForBattle:', typeof selectSongForBattle);
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
window.handleTrackSelect = handleTrackSelect;

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

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
