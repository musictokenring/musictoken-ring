// =========================================
// APP.JS - MusicToken Ring
// Funciones auxiliares de búsqueda y audio
// (La lógica de juego está en game-engine.js)
// =========================================

// Use existing Supabase client (already initialized by auth-system.js)
const supabaseClient = window.supabaseClient;

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
    
    // Create callback function
    window[callbackName] = function(data) {
        // Clean up
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
        delete window[callbackName];
        resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #EF4444;">❌ Error en la búsqueda</p>';
        showToast('Error al buscar', 'error');
    };
    
    document.head.appendChild(script);
}

// =========================================
// DISPLAY SEARCH RESULTS
// =========================================

function displaySearchResults(tracks, resultsDiv) {
    let html = '';
    
    tracks.forEach(track => {
        const trackData = {
            id: track.id,
            name: track.title,
            artist: track.artist.name,
            image: track.album.cover_big,
            preview: track.preview
        };
        
        html += `
            <div class="track-item" onclick='handleTrackSelect(${JSON.stringify(trackData).replace(/'/g, "&#39;")})'>
                <img src="${track.album.cover_medium}" alt="${track.title}">
                <div class="track-info">
                    <div class="track-name">${track.title}</div>
                    <div class="track-artist">${track.artist.name}</div>
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
// UTILITY FUNCTIONS
// =========================================

// Format time (seconds to MM:SS)
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format number with commas
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Validate bet amount
function validateBet(amount, minBet, maxBet = null) {
    if (!amount || amount < minBet) {
        showToast(`Apuesta mínima: ${minBet} $MTOKEN`, 'error');
        return false;
    }
    
    if (maxBet && amount > maxBet) {
        showToast(`Apuesta máxima: ${maxBet} $MTOKEN`, 'error');
        return false;
    }
    
    return true;
}

// Check if user is logged in
async function checkUserLoggedIn() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        return !!session;
    } catch (error) {
        console.error('Error checking auth:', error);
        return false;
    }
}

// Get current user
async function getCurrentUser() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        return session?.user || null;
    } catch (error) {
        console.error('Error getting user:', error);
        return null;
    }
}

// =========================================
// EVENT LISTENERS
// =========================================

document.addEventListener('DOMContentLoaded', () => {
    // Enter key support for search
    const searchInput = document.getElementById('songSearch');
    if (searchInput) {
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
    
    console.log('🎵 Search system initialized!');
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
window.formatTime = formatTime;
window.formatNumber = formatNumber;
window.validateBet = validateBet;
window.checkUserLoggedIn = checkUserLoggedIn;
window.getCurrentUser = getCurrentUser;
