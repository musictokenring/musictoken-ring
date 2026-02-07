// Main Application Logic - MusicToken Ring

// State
let battleState = {
    fighter1: null,
    fighter2: null,
    fighter1Bets: 0,
    fighter2Bets: 0,
    fighter1Streams: 0,
    fighter2Streams: 0,
    fighter1Health: 100,
    fighter2Health: 100,
    timeRemaining: 60,
    isActive: false,
    totalPool: 0,
    interval: null,
}

// Audio players
let currentPreviewAudio = new Audio()
let fighter1Audio = new Audio()
let fighter2Audio = new Audio()
let currentPreview = null

fighter1Audio.loop = true
fighter2Audio.loop = true

// Initialize app
window.addEventListener('load', () => {
    // Hide loading screen
    setTimeout(() => {
        document.getElementById('loadingScreen').classList.add('hidden')
    }, 1000)
    
    // Setup search inputs
    document.getElementById('search1').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchSpotify(1)
    })
    
    document.getElementById('search2').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchSpotify(2)
    })
    
    console.log('🥊 MusicToken Ring loaded!')
})

// Search Spotify
async function searchSpotify(fighter) {
    const query = document.getElementById(`search${fighter}`).value.trim()
    
    if (!query) {
        showToast('Ingresa un término de búsqueda', 'error')
        return
    }
    
    const resultsContainer = document.getElementById(`results${fighter}`)
    resultsContainer.innerHTML = '<div style="text-align:center; padding:2rem;">🔍 Buscando...</div>'
    
    try {
        const response = await axios.get(`${CONFIG.BACKEND_API}/api/search`, {
            params: { q: query, limit: 6 }
        })
        
        const tracks = response.data.tracks || []
        
        if (tracks.length === 0) {
            resultsContainer.innerHTML = '<div style="text-align:center; padding:2rem;">No se encontraron resultados</div>'
            return
        }
        
        resultsContainer.innerHTML = tracks.map(track => `
            <div class="track-item" onclick='selectTrack(${JSON.stringify(track)}, ${fighter})'>
                <img src="${track.album.images[0]?.url}" class="track-cover" alt="${track.name}">
                <div class="track-info">
                    <div class="track-name">${track.name}</div>
                    <div class="track-artist">${track.artists[0]?.name}</div>
                </div>
                ${track.preview_url ? `
                    <button class="preview-btn" onclick="event.stopPropagation(); playPreview('${track.preview_url}', '${track.id}', this)">
                        ▶️ Preview
                    </button>
                ` : '<span style="color: #666;">Sin preview</span>'}
            </div>
        `).join('')
        
    } catch (error) {
        console.error('Search error:', error)
        showToast('Error buscando canciones. Verifica que el backend esté corriendo.', 'error')
        resultsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:#ff0000;">❌ Error en la búsqueda</div>'
    }
}

// Select track
function selectTrack(track, fighter) {
    // Remove previous selection
    document.querySelectorAll(`#results${fighter} .track-item`).forEach(item => {
        item.classList.remove('selected')
    })
    
    // Add selection to clicked item
    event.currentTarget.classList.add('selected')
    
    if (fighter === 1) {
        battleState.fighter1 = track
    } else {
        battleState.fighter2 = track
    }
    
    showToast(`${track.name} seleccionado!`, 'success')
    
    // Enable confirm button if both selected
    if (battleState.fighter1 && battleState.fighter2) {
        document.getElementById('confirmBtn').disabled = false
    }
}

// Play preview
function playPreview(url, trackId, button) {
    if (currentPreview === trackId && !currentPreviewAudio.paused) {
        currentPreviewAudio.pause()
        currentPreviewAudio.currentTime = 0
        button.textContent = '▶️ Preview'
        button.classList.remove('playing')
        currentPreview = null
        return
    }
    
    // Reset all preview buttons
    document.querySelectorAll('.preview-btn').forEach(btn => {
        btn.textContent = '▶️ Preview'
        btn.classList.remove('playing')
    })
    
    currentPreviewAudio.pause()
    currentPreviewAudio.src = url
    currentPreviewAudio.volume = 0.5
    currentPreviewAudio.play().catch(e => {
        showToast('Error reproduciendo preview', 'error')
        console.error(e)
    })
    
    button.textContent = '⏸️ Playing'
    button.classList.add('playing')
    currentPreview = trackId
    
    currentPreviewAudio.onended = () => {
        button.textContent = '▶️ Preview'
        button.classList.remove('playing')
        currentPreview = null
    }
}

// Confirm selection
function confirmSelection() {
    if (!battleState.fighter1 || !battleState.fighter2) {
        showToast('Selecciona canciones para ambos luchadores', 'error')
        return
    }
    
    if (battleState.fighter1.id === battleState.fighter2.id) {
        showToast('Las canciones deben ser diferentes', 'error')
        return
    }
    
    // Stop preview
    currentPreviewAudio.pause()
    currentPreviewAudio.currentTime = 0
    
    // Setup battle audio
    if (battleState.fighter1.preview_url) {
        fighter1Audio.src = battleState.fighter1.preview_url
    }
    if (battleState.fighter2.preview_url) {
        fighter2Audio.src = battleState.fighter2.preview_url
    }
    
    // Update UI
    document.getElementById('name1').textContent = battleState.fighter1.name
    document.getElementById('name2').textContent = battleState.fighter2.name
    
    document.getElementById('avatar1').innerHTML = `
        <img src="${battleState.fighter1.album.images[0].url}" 
             alt="${battleState.fighter1.name}"
             style="width:100%;height:100%;object-fit:cover;border-radius:50%;">
    `
    
    document.getElementById('avatar2').innerHTML = `
        <img src="${battleState.fighter2.album.images[0].url}" 
             alt="${battleState.fighter2.name}"
             style="width:100%;height:100%;object-fit:cover;border-radius:50%;">
    `
    
    // Show battle arena
    document.getElementById('searchSection').classList.add('hidden')
    document.getElementById('battleArena').classList.remove('hidden')
    document.getElementById('bettingSection').classList.remove('hidden')
    
    showToast('¡Batalla configurada! Coloca tus apuestas', 'success')
}

