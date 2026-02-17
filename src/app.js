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

let currentAudio = null;
let dashboardRegion = 'latam';
let dashboardCarouselOffset = 0;
let dashboardGlowTimeout = null;
let dashboardDragInitialized = false;
 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz

 codex/find-reason-for-0%-songs-statistic-7dg0q0

 codex/find-reason-for-0%-songs-statistic-09svhr

 codex/find-reason-for-0%-songs-statistic-osd0jc

 codex/find-reason-for-0%-songs-statistic-7i3nq7

 codex/find-reason-for-0%-songs-statistic-9amkhv

 codex/find-reason-for-0%-songs-statistic-so425n
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2 feature/wall-street-v2
 feature/wall-street-v2
const runtimeGlobal = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});

function readOwnBooleanFlag(obj, flagName) {
    try {
        if (!obj) return false;
        const descriptor = Object.getOwnPropertyDescriptor(obj, flagName);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return false;
        return descriptor.value === true;
    } catch (error) {
        console.warn(`No se pudo leer el flag ${flagName}. Se usa false por defecto.`, error);
 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz

 codex/find-reason-for-0%-songs-statistic-7dg0q0

 codex/find-reason-for-0%-songs-statistic-09svhr

 codex/find-reason-for-0%-songs-statistic-osd0jc

 codex/find-reason-for-0%-songs-statistic-7i3nq7

 codex/find-reason-for-0%-songs-statistic-9amkhv


 codex/find-reason-for-0%-songs-statistic-aklz7k
const runtimeGlobal = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});

function readBooleanFeatureFlag(flagName) {
    try {
        if (!runtimeGlobal || !(flagName in runtimeGlobal)) return false;
        return runtimeGlobal[flagName] === true;
    } catch (error) {
        console.warn(`No se pudo leer feature flag ${flagName}. Se usa valor por defecto en false.`, error);
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
        return false;
    }
}

 codex/find-reason-for-0%-songs-statistic-usqut1
let deezerStreamsEndpointAvailable = readOwnBooleanFlag(runtimeGlobal, 'MTR_ENABLE_DEEZER_STREAMS');
let deezerStreamsCircuitOpen = false;
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
 codex/find-reason-for-0%-songs-statistic-ho6y47
let deezerStreamsEndpointAvailable = readOwnBooleanFlag(runtimeGlobal, 'MTR_ENABLE_DEEZER_STREAMS');
let deezerStreamsCircuitOpen = false;
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

 codex/find-reason-for-0%-songs-statistic-kq346f
let deezerStreamsEndpointAvailable = readOwnBooleanFlag(runtimeGlobal, 'MTR_ENABLE_DEEZER_STREAMS');
let deezerStreamsCircuitOpen = false;
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

 codex/find-reason-for-0%-songs-statistic-n3env6
let deezerStreamsEndpointAvailable = readOwnBooleanFlag(runtimeGlobal, 'MTR_ENABLE_DEEZER_STREAMS');
let deezerStreamsCircuitOpen = false;
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

 codex/find-reason-for-0%-songs-statistic-c0lumz
let deezerStreamsEndpointAvailable = readOwnBooleanFlag(runtimeGlobal, 'MTR_ENABLE_DEEZER_STREAMS');
let deezerStreamsCircuitOpen = false;
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

 codex/find-reason-for-0%-songs-statistic-7dg0q0
let deezerStreamsEndpointAvailable = readOwnBooleanFlag(runtimeGlobal, 'MTR_ENABLE_DEEZER_STREAMS');
let deezerStreamsCircuitOpen = false;
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

 codex/find-reason-for-0%-songs-statistic-09svhr
let deezerStreamsEndpointAvailable = readOwnBooleanFlag(runtimeGlobal, 'MTR_ENABLE_DEEZER_STREAMS');
let deezerStreamsCircuitOpen = false;
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

 codex/find-reason-for-0%-songs-statistic-osd0jc
let deezerStreamsEndpointAvailable = readOwnBooleanFlag(runtimeGlobal, 'MTR_ENABLE_DEEZER_STREAMS');
let deezerStreamsCircuitOpen = false;
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

 codex/find-reason-for-0%-songs-statistic-7i3nq7
let deezerStreamsEndpointAvailable = readOwnBooleanFlag(runtimeGlobal, 'MTR_ENABLE_DEEZER_STREAMS');
let deezerStreamsCircuitOpen = false;
function getDashboardRegionQueries() {
    const defaultQueries = { latam: 'latin', us: 'billboard', eu: 'europe top' };
    const externalQueries = runtimeGlobal && runtimeGlobal.MTR_DASHBOARD_REGION_QUERIES;
    if (externalQueries && typeof externalQueries === 'object') {
        return { ...defaultQueries, ...externalQueries };
    }
    return defaultQueries;
}

 codex/find-reason-for-0%-songs-statistic-9amkhv
