(function () {
    function toast(message, type) {
        if (typeof window.showToast === 'function') return window.showToast(message, type || 'info');
        console[(type === 'error' ? 'error' : 'log')](message);
    }

    function betAmount() {
        return Number(document.getElementById('betAmount')?.value || 100);
    }

    function renderModeButtons(mode) {
        const buttonsDiv = document.getElementById('actionButtons');
        if (!buttonsDiv) return;

        if (mode === 'quick') {
            buttonsDiv.innerHTML = '<button onclick="startQuickMatch()" class="btn-primary btn-large" id="startQuickBtn">⚔️ Buscar Rival</button>';
        } else if (mode === 'private') {
            buttonsDiv.innerHTML = '<button onclick="createRoom()" class="btn-primary" id="createRoomBtn">🎪 Crear Sala</button><div class="or-divider">o</div><div class="join-room-group"><input type="text" id="joinRoomCode" placeholder="Código" class="room-code-input" maxlength="6"><button onclick="joinRoom()" class="btn-secondary" id="joinRoomBtn">Unirse</button></div>';
        } else if (mode === 'practice') {
            buttonsDiv.innerHTML = '<button onclick="startPractice()" class="btn-primary btn-large" id="startPracticeBtn">🎯 Iniciar Práctica</button>';
        } else if (mode === 'tournament') {
            buttonsDiv.innerHTML = '<div class="join-room-group"><input type="text" id="tournamentId" placeholder="ID de torneo" class="room-code-input"><button onclick="joinTournamentMode()" class="btn-primary" id="joinTournamentBtn">🏆 Unirme</button></div>';
        }
    }

    if (typeof window.selectMode !== 'function') {
        window.selectMode = function (mode) {
            window.currentMode = mode || null;
            const modeSelector = document.getElementById('modeSelector');
            const songSelection = document.getElementById('songSelection');
            const modeTitle = document.getElementById('modeTitle');
            const titles = { quick: 'Modo Rápido', private: 'Sala Privada', practice: 'Modo Práctica', tournament: 'Modo Torneo' };
            if (modeSelector) modeSelector.classList.add('hidden');
            if (songSelection) songSelection.classList.remove('hidden');
            if (modeTitle) modeTitle.textContent = titles[mode] || 'Modo de Juego';
            renderModeButtons(mode);
        };
    }

    if (typeof window.backToModes !== 'function') {
        window.backToModes = function () {
            const modeSelector = document.getElementById('modeSelector');
            const songSelection = document.getElementById('songSelection');
            if (songSelection) songSelection.classList.add('hidden');
            if (modeSelector) modeSelector.classList.remove('hidden');
            window.currentMode = null;
        };
    }

    if (typeof window.searchSong !== 'function') {
        window.searchSong = function () {
            const q = document.getElementById('songSearch')?.value || '';
            if (!q.trim()) return toast('Escribe una canción o artista', 'error');
            if (typeof window.searchDeezer === 'function') return window.searchDeezer(q, 'searchResults');
            toast('Buscador no disponible, recarga la página.', 'error');
        };
    }

    if (typeof window.startPractice !== 'function') {
        window.startPractice = async function () {
            if (window.GameEngine?.startPractice) return window.GameEngine.startPractice(window.selectedSong || null);
            if (window.GameEngine?.startPracticeMatch) return window.GameEngine.startPracticeMatch(window.selectedSong || null, betAmount());
            toast('Modo práctica no disponible todavía.', 'error');
        };
    }

    if (typeof window.startQuickMatch !== 'function') {
        window.startQuickMatch = async function () {
            if (window.GameEngine?.startQuickMatchmaking) return window.GameEngine.startQuickMatchmaking(window.selectedSong || null, betAmount());
            toast('Matchmaking no disponible todavía.', 'error');
        };
    }

    if (typeof window.createRoom !== 'function') {
        window.createRoom = async function () {
            if (window.GameEngine?.createPrivateRoom) return window.GameEngine.createPrivateRoom(window.selectedSong || null, betAmount());
            toast('Crear sala no disponible todavía.', 'error');
        };
    }

    if (typeof window.joinRoom !== 'function') {
        window.joinRoom = async function () {
            const code = (document.getElementById('joinRoomCode')?.value || '').trim().toUpperCase();
            if (!code) return toast('Ingresa un código de sala', 'error');
            if (window.GameEngine?.joinPrivateRoom) return window.GameEngine.joinPrivateRoom(code, window.selectedSong || null, betAmount());
            toast('Unirse a sala no disponible todavía.', 'error');
        };
    }

    if (typeof window.joinTournamentMode !== 'function') {
        window.joinTournamentMode = async function () {
            const tid = (document.getElementById('tournamentId')?.value || '').trim();
            if (!tid) return toast('Ingresa el ID del torneo', 'error');
            if (window.GameEngine?.joinTournament) return window.GameEngine.joinTournament(tid, window.selectedSong || null, betAmount());
            toast('Torneo no disponible todavía.', 'error');
        };
    }
})();
