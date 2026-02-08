// =========================================
// APP.JS - MusicToken Ring
// =========================================

// Battle state
const battleState = {
    fighter1: null,
    fighter2: null,
    bets: { fighter1: 0, fighter2: 0 },
    isRunning: false,
    timer: null
};

// Toast notification system
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
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

// Search Deezer
async function searchDeezer(fighter) {
    const input = document.getElementById(`search${fighter}`);
    const resultsDiv = document.getElementById(`results${fighter}`);
    const query = input.value.trim();
    
    if (!query) {
        showToast('Por favor ingresa un término de búsqueda', 'error');
        return;
    }
    
    resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px;">Buscando...</p>';
    
    try {
        const response = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=6`);
        
        if (!response.ok) throw new Error('Error en la búsqueda');
        
        const data = await response.json();
        
        if (!data.data || data.data.length === 0) {
            resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #9CA3AF;">No se encontraron resultados</p>';
            return;
        }
        
        displayResults(data.data, fighter);
    } catch (error) {
        console.error('Search error:', error);
        showToast('Error en la búsqueda', 'error');
        resultsDiv.innerHTML = '<p style="text-align: center; padding: 20px; color: #EF4444;">❌ Error en la búsqueda</p>';
    }
}

// Display search results
function displayResults(tracks, fighter) {
    const resultsDiv = document.getElementById(`results${fighter}`);
    
    resultsDiv.innerHTML = tracks.map(track => `
        <div class="track-item" onclick="selectTrack(${fighter}, ${JSON.stringify(track).replace(/"/g, '&quot;')})">
            <img src="${track.album.cover_medium}" alt="${track.title}">
            <div class="track-info">
                <div class="track-name">${track.title}</div>
                <div class="track-artist">${track.artist.name}</div>
            </div>
            ${track.preview ? `
                <button class="btn-preview" onclick="event.stopPropagation(); togglePreview('${track.preview}', this)">
                    ▶ Preview
                </button>
            ` : '<span style="color: #6B7280; font-size: 12px;">Sin preview</span>'}
        </div>
    `).join('');
}

// Audio preview management
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
        if (currentAudio) {
            currentAudio.pause();
            const oldButtons = document.querySelectorAll('.btn-preview');
            oldButtons.forEach(btn => btn.textContent = '▶ Preview');
        }
        
        currentAudio = new Audio(url);
        currentAudio.play();
        button.textContent = '⏸ Pause';
        
        currentAudio.onended = () => {
            button.textContent = '▶ Preview';
        };
    }
}

// Select track
function selectTrack(fighter, track) {
    battleState[`fighter${fighter}`] = {
        id: track.id,
        name: track.title,
        artist: track.artist.name,
        image: track.album.cover_big,
        preview: track.preview,
        popularity: track.rank || Math.floor(Math.random() * 1000000)
    };
    
    showToast(`${track.title} seleccionado como Luchador ${fighter}`, 'success');
    
    // Check if both fighters selected
    if (battleState.fighter1 && battleState.fighter2) {
        document.getElementById('confirmBtn').disabled = false;
    }
}

// Confirm selection
function confirmSelection() {
    if (!battleState.fighter1 || !battleState.fighter2) {
        showToast('Selecciona ambos luchadores', 'error');
        return;
    }
    
    // Hide selection section
    document.getElementById('selectionSection').classList.add('hidden');
    
    // Show battle section
    document.getElementById('battleSection').classList.remove('hidden');
    
    // Setup battle arena
    setupBattleArena();
}

// Setup battle arena
function setupBattleArena() {
    const { fighter1, fighter2 } = battleState;
    
    // Fighter 1
    document.getElementById('avatar1').innerHTML = `<img src="${fighter1.image}" alt="${fighter1.name}">`;
    document.getElementById('name1').textContent = fighter1.name;
    
    // Fighter 2
    document.getElementById('avatar2').innerHTML = `<img src="${fighter2.image}" alt="${fighter2.name}">`;
    document.getElementById('name2').textContent = fighter2.name;
    
    // Reset health bars
    document.getElementById('health1').style.width = '100%';
    document.getElementById('health2').style.width = '100%';
    document.getElementById('healthText1').textContent = '100%';
    document.getElementById('healthText2').textContent = '100%';
    
    // Reset bets
    battleState.bets = { fighter1: 0, fighter2: 0 };
    updateBetStats();
}

// Place bet
function placeBet(fighter) {
    const input = document.getElementById(`bet${fighter}`);
    const amount = parseInt(input.value) || 0;
    
    if (amount <= 0) {
        showToast('Ingresa una cantidad válida', 'error');
        return;
    }
    
    battleState.bets[`fighter${fighter}`] += amount;
    showToast(`Apostaste ${amount} $MTOKEN en Luchador ${fighter}`, 'success');
    
    input.value = '';
    updateBetStats();
}

// Update bet statistics
function updateBetStats() {
    const total = battleState.bets.fighter1 + battleState.bets.fighter2;
    document.getElementById('totalPool').textContent = `${total} $MTOKEN`;
    document.getElementById('bets1').textContent = `${battleState.bets.fighter1} $MTOKEN`;
    document.getElementById('bets2').textContent = `${battleState.bets.fighter2} $MTOKEN`;
}

// Start battle
async function startBattle() {
    if (battleState.isRunning) return;
    
    battleState.isRunning = true;
    document.getElementById('startBtn').disabled = true;
    
    showToast('¡Batalla iniciada!', 'success');
    
    // Battle duration
    let timeLeft = CONFIG.BATTLE_DURATION;
    const timerEl = document.getElementById('timer');
    
    // Health values
    let health1 = 100;
    let health2 = 100;
    
    // Battle loop
    const interval = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;
        
        // Random damage
        const damage1 = Math.random() * 3;
        const damage2 = Math.random() * 3;
        
        health1 -= damage2;
        health2 -= damage1;
        
        // Update health bars
        health1 = Math.max(0, health1);
        health2 = Math.max(0, health2);
        
        document.getElementById('health1').style.width = `${health1}%`;
        document.getElementById('health2').style.width = `${health2}%`;
        document.getElementById('healthText1').textContent = `${Math.round(health1)}%`;
        document.getElementById('healthText2').textContent = `${Math.round(health2)}%`;
        
        // Check if battle ended
        if (timeLeft <= 0 || health1 <= 0 || health2 <= 0) {
            clearInterval(interval);
            endBattle(health1, health2);
        }
    }, 1000);
}

// End battle
async function endBattle(health1, health2) {
    battleState.isRunning = false;
    
    // Determine winner
    const winner = health1 > health2 ? 1 : 2;
    const winnerData = battleState[`fighter${winner}`];
    
    // Calculate prize
    const totalPool = battleState.bets.fighter1 + battleState.bets.fighter2;
    const burnRate = 0.005; // 0.5% burn
    const burnAmount = Math.floor(totalPool * burnRate);
    const prize = totalPool - burnAmount;
    
    // Show winner modal
    showWinnerModal(winnerData, prize);
    
    // Save battle to database
    await saveBattle(winner, prize);
    
    showToast(`¡${winnerData.name} ganó!`, 'success');
}

// Save battle to Supabase
async function saveBattle(winner, prize) {
    try {
        // Check if user is logged in
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (!session) {
            console.log('User not logged in, battle not saved');
            return;
        }
        
        const battleData = {
            user_id: session.user.id,
            fighter1_name: battleState.fighter1.name,
            fighter1_artist: battleState.fighter1.artist,
            fighter1_image: battleState.fighter1.image,
            fighter1_preview: battleState.fighter1.preview,
            fighter2_name: battleState.fighter2.name,
            fighter2_artist: battleState.fighter2.artist,
            fighter2_image: battleState.fighter2.image,
            fighter2_preview: battleState.fighter2.preview,
            winner: winner,
            bet_amount: battleState.bets.fighter1 + battleState.bets.fighter2,
            prize_amount: prize
        };
        
        const { data, error } = await supabaseClient
            .from('battles')
            .insert([battleData]);
        
        if (error) {
            console.error('Error saving battle:', error);
        } else {
            console.log('Battle saved successfully!');
        }
    } catch (error) {
        console.error('Error in saveBattle:', error);
    }
}

// Show winner modal
function showWinnerModal(winner, prize) {
    const modal = document.getElementById('winnerModal');
    document.getElementById('winnerName').textContent = winner.name;
    document.getElementById('winnerPrize').textContent = `+${prize} $MTOKEN`;
    modal.classList.remove('hidden');
}

// Enter key support for search
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('search1')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchDeezer(1);
    });
    
    document.getElementById('search2')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchDeezer(2);
    });
    
    console.log('🥊 MusicToken Ring ready!');
});
