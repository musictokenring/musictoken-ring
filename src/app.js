// =========================================
// MUSICTOKEN RING - APPLICATION LOGIC
// =========================================

// State
let battleState = {
    fighter1: null,
    fighter2: null,
    fighter1Bets: 0,
    fighter2Bets: 0,
    fighter1Health: 100,
    fighter2Health: 100,
    timeRemaining: 60,
    isActive: false,
    interval: null,
};

// Audio
let currentPreviewAudio = new Audio();
let currentPreview = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Setup search on Enter
    document.getElementById('search1').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchSpotify(1);
    });
    
    document.getElementById('search2').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchSpotify(2);
    });
    
    console.log('🥊 MusicToken Ring ready!');
});

// Search Spotify
async function searchSpotify(fighter) {
    const query = document.getElementById(`search${fighter}`).value.trim();
    
    if (!query) {
        showToast('Ingresa un término de búsqueda', 'error');
        return;
    }
    
    const resultsContainer = document.getElementById(`results${fighter}`);
    resultsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:2rem; color:#666;">🔍 Buscando...</div>';
    
    try {
        const response = await axios.get(`${CONFIG.BACKEND_API}/api/search`, {
            params: { q: query, limit: 6 }
        });
        
        const tracks = response.data.tracks || [];
        
        if (tracks.length === 0) {
            resultsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:2rem; color:#666;">No se encontraron resultados</div>';
            return;
        }
        
        resultsContainer.innerHTML = tracks.map(track => {
            const imageUrl = track.album?.images?.[0]?.url || track.image || '';
            const artistName = track.artists?.[0]?.name || track.artist || 'Unknown';
            const hasPreview = track.preview_url && track.preview_url !== null;
            
            return `
                <div class="track-item" onclick='selectTrack(${JSON.stringify({
                    id: track.id,
                    name: track.name,
                    artist: artistName,
                    image: imageUrl,
                    preview_url: track.preview_url
                }).replace(/'/g, "&apos;")}, ${fighter})'>
                    <img src="${imageUrl}" class="track-cover" alt="${track.name}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect fill=%22%23333%22 width=%22200%22 height=%22200%22/><text x=%2250%%22 y=%2250%%22 fill=%22%23666%22 font-size=%2240%22 text-anchor=%22middle%22 dy=%22.3em%22>🎵</text></svg>'">
                    <div class="track-info">
                        <div class="track-name">${track.name}</div>
                        <div class="track-artist">${artistName}</div>
                    </div>
                    ${hasPreview ? `
                        <button class="preview-btn" onclick="event.stopPropagation(); playPreview('${track.preview_url}', '${track.id}', this)">
                            ▶️ Preview
                        </button>
                    ` : '<span style="font-size:11px; color:#666;">Sin preview</span>'}
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Search error:', error);
        showToast('Error buscando canciones', 'error');
        resultsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:2rem; color:#ff4444;">❌ Error en la búsqueda</div>';
    }
}

// Select track
function selectTrack(track, fighter) {
    // Remove previous selections
    document.querySelectorAll(`#results${fighter} .track-item`).forEach(item => {
        item.classList.remove('selected');
    });
    
    // Add selection to clicked item
    event.target.closest('.track-item').classList.add('selected');
    
    // Store selection
    if (fighter === 1) {
        battleState.fighter1 = track;
        showToast(`🔵 ${track.name} seleccionado`, 'success');
    } else {
        battleState.fighter2 = track;
        showToast(`🔴 ${track.name} seleccionado`, 'success');
    }
    
    // Enable confirm button
    if (battleState.fighter1 && battleState.fighter2) {
        document.getElementById('confirmBtn').disabled = false;
    }
}

// Play preview
function playPreview(url, trackId, button) {
    if (currentPreview === trackId && !currentPreviewAudio.paused) {
        currentPreviewAudio.pause();
        button.textContent = '▶️ Preview';
        currentPreview = null;
        return;
    }
    
    // Stop previous
    currentPreviewAudio.pause();
    document.querySelectorAll('.preview-btn').forEach(btn => {
        btn.textContent = '▶️ Preview';
    });
    
    // Play new
    if (url) {
        currentPreviewAudio.src = url;
        currentPreviewAudio.play().catch(err => {
            console.error('Audio play error:', err);
            showToast('No se pudo reproducir el preview', 'error');
        });
        button.textContent = '⏸️ Pause';
        currentPreview = trackId;
        
        currentPreviewAudio.onended = () => {
            button.textContent = '▶️ Preview';
            currentPreview = null;
        };
    }
}

// Confirm selection
function confirmSelection() {
    if (!battleState.fighter1 || !battleState.fighter2) {
        showToast('Selecciona ambas canciones', 'error');
        return;
    }
    
    // Hide selection, show battle
    document.getElementById('selectionSection').classList.add('hidden');
    document.getElementById('battleSection').classList.remove('hidden');
    
    // Setup fighters
    setupBattleArena();
    
    showToast('¡Luchadores listos! Coloca tus apuestas', 'success');
}

// Setup battle arena
function setupBattleArena() {
    // Fighter 1
    document.getElementById('name1').textContent = battleState.fighter1.name;
    const avatar1 = document.getElementById('avatar1');
    avatar1.innerHTML = battleState.fighter1.image ? 
        `<img src="${battleState.fighter1.image}" alt="${battleState.fighter1.name}">` :
        '<div class="avatar-placeholder">🎵</div>';
    
    // Fighter 2
    document.getElementById('name2').textContent = battleState.fighter2.name;
    const avatar2 = document.getElementById('avatar2');
    avatar2.innerHTML = battleState.fighter2.image ? 
        `<img src="${battleState.fighter2.image}" alt="${battleState.fighter2.name}">` :
        '<div class="avatar-placeholder">🎵</div>';
}

// Place bet
function placeBet(fighter) {
    const betAmount = parseInt(document.getElementById(`bet${fighter}`).value) || 0;
    
    if (betAmount <= 0) {
        showToast('Ingresa una cantidad válida', 'error');
        return;
    }
    
    if (fighter === 1) {
        battleState.fighter1Bets += betAmount;
    } else {
        battleState.fighter2Bets += betAmount;
    }
    
    updateStats();
    showToast(`💰 Apuesta de ${betAmount} $MTOKEN colocada`, 'success');
    
    // Clear input
    document.getElementById(`bet${fighter}`).value = '';
}

// Update stats
function updateStats() {
    const total = battleState.fighter1Bets + battleState.fighter2Bets;
    document.getElementById('totalPool').textContent = `${total.toLocaleString()} $MTOKEN`;
    document.getElementById('bets1').textContent = `${battleState.fighter1Bets.toLocaleString()} $MTOKEN`;
    document.getElementById('bets2').textContent = `${battleState.fighter2Bets.toLocaleString()} $MTOKEN`;
}

// Start battle
function startBattle() {
    if (battleState.isActive) return;
    
    const total = battleState.fighter1Bets + battleState.fighter2Bets;
    if (total === 0) {
        showToast('Coloca al menos una apuesta', 'error');
        return;
    }
    
    battleState.isActive = true;
    battleState.timeRemaining = CONFIG.BATTLE_DURATION;
    
    document.getElementById('startBtn').disabled = true;
    showToast('🥊 ¡Batalla iniciada!', 'success');
    
    // Battle loop
    battleState.interval = setInterval(() => {
        battleState.timeRemaining--;
        document.getElementById('timer').textContent = battleState.timeRemaining;
        
        // Random damage
        const damage1 = Math.random() * 3;
        const damage2 = Math.random() * 3;
        
        battleState.fighter1Health -= damage2;
        battleState.fighter2Health -= damage1;
        
        // Update health bars
        updateHealthBars();
        
        // Check for winner
        if (battleState.timeRemaining <= 0 || battleState.fighter1Health <= 0 || battleState.fighter2Health <= 0) {
            endBattle();
        }
    }, 1000);
}

// Update health bars
function updateHealthBars() {
    const health1 = Math.max(0, battleState.fighter1Health);
    const health2 = Math.max(0, battleState.fighter2Health);
    
    document.getElementById('health1').style.width = `${health1}%`;
    document.getElementById('healthText1').textContent = `${Math.round(health1)}%`;
    
    document.getElementById('health2').style.width = `${health2}%`;
    document.getElementById('healthText2').textContent = `${Math.round(health2)}%`;
}

// End battle
function endBattle() {
    clearInterval(battleState.interval);
    battleState.isActive = false;
    
    // Determine winner
    const winner = battleState.fighter1Health > battleState.fighter2Health ? 1 : 2;
    const winnerName = winner === 1 ? battleState.fighter1.name : battleState.fighter2.name;
    const prize = battleState.fighter1Bets + battleState.fighter2Bets;
    const burnAmount = Math.floor(prize * 0.005);
    const finalPrize = prize - burnAmount;
    
    // Show winner modal
    document.getElementById('winnerName').textContent = winnerName;
    document.getElementById('winnerPrize').textContent = `+${finalPrize.toLocaleString()} $MTOKEN`;
    document.getElementById('winnerModal').classList.remove('hidden');
    
    showToast(`🏆 ${winnerName} gana!`, 'success');
}

// Toast notification
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'toastSlideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
