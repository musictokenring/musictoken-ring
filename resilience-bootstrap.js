(function () {
    function toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
            return;
        }
        console[(type === 'error' ? 'error' : 'log')](message);
    }

    function updateActionButtonsFallback(mode) {
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
            if (modeTitle) modeTitle.textContent = titles[mode] || 'Seleccionar Modo';
            updateActionButtonsFallback(mode);
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
            const input = document.getElementById('songSearch');
            const query = input ? input.value : '';
            if (!query || !query.trim()) return toast('Escribe una canción o artista', 'error');
            if (typeof window.searchDeezer === 'function') return window.searchDeezer(query, 'searchResults');
            toast('Buscador no disponible aún. Recarga la página.', 'error');
        };
    }

    if (typeof window.startPractice !== 'function') {
        window.startPractice = async function () {
            if (typeof window.GameEngine !== 'undefined' && typeof window.GameEngine.startPractice === 'function') {
                return window.GameEngine.startPractice(window.selectedSong || null);
            }
            toast('Modo práctica no disponible todavía. Recarga la página.', 'error');
        };
    }

    if (typeof window.startQuickMatch !== 'function') {
        window.startQuickMatch = async function () {
            if (typeof window.GameEngine !== 'undefined' && typeof window.GameEngine.startQuickMatchmaking === 'function') {
                return window.GameEngine.startQuickMatchmaking(window.selectedSong || null, Number(document.getElementById('betAmount')?.value || 100));
            }
            toast('Matchmaking no disponible todavía. Recarga la página.', 'error');
        };
    }

    if (typeof window.createRoom !== 'function') {
        window.createRoom = async function () {
            if (typeof window.GameEngine !== 'undefined' && typeof window.GameEngine.createPrivateRoom === 'function') {
                return window.GameEngine.createPrivateRoom(window.selectedSong || null, Number(document.getElementById('betAmount')?.value || 100));
            }
            toast('Crear sala no disponible todavía. Recarga la página.', 'error');
        };
    }

    if (typeof window.joinRoom !== 'function') {
        window.joinRoom = async function () {
            const code = (document.getElementById('joinRoomCode')?.value || '').trim().toUpperCase();
            if (!code) return toast('Ingresa un código de sala', 'error');
            if (typeof window.GameEngine !== 'undefined' && typeof window.GameEngine.joinPrivateRoom === 'function') {
                return window.GameEngine.joinPrivateRoom(code, window.selectedSong || null, Number(document.getElementById('betAmount')?.value || 100));
            }
            toast('Unirse a sala no disponible todavía. Recarga la página.', 'error');
        };
    }

    if (typeof window.joinTournamentMode !== 'function') {
        window.joinTournamentMode = async function () {
            const tournamentId = (document.getElementById('tournamentId')?.value || '').trim();
            if (!tournamentId) return toast('Ingresa el ID del torneo', 'error');
            if (typeof window.GameEngine !== 'undefined' && typeof window.GameEngine.joinTournament === 'function') {
                return window.GameEngine.joinTournament(tournamentId, window.selectedSong || null, Number(document.getElementById('betAmount')?.value || 100));
            }
            toast('Torneo no disponible todavía. Recarga la página.', 'error');
        };
    }
})();
