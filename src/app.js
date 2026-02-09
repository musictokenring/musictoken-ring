// =========================================
// APP.JS - MusicToken Ring
// Con búsqueda Deezer funcionando + Guardar batallas
// =========================================

// Battle state
const battleState = {
    fighter1: null,
    fighter2: null,
    bets: { fighter1: 0, fighter2: 0 },
    isRunning: false,
    timer: null
};

// Initialize Supabase client
let supabaseClient;
if (typeof window.supabaseClient === 'undefined') {
    const SUPABASE_URL = 'https://bscmgcnynbxalcuwdqlm.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzY21nY255bmJ4YWxjdXdkcWxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NTYwOTUsImV4cCI6MjA4NjAzMjA5NX0.1iasFQ5H0GmrFqi6poWNE1aZOtbmQuB113RCyg2BBK4';
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabaseClient = supabaseClient;
} else {
    supabaseClient = window.supabaseClient;
}

console.log('🥊 MusicToken Ring ready!');

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

// Search Deezer (USANDO JSONP PARA EVITAR CORS)
function searchDeezer(fighter) {
    const query = document.getElementById(`search${fighter}`).value.trim();
    const resultsDiv = document.getElementById(`results${fighter}`);

    if (!query) {
        showToast('Ingresa un término de búsqueda', 'error');
        return;
    }

    resultsDiv.innerHTML = '<p style="text-align:center; padding:20px; color:#9CA3AF;">🔍 Buscando...</p>';

    // Create unique callback name
    const callbackName = `deezerCallback${fighter}_${Date.now()}`;
    
    // Create callback function
    window[callbackName] = function(data) {
        // Clean up
        delete window[callbackName];
        document.getElementById(callbackName).remove();
        
        if (!data.data || data.data.length === 0) {
            resultsDiv.innerHTML = '<p style="text-align:center; padding:20px; color:#9CA3AF;">No se encontraron resultados</p>';
            return;
        }

        let html = '';
        data.data.forEach(track => {
            html += `
                <div class="track-item" onclick='selectTrack(${fighter}, ${JSON.stringify(track).replace(/'/g, "&#39;")})'>
                    <img src="${track.album.cover_medium}" alt="${track.title}">
                    <div class="track-info">
                        <div class="track-name">${track.title}</div>
                        <div class="track-artist">${track.artist.name}</div>
                    </div>
                    ${track.preview ? `
                        <button class="btn-preview" onclick="event.stopPropagation(); togglePreview('${track.preview}', this)">
                            ▶ Preview
                        </button>
                    ` : '<span style="color:#6B7280; font-size:12px;">Sin preview</span>'}
                </div>
            `;
        });
        resultsDiv.innerHTML = html;
    };
    
    // Create script tag for JSONP request
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=6&output=jsonp&callback=${callbackName}`;
    script.onerror = function() {
        delete window[callbackName];
        resultsDiv.innerHTML = '<p style="text-align:center; padding:20px; color:#EF4444;">❌ Error en la búsqueda</p>';
        showToast('Error al buscar', 'error');
    };
    
    document.head.appendChild(script);
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
            document.querySelectorAll('.btn-preview').forEach(btn => {
                btn.textContent = '▶ Preview';
            });
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
    
    document.getElementById('selectionSection').classList.add('hidden');
    document.getElementById('battleSection').classList.remove('hidden');
    
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
function startBattle() {
    if (battleState.isRunning) return;
    
    battleState.isRunning = true;
    document.getElementById('startBtn').disabled = true;
    
    showToast('¡Batalla iniciada!', 'success');
    
    let timeLeft = CONFIG.BATTLE_DURATION;
    const timerEl = document.getElementById('timer');
    
    let health1 = 100;
    let health2 = 100;
    
    const interval = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;
        
        const damage1 = Math.random() * 3;
        const damage2 = Math.random() * 3;
        
        health1 -= damage2;
        health2 -= damage1;
        
        health1 = Math.max(0, health1);
        health2 = Math.max(0, health2);
        
        document.getElementById('health1').style.width = `${health1}%`;
        document.getElementById('health2').style.width = `${health2}%`;
        document.getElementById('healthText1').textContent = `${Math.round(health1)}%`;
        document.getElementById('healthText2').textContent = `${Math.round(health2)}%`;
        
        if (timeLeft <= 0 || health1 <= 0 || health2 <= 0) {
            clearInterval(interval);
            endBattle(health1, health2);
        }
    }, 1000);
}

// End battle
async function endBattle(health1, health2) {
    battleState.isRunning = false;
    
    const winner = health1 > health2 ? 1 : 2;
    const winnerData = battleState[`fighter${winner}`];
    
    const totalPool = battleState.bets.fighter1 + battleState.bets.fighter2;
    const burnRate = 0.005;
    const burnAmount = Math.floor(totalPool * burnRate);
    const prize = totalPool - burnAmount;
    
    showWinnerModal(winnerData, prize);
    
    // NUEVO: Guardar batalla en Supabase
    await saveBattle(winner, prize);
    
    showToast(`¡${winnerData.name} ganó!`, 'success');
}

// NUEVA FUNCIÓN: Guardar batalla en Supabase
async function saveBattle(winner, prize) {
    try {
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
            console.log('✅ Battle saved successfully!');
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
});