let deezerStreamsEndpointAvailable = readOwnBooleanFlag(runtimeGlobal, 'MTR_ENABLE_DEEZER_STREAMS');

 codex/find-reason-for-0%-songs-statistic-so425n
let deezerStreamsEndpointAvailable = readOwnBooleanFlag(runtimeGlobal, 'MTR_ENABLE_DEEZER_STREAMS');

let deezerStreamsEndpointAvailable = readBooleanFeatureFlag('MTR_ENABLE_DEEZER_STREAMS');

 codex/find-reason-for-0%-songs-statistic-qvefvv
const runtimeGlobal = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
let deezerStreamsEndpointAvailable = Boolean(runtimeGlobal.MTR_ENABLE_DEEZER_STREAMS);

 codex/find-reason-for-0%-songs-statistic-mitu7z
const runtimeGlobal = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
let deezerStreamsEndpointAvailable = Boolean(runtimeGlobal.MTR_ENABLE_DEEZER_STREAMS);

let deezerStreamsEndpointAvailable = Boolean(window?.MTR_ENABLE_DEEZER_STREAMS);
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
let deezerStreamsCircuitOpen = false;
 main
const dashboardRegionQueries = { latam: 'latin', us: 'billboard', eu: 'europe top' };
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2

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
        
        displaySearchResults(data.data, resultsDiv);
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
    if (!deezerStreamsEndpointAvailable) {
        return { current: 0, avg24h: 0 };
    }

    try {
        const response = await fetch(`https://api.deezer.com/v1/tracks/${trackId}/streams?interval=5m`);
        if (!response.ok) throw new Error('No stream endpoint');
        const data = await response.json();
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

        html += `
            <div class="track-item" onclick='handleTrackSelect(${JSON.stringify(trackData).replace(/'/g, "&#39;")})'>
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

    resultsDiv.innerHTML = html;
}

function formatDeltaArrow(current, avg24h) {
    if (!avg24h || !current) return '<span class="stream-delta neutral">• N/D</span>';
    const delta = ((current - avg24h) / avg24h) * 100;
    if (delta >= 0) return `<span class="stream-delta up">▲ ${delta.toFixed(1)}%</span>`;
    return `<span class="stream-delta down">▼ ${Math.abs(delta).toFixed(1)}%</span>`;
}

function formatDashboardStat(track, streamData, totalRank) {
 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz

 codex/find-reason-for-0%-songs-statistic-7dg0q0

 codex/find-reason-for-0%-songs-statistic-09svhr

 codex/find-reason-for-0%-songs-statistic-osd0jc

 codex/find-reason-for-0%-songs-statistic-7i3nq7

 codex/find-reason-for-0%-songs-statistic-9amkhv

 codex/find-reason-for-0%-songs-statistic-so425n

 codex/find-reason-for-0%-songs-statistic-aklz7k

 codex/find-reason-for-0%-songs-statistic-qvefvv

 codex/find-reason-for-0%-songs-statistic-mitu7z
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
    if (streamData && streamData.current && streamData.avg24h) {
        return formatDeltaArrow(streamData.current, streamData.avg24h);
    }

    const rank = Number((track && track.rank) || 0);
 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz

 codex/find-reason-for-0%-songs-statistic-7dg0q0

 codex/find-reason-for-0%-songs-statistic-09svhr

 codex/find-reason-for-0%-songs-statistic-osd0jc

 codex/find-reason-for-0%-songs-statistic-7i3nq7

 codex/find-reason-for-0%-songs-statistic-9amkhv

 codex/find-reason-for-0%-songs-statistic-so425n

 codex/find-reason-for-0%-songs-statistic-aklz7k

 codex/find-reason-for-0%-songs-statistic-qvefvv


    if (streamData?.current && streamData?.avg24h) {
        return formatDeltaArrow(streamData.current, streamData.avg24h);
    }

    const rank = Number(track?.rank || 0);
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
    if (rank > 0 && totalRank > 0) {
        const rankShare = (rank / totalRank) * 100;
        return `<span class="stream-delta neutral">• ${rankShare.toFixed(1)}% del top</span>`;
    }

    return '<span class="stream-delta neutral">• N/D</span>';
}

 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz

 codex/find-reason-for-0%-songs-statistic-7dg0q0

 codex/find-reason-for-0%-songs-statistic-09svhr

 codex/find-reason-for-0%-songs-statistic-osd0jc

 codex/find-reason-for-0%-songs-statistic-7i3nq7

 codex/find-reason-for-0%-songs-statistic-9amkhv

 codex/find-reason-for-0%-songs-statistic-so425n

 codex/find-reason-for-0%-songs-statistic-aklz7k

 codex/find-reason-for-0%-songs-statistic-qvefvv
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
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

 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz

 codex/find-reason-for-0%-songs-statistic-7dg0q0

 codex/find-reason-for-0%-songs-statistic-09svhr

 codex/find-reason-for-0%-songs-statistic-osd0jc

 codex/find-reason-for-0%-songs-statistic-7i3nq7

 codex/find-reason-for-0%-songs-statistic-9amkhv

 codex/find-reason-for-0%-songs-statistic-so425n

 codex/find-reason-for-0%-songs-statistic-aklz7k


 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
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

 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz

 codex/find-reason-for-0%-songs-statistic-7dg0q0

 codex/find-reason-for-0%-songs-statistic-09svhr

 codex/find-reason-for-0%-songs-statistic-osd0jc

 codex/find-reason-for-0%-songs-statistic-7i3nq
 codex/find-reason-for-0%-songs-statistic-9amkhv

 codex/find-reason-for-0%-songs-statistic-so425n

 codex/find-reason-for-0%-songs-statistic-aklz7k

 codex/find-reason-for-0%-songs-statistic-qvefvv
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
        const tracks = ((data && data.data) || []).slice(0, 8);
        if (!tracks.length) {
            renderDashboardTracks(list, getFallbackDashboardTracks(region).map((track) => ({ track, streamData: null })));
            return;
        }
 codex/find-reason-for-0%-songs-statistic-usqut1

        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

        renderDashboardTracks(list, tracksWithStream);

 codex/find-reason-for-0%-songs-statistic-ho6y47

        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

        renderDashboardTracks(list, tracksWithStream);

 codex/find-reason-for-0%-songs-statistic-kq346f

        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

        renderDashboardTracks(list, tracksWithStream);

 codex/find-reason-for-0%-songs-statistic-n3env6

        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

        renderDashboardTracks(list, tracksWithStream);

 codex/find-reason-for-0%-songs-statistic-c0lumz

        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

        renderDashboardTracks(list, tracksWithStream);

 codex/find-reason-for-0%-songs-statistic-7dg0q0

        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

        renderDashboardTracks(list, tracksWithStream);

 codex/find-reason-for-0%-songs-statistic-09svhr

        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

        renderDashboardTracks(list, tracksWithStream);

 codex/find-reason-for-0%-songs-statistic-osd0jc

        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

        renderDashboardTracks(list, tracksWithStream);

 codex/find-reason-for-0%-songs-statistic-7i3nq7

        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

        renderDashboardTracks(list, tracksWithStream);

 codex/find-reason-for-0%-songs-statistic-9amkhv

        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

        renderDashboardTracks(list, tracksWithStream);

 codex/find-reason-for-0%-songs-statistic-so425n

        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

        renderDashboardTracks(list, tracksWithStream);

 codex/find-reason-for-0%-songs-statistic-aklz7k

        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

        renderDashboardTracks(list, tracksWithStream);


        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

        renderDashboardTracks(list, tracksWithStream);

        const tracks = (data?.data || []).slice(0, 8);
        const shouldFetchStreams = deezerStreamsEndpointAvailable && !deezerStreamsCircuitOpen;
        const tracksWithStream = shouldFetchStreams
            ? await Promise.all(tracks.map(async (track) => {
                const streamData = await fetchTrackStreams(track.id);
                return { track, streamData };
            }))
            : tracks.map((track) => ({ track, streamData: null }));

 codex/find-reason-for-0%-songs-statistic-mitu7z
        const totalRank = tracksWithStream.reduce((sum, { track }) => sum + Number((track && track.rank) || 0), 0);

        const totalRank = tracksWithStream.reduce((sum, { track }) => sum + Number(track?.rank || 0), 0);
 feature/wall-street-v2

        list.innerHTML = tracksWithStream.map(({ track, streamData }) => `
            <article class="stream-card">
                <img src="${track.album?.cover_medium}" alt="${track.title}">
                <div class="stream-card-info">
                    <strong>${track.title}</strong>
                    <span>${track.artist?.name || ''}</span>
                    ${formatDashboardStat(track, streamData, totalRank)}
                </div>
            </article>
        `).join('');
        updateDashboardCarousel();
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
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
    
    // Call the selection function if it exists
    if (typeof selectSongForBattle === 'function') {
        selectSongForBattle(track);
    } else if (typeof selectTrack === 'function') {
        selectTrack(track);
    } else {
        console.warn('No track selection handler found');
    }
}

// =========================================
// EVENT LISTENERS
// =========================================

let dashboardBootstrapDone = false;

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

 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47
 feature/wall-street-v2
    if (!window.MTR_INLINE_TOP_STREAMS_ACTIVE) {
        loadDashboardRegion(dashboardRegion);
        initDashboardDragScroll();
        setInterval(() => loadDashboardRegion(dashboardRegion), 300000);
    }
 codex/find-reason-for-0%-songs-statistic-usqut1


    loadDashboardRegion(dashboardRegion);
    initDashboardDragScroll();
    setInterval(() => loadDashboardRegion(dashboardRegion), 300000);
 feature/wall-street-v2
 feature/wall-street-v2
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

window.setDashboardRegion = setDashboardRegion;
window.moveDashboardCarousel = moveDashboardCarousel;
