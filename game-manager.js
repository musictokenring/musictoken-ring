// =========================================
// GAME MANAGER - MusicToken Ring
// Sistema completo con múltiples modos de juego
// =========================================

const GameManager = {
    currentMatch: null,
    currentMode: null,
    userBalance: 0,
    minBet: 100,
    
    // Inicializar
    async init() {
        await this.loadUserBalance();
        await this.loadGameConfig();
        this.setupEventListeners();
    },
    
    // Cargar balance del usuario
    async loadUserBalance() {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) return;
            
            const { data, error } = await supabaseClient
                .from('user_balances')
                .select('balance')
                .eq('user_id', session.user.id)
                .single();
            
            if (data) {
                this.userBalance = data.balance;
                this.updateBalanceDisplay();
            }
        } catch (error) {
            console.error('Error loading balance:', error);
        }
    },
    
    // Cargar configuración
    async loadGameConfig() {
        try {
            const { data, error } = await supabaseClient
                .from('game_config')
                .select('*')
                .single();
            
            if (data) {
                this.minBet = data.min_bet;
                this.battleDuration = data.battle_duration;
                this.victoryAudioDuration = data.victory_audio_duration;
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
    },
    
    // Actualizar display de balance
    updateBalanceDisplay() {
        const balanceEl = document.getElementById('userBalance');
        if (balanceEl) {
            balanceEl.textContent = `${this.userBalance} $MTOKEN`;
        }
    },
    
    // ==========================================
    // MODO RÁPIDO (Quick Match)
    // ==========================================
    
    async joinQuickMatch(song, betAmount) {
        if (betAmount < this.minBet) {
            showToast(`Apuesta mínima: ${this.minBet} $MTOKEN`, 'error');
            return;
        }
        
        if (betAmount > this.userBalance) {
            showToast('Balance insuficiente', 'error');
            return;
        }
        
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            // Buscar oponente en cola
            const { data: opponent, error } = await supabaseClient
                .from('matchmaking_queue')
                .select('*')
                .neq('user_id', session.user.id)
                .gte('bet_amount', betAmount * 0.8) // Tolerancia 20%
                .lte('bet_amount', betAmount * 1.2)
                .order('created_at', { ascending: true })
                .limit(1)
                .single();
            
            if (opponent) {
                // Hay oponente disponible - crear partida
                await this.createMatch('quick', session.user.id, opponent.user_id, song, opponent, betAmount, opponent.bet_amount);
                
                // Remover de cola
                await supabaseClient
                    .from('matchmaking_queue')
                    .delete()
                    .eq('id', opponent.id);
                
                showToast('¡Oponente encontrado!', 'success');
            } else {
                // No hay oponente - agregar a cola
                await supabaseClient
                    .from('matchmaking_queue')
                    .insert([{
                        user_id: session.user.id,
                        song_id: song.id,
                        song_name: song.name,
                        song_artist: song.artist,
                        song_image: song.image,
                        song_preview: song.preview,
                        bet_amount: betAmount
                    }]);
                
                showToast('Buscando oponente...', 'info');
                this.showWaitingScreen();
            }
        } catch (error) {
            console.error('Error joining quick match:', error);
            showToast('Error al buscar partida', 'error');
        }
    },
    
    // ==========================================
    // MODO SALA PRIVADA (Private Room)
    // ==========================================
    
    async createPrivateRoom(song, betAmount) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            // Generar código de sala
            const { data: codeData } = await supabaseClient.rpc('generate_room_code');
            const roomCode = codeData;
            
            // Crear sala
            const { data: room, error } = await supabaseClient
                .from('private_rooms')
                .insert([{
                    room_code: roomCode,
                    creator_id: session.user.id,
                    min_bet: betAmount,
                    status: 'open'
                }])
                .select()
                .single();
            
            if (error) throw error;
            
            // Agregar creador a la sala
            await this.joinPrivateRoom(roomCode, song, betAmount);
            
            showToast(`Sala creada: ${roomCode}`, 'success');
            this.showRoomScreen(roomCode);
            
        } catch (error) {
            console.error('Error creating room:', error);
            showToast('Error al crear sala', 'error');
        }
    },
    
    async joinPrivateRoom(roomCode, song, betAmount) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            // Verificar que la sala existe y está abierta
            const { data: room, error } = await supabaseClient
                .from('private_rooms')
                .select('*')
                .eq('room_code', roomCode)
                .eq('status', 'open')
                .single();
            
            if (!room) {
                showToast('Sala no encontrada o cerrada', 'error');
                return;
            }
            
            if (betAmount < room.min_bet) {
                showToast(`Apuesta mínima de la sala: ${room.min_bet} $MTOKEN`, 'error');
                return;
            }
            
            // Si ya hay un match_id, unirse a ese match
            if (room.match_id) {
                const { data: match } = await supabaseClient
                    .from('matches')
                    .select('*')
                    .eq('id', room.match_id)
                    .single();
                
                if (match && !match.player2_id) {
                    // Unirse como jugador 2
                    await supabaseClient
                        .from('matches')
                        .update({
                            player2_id: session.user.id,
                            player2_song_id: song.id,
                            player2_song_name: song.name,
                            player2_song_artist: song.artist,
                            player2_song_image: song.image,
                            player2_song_preview: song.preview,
                            player2_bet: betAmount,
                            total_pot: match.player1_bet + betAmount,
                            status: 'ready'
                        })
                        .eq('id', room.match_id);
                    
                    // Actualizar sala
                    await supabaseClient
                        .from('private_rooms')
                        .update({ status: 'full' })
                        .eq('id', room.id);
                    
                    showToast('¡Unido a la sala!', 'success');
                    this.startMatch(room.match_id);
                }
            } else {
                // Crear match como jugador 1
                const { data: match } = await supabaseClient
                    .from('matches')
                    .insert([{
                        match_type: 'private',
                        room_code: roomCode,
                        player1_id: session.user.id,
                        player1_song_id: song.id,
                        player1_song_name: song.name,
                        player1_song_artist: song.artist,
                        player1_song_image: song.image,
                        player1_song_preview: song.preview,
                        player1_bet: betAmount,
                        status: 'waiting'
                    }])
                    .select()
                    .single();
                
                // Actualizar sala con match_id
                await supabaseClient
                    .from('private_rooms')
                    .update({ match_id: match.id })
                    .eq('id', room.id);
                
                showToast('Esperando oponente...', 'info');
                this.showWaitingScreen();
            }
            
        } catch (error) {
            console.error('Error joining room:', error);
            showToast('Error al unirse a la sala', 'error');
        }
    },
    
    // ==========================================
    // MODO VS CPU (Practice)
    // ==========================================
    
    async startPracticeMatch(userSong, cpuSong) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            const { data: match } = await supabaseClient
                .from('matches')
                .insert([{
                    match_type: 'practice',
                    player1_id: session.user.id,
                    player1_song_id: userSong.id,
                    player1_song_name: userSong.name,
                    player1_song_artist: userSong.artist,
                    player1_song_image: userSong.image,
                    player1_song_preview: userSong.preview,
                    player1_bet: 0,
                    player2_song_id: cpuSong.id,
                    player2_song_name: cpuSong.name,
                    player2_song_artist: cpuSong.artist,
                    player2_song_image: cpuSong.image,
                    player2_song_preview: cpuSong.preview,
                    player2_bet: 0,
                    total_pot: 0,
                    status: 'ready'
                }])
                .select()
                .single();
            
            this.startMatch(match.id);
            
        } catch (error) {
            console.error('Error starting practice:', error);
            showToast('Error al iniciar práctica', 'error');
        }
    },
    
    // ==========================================
    // CREAR Y EMPEZAR PARTIDA
    // ==========================================
    
    async createMatch(type, player1Id, player2Id, song1, song2Data, bet1, bet2) {
        try {
            const { data: match } = await supabaseClient
                .from('matches')
                .insert([{
                    match_type: type,
                    player1_id: player1Id,
                    player2_id: player2Id,
                    player1_song_id: song1.id,
                    player1_song_name: song1.name,
                    player1_song_artist: song1.artist,
                    player1_song_image: song1.image,
                    player1_song_preview: song1.preview,
                    player1_bet: bet1,
                    player2_song_id: song2Data.song_id,
                    player2_song_name: song2Data.song_name,
                    player2_song_artist: song2Data.song_artist,
                    player2_song_image: song2Data.song_image,
                    player2_song_preview: song2Data.song_preview,
                    player2_bet: bet2,
                    total_pot: bet1 + bet2,
                    status: 'ready'
                }])
                .select()
                .single();
            
            // Descontar apuestas
            await this.updateBalance(-bet1, 'bet', match.id);
            
            this.startMatch(match.id);
            
        } catch (error) {
            console.error('Error creating match:', error);
        }
    },
    
    async startMatch(matchId) {
        try {
            const { data: match } = await supabaseClient
                .from('matches')
                .select('*')
                .eq('id', matchId)
                .single();
            
            this.currentMatch = match;
            
            // Actualizar estado
            await supabaseClient
                .from('matches')
                .update({ 
                    status: 'playing',
                    started_at: new Date().toISOString()
                })
                .eq('id', matchId);
            
            // Iniciar batalla
            this.runBattle(match);
            
        } catch (error) {
            console.error('Error starting match:', error);
        }
    },
    
    // ==========================================
    // LÓGICA DE BATALLA
    // ==========================================
    
    async runBattle(match) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const isPlayer1 = session.user.id === match.player1_id;
        
        // Mostrar UI de batalla
        this.showBattleScreen(match, isPlayer1);
        
        // Reproducir SOLO la canción del usuario
        const userSong = isPlayer1 ? match.player1_song_preview : match.player2_song_preview;
        this.playUserSong(userSong);
        
        // Simular batalla
        let health1 = 100;
        let health2 = 100;
        let timeLeft = this.battleDuration;
        
        const battleInterval = setInterval(() => {
            timeLeft--;
            
            // Actualizar timer
            document.getElementById('battleTimer').textContent = timeLeft;
            
            // Daño aleatorio
            health1 -= Math.random() * 3;
            health2 -= Math.random() * 3;
            
            health1 = Math.max(0, health1);
            health2 = Math.max(0, health2);
            
            // Actualizar barras de salud
            this.updateHealthBars(health1, health2);
            
            // Fin de batalla
            if (timeLeft <= 0 || health1 <= 0 || health2 <= 0) {
                clearInterval(battleInterval);
                this.endBattle(match, health1, health2, isPlayer1);
            }
        }, 1000);
    },
    
    async endBattle(match, health1, health2, isPlayer1) {
        const winner = health1 > health2 ? 1 : 2;
        const userWon = (isPlayer1 && winner === 1) || (!isPlayer1 && winner === 2);
        
        // Detener canción del usuario
        this.stopUserSong();
        
        // Actualizar match en DB
        await supabaseClient
            .from('matches')
            .update({
                status: 'finished',
                winner: winner,
                player1_final_health: Math.round(health1),
                player2_final_health: Math.round(health2),
                finished_at: new Date().toISOString()
            })
            .eq('id', match.id);
        
        // Reproducir canción ganadora 15 segundos para AMBOS
        const winnerSong = winner === 1 ? match.player1_song_preview : match.player2_song_preview;
        this.playVictorySong(winnerSong);
        
        // Procesar premios
        if (match.match_type !== 'practice') {
            if (userWon) {
                const prize = match.total_pot;
                await this.updateBalance(prize, 'win', match.id);
                showToast(`¡Ganaste ${prize} $MTOKEN!`, 'success');
            } else {
                showToast('Perdiste la batalla', 'error');
            }
        } else {
            // Modo práctica - pequeña recompensa
            if (userWon) {
                await this.updateBalance(50, 'practice_reward', match.id);
                showToast('¡Ganaste 50 $MTOKEN!', 'success');
            }
        }
        
        // Mostrar modal de victoria después de 15 segundos
        setTimeout(() => {
            this.showVictoryModal(match, winner, userWon);
        }, 15000);
    },
    
    // ==========================================
    // GESTIÓN DE AUDIO
    // ==========================================
    
    playUserSong(previewUrl) {
        if (this.userAudio) {
            this.userAudio.pause();
        }
        this.userAudio = new Audio(previewUrl);
        this.userAudio.loop = true;
        this.userAudio.play();
    },
    
    stopUserSong() {
        if (this.userAudio) {
            this.userAudio.pause();
            this.userAudio = null;
        }
    },
    
    playVictorySong(previewUrl) {
        if (this.victoryAudio) {
            this.victoryAudio.pause();
        }
        this.victoryAudio = new Audio(previewUrl);
        this.victoryAudio.play();
        
        // Detener después de 15 segundos
        setTimeout(() => {
            if (this.victoryAudio) {
                this.victoryAudio.pause();
                this.victoryAudio = null;
            }
        }, 15000);
    },
    
    // ==========================================
    // GESTIÓN DE BALANCE
    // ==========================================
    
    async updateBalance(amount, type, matchId = null) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            const { data, error } = await supabaseClient
                .rpc('update_user_balance', {
                    p_user_id: session.user.id,
                    p_amount: amount,
                    p_type: type,
                    p_match_id: matchId
                });
            
            if (data) {
                await this.loadUserBalance();
                return true;
            }
            return false;
            
        } catch (error) {
            console.error('Error updating balance:', error);
            return false;
        }
    },
    
    // ==========================================
    // UI HELPERS
    // ==========================================
    
    showWaitingScreen() {
        // Implementar UI de espera
        document.getElementById('waitingScreen')?.classList.remove('hidden');
    },
    
    showRoomScreen(roomCode) {
        // Implementar UI de sala privada
        const roomEl = document.getElementById('roomCode');
        if (roomEl) roomEl.textContent = roomCode;
        document.getElementById('roomScreen')?.classList.remove('hidden');
    },
    
    showBattleScreen(match, isPlayer1) {
        document.getElementById('selectionSection')?.classList.add('hidden');
        document.getElementById('battleSection')?.classList.remove('hidden');
        
        // Setup fighters
        const fighter1 = isPlayer1 ? match.player1_song_name : match.player2_song_name;
        const fighter2 = isPlayer1 ? match.player2_song_name : match.player1_song_name;
        
        document.getElementById('fighter1Name').textContent = fighter1;
        document.getElementById('fighter2Name').textContent = fighter2;
    },
    
    updateHealthBars(health1, health2) {
        document.getElementById('health1').style.width = `${health1}%`;
        document.getElementById('health2').style.width = `${health2}%`;
        document.getElementById('healthText1').textContent = `${Math.round(health1)}%`;
        document.getElementById('healthText2').textContent = `${Math.round(health2)}%`;
    },
    
    showVictoryModal(match, winner, userWon) {
        const winnerName = winner === 1 ? match.player1_song_name : match.player2_song_name;
        const modal = document.getElementById('victoryModal');
        
        document.getElementById('victoryResult').textContent = userWon ? '¡Victoria!' : 'Derrota';
        document.getElementById('victoryWinner').textContent = winnerName;
        
        modal?.classList.remove('hidden');
    },
    
    setupEventListeners() {
        // Implementar listeners de cancelar búsqueda, salir de sala, etc.
    }
};

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', () => {
    if (window.supabaseClient) {
        GameManager.init();
    }
});