// Place bet
function placeBet(fighter) {
    if (battleState.isActive) {
        showToast('La batalla ya está en curso', 'error')
        return
    }
    
    const amount = parseInt(document.getElementById(`bet${fighter}`).value)
    
    if (amount <= 0) {
        showToast('Ingresa una cantidad válida', 'error')
        return
    }
    
    if (fighter === 1) {
        battleState.fighter1Bets += amount
    } else {
        battleState.fighter2Bets += amount
    }
    
    battleState.totalPool += amount
    
    updateStats()
    showToast(`✅ ${amount} $MTOKEN apostados`, 'success')
}

// Set quick bet
function setQuickBet(amount) {
    document.getElementById('bet1').value = amount
    document.getElementById('bet2').value = amount
}

// Update stats
function updateStats() {
    const burnAmount = battleState.totalPool * CONFIG.BURN_RATE
    const prizeAmount = battleState.totalPool - burnAmount
    
    document.getElementById('totalPool').textContent = `${battleState.totalPool} $MTOKEN`
    document.getElementById('burnAmount').textContent = `${burnAmount.toFixed(2)} $MTOKEN`
    document.getElementById('prizeAmount').textContent = `${prizeAmount.toFixed(2)} $MTOKEN`
}

// Start battle
async function startBattle() {
    if (!battleState.fighter1 || !battleState.fighter2) {
        showToast('Selecciona las canciones primero', 'error')
        return
    }
    
    if (battleState.totalPool === 0) {
        showToast('Coloca apuestas primero', 'error')
        return
    }
    
    battleState.isActive = true
    battleState.timeRemaining = CONFIG.BATTLE_DURATION
    
    // Disable start button
    document.getElementById('startBtn').disabled = true
    document.getElementById('startBtn').innerHTML = '<span>⏳ BATALLA EN CURSO...</span>'
    
    // Start music
    try {
        fighter1Audio.volume = 0.5
        fighter2Audio.volume = 0.5
        await fighter1Audio.play()
        await fighter2Audio.play()
    } catch (error) {
        console.error('Audio error:', error)
        showToast('Error reproduciendo audio', 'error')
    }
    
    showToast('🥊 ¡Batalla iniciada!', 'success')
    
    // Start battle loop
    battleState.interval = setInterval(updateBattle, 1000)
}

// Update battle
function updateBattle() {
    battleState.timeRemaining--
    document.getElementById('timer').textContent = battleState.timeRemaining
    
    // Simulate streaming data
    const streams1 = Math.floor(Math.random() * 150) + 50
    const streams2 = Math.floor(Math.random() * 150) + 50
    
    battleState.fighter1Streams += streams1
    battleState.fighter2Streams += streams2
    
    const total = battleState.fighter1Streams + battleState.fighter2Streams
    
    if (total > 0) {
        battleState.fighter1Health = (battleState.fighter1Streams / total) * 100
        battleState.fighter2Health = (battleState.fighter2Streams / total) * 100
        
        // Update UI
        document.getElementById('health1').style.width = `${battleState.fighter1Health}%`
        document.getElementById('health1-text').textContent = `${Math.round(battleState.fighter1Health)}%`
        
        document.getElementById('health2').style.width = `${battleState.fighter2Health}%`
        document.getElementById('health2-text').textContent = `${Math.round(battleState.fighter2Health)}%`
        
        document.getElementById('streams1').textContent = `${battleState.fighter1Streams.toLocaleString()} streams`
        document.getElementById('streams2').textContent = `${battleState.fighter2Streams.toLocaleString()} streams`
        
        // Adjust volume based on performance
        fighter1Audio.volume = (battleState.fighter1Health / 100) * 0.7
        fighter2Audio.volume = (battleState.fighter2Health / 100) * 0.7
    }
    
    // End battle
    if (battleState.timeRemaining <= 0) {
        endBattle()
    }
}

// End battle
function endBattle() {
    clearInterval(battleState.interval)
    battleState.isActive = false
    
    fighter1Audio.pause()
    fighter2Audio.pause()
    
    const winner = battleState.fighter1Streams > battleState.fighter2Streams 
        ? battleState.fighter1 
        : battleState.fighter2
    
    const burnAmount = battleState.totalPool * CONFIG.BURN_RATE
    const prizeAmount = battleState.totalPool - burnAmount
    
    // Show winner modal
    document.getElementById('winnerName').textContent = winner.name
    document.getElementById('winnerPrize').textContent = `💰 ${prizeAmount.toFixed(2)} $MTOKEN`
    document.getElementById('winnerModal').classList.add('show')
    
    showToast(`🏆 ${winner.name} GANÓ!`, 'success')
    
    // Auto-close and reset
    setTimeout(() => {
        document.getElementById('winnerModal').classList.remove('show')
        location.reload()
    }, 5000)
}

// Show toast notification
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer')
    const toast = document.createElement('div')
    toast.className = `toast ${type}`
    toast.textContent = message
    
    container.appendChild(toast)
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s'
        setTimeout(() => toast.remove(), 300)
    }, 3000)
}

// Connect wallet (placeholder)
async function connectWallet() {
    showToast('Conectando wallet...', 'info')
    // TODO: Implement Web3 wallet connection
}

console.log('🎵 App.js loaded!')
