// =========================================
// GAME ENGINE - MusicToken Ring
// Sistema completo funcional con todos los modos
// =========================================

const GameEngine = {
    currentMatch: null,
    currentMode: null,
    userBalance: 0,
    minBet: 100,
    battleDuration: 60,
    victoryAudioDuration: 15,
    userAudio: null,
    victoryAudio: null,
    
    // ==========================================
    // INICIALIZACIÓN
    // ==========================================
    
    async init() {
        console.log('🎮 Game Engine initializing...');
        await this.loadUserBalance();
        await this.loadGameConfig();
        this.setupRealtimeSubscriptions();
        console.log('✅ Game Engine ready!');
    },
    
    async loadUserBalance() {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) return;
            
            const { data, error } = await supabaseClient
                .from('user_balances')
                .select('balance')
                .eq('user_id', session.user.id)
                .maybeSingle();
            
            if (error) {
                console.error('Error loading balance:', error);
                return;
            }
            
            if (data) {
                this.userBalance = data.balance;
                this.updateBalanceDisplay();
            } else {
                // Usuario nuevo - balance inicial de 1000
                this.userBalance = 1000;
                this.updateBalanceDisplay();
            }
        } catch (error) {
            console.error('Error loading balance:', error);
        }
    },
    
    async loadGameConfig() {
        try {
            const { data } = await supabaseClient
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
    
    updateBalanceDisplay() {
        const balanceEl = document.getElementById('balanceDisplay');
        if (balanceEl) {
            balanceEl.textContent = `💰 ${this.userBalance} $MTOKEN`;
        }
        const userBalanceEl = document.getElementById('userBalance');
        if (userBalanceEl) {
            userBalanceEl.textContent = this.userBalance;
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
            
            showToast('Buscando oponente...', 'info');
            
            // Buscar oponente en cola
            const { data: opponents } = await supabaseClient
                .from('matchmaking_queue')
                .select('*')
                .neq('user_id', session.user.id)
                .gte('bet_amount', betAmount * 0.8)
                .lte('bet_amount', betAmount * 1.2)
                .order('created_at', { ascending: true })
                .limit(1);
            
            if (opponents && opponents.length > 0) {
                const opponent = opponents[0];
                
                // Crear match
                await this.createMatch('quick', session.user.id, opponent.user_id, song, opponent, betAmount, opponent.bet_amount);
                
                // Remover de cola
                await supabaseClient
                    .from('matchmaking_queue')
                    .delete()
                    .eq('id', opponent.id);
                
                showToast('¡Oponente encontrado!', 'success');
            } else {
                // Agregar a cola
                const { error } = await supabaseClient
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
                
                if (error) throw error;
                
                document.getElementById('songSelection').classList.add('hidden');
                document.getElementById('waitingScreen').classList.remove('hidden');
                
                // Polling para esperar oponente
                this.startMatchmakingPolling();
            }
        } catch (error) {
            console.error('Error joining quick match:', error);
            showToast('Error al buscar partida', 'error');
        }
    },
    
    startMatchmakingPolling() {
        let attempts = 0;
        const maxAttempts = 60; // 60 segundos
        
        this.matchmakingInterval = setInterval(async () => {
            attempts++;
            
            if (attempts > maxAttempts) {
                clearInterval(this.matchmakingInterval);
                await this.cancelMatchmaking();
                return;
            }
            
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            // Verificar si se creó un match
            const { data: matches } = await supabaseClient
                .from('matches')
                .select('*')
                .or(`player1_id.eq.${session.user.id},player2_id.eq.${session.user.id}`)
                .eq('status', 'ready')
                .order('created_at', { ascending: false })
                .limit(1);
            
            if (matches && matches.length > 0) {
                clearInterval(this.matchmakingInterval);
                await this.startMatch(matches[0].id);
            }
        }, 1000);
    },
    
    async cancelMatchmaking() {
        clearInterval(this.matchmakingInterval);
        
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        // Remover de cola
        await supabaseClient
            .from('matchmaking_queue')
            .delete()
            .eq('user_id', session.user.id);
        
        document.getElementById('waitingScreen').classList.add('hidden');
        document.getElementById('songSelection').classList.remove('hidden');
        
        showToast('Búsqueda cancelada', 'info');
    },
    
    // ==========================================
    // MODO SALA PRIVADA (Private Room)
    // ==========================================
    
    async createPrivateRoom(song, betAmount) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            // Generar código de sala
            const roomCode = this.generateRoomCode();
            
            // Crear match
            const { data: match, error: matchError } = await supabaseClient
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
            
            if (matchError) throw matchError;
            
            // Crear sala
            const { error: roomError } = await supabaseClient
                .from('private_rooms')
                .insert([{
                    room_code: roomCode,
                    creator_id: session.user.id,
                    match_id: match.id,
                    min_bet: betAmount,
                    status: 'open'
                }]);
            
            if (roomError) throw roomError;
            
            // Mostrar sala
            document.getElementById('songSelection').classList.add('hidden');
            document.getElementById('roomScreen').classList.remove('hidden');
            document.getElementById('roomCode').textContent = roomCode;
            
            showToast(`Sala creada: ${roomCode}`, 'success');
            
            // Esperar a que alguien se una
            this.waitForOpponent(match.id);
            
        } catch (error) {
            console.error('Error creating room:', error);
            showToast('Error al crear sala', 'error');
        }
    },
    
    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    },
    
    async joinPrivateRoom(roomCode, song, betAmount) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            // Buscar match
            const { data: match, error: matchError } = await supabaseClient
                .from('matches')
                .select('*')
                .eq('room_code', roomCode)
                .eq('status', 'waiting')
                .single();
            
            if (matchError || !match) {
                showToast('Sala no encontrada', 'error');
                return;
            }
            
            if (betAmount < match.player1_bet) {
                showToast(`Apuesta mínima de la sala: ${match.player1_bet} $MTOKEN`, 'error');
                return;
            }
            
            // Unirse al match
            const { error: updateError } = await supabaseClient
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
                .eq('id', match.id);
            
            if (updateError) throw updateError;
            
            // Actualizar sala
            await supabaseClient
                .from('private_rooms')
                .update({ status: 'full' })
                .eq('room_code', roomCode);
            
            showToast('¡Unido a la sala!', 'success');
            
            // Iniciar batalla
            await this.startMatch(match.id);
            
        } catch (error) {
            console.error('Error joining room:', error);
            showToast('Error al unirse a la sala', 'error');
        }
    },
    
    waitForOpponent(matchId) {
        this.roomWaitInterval = setInterval(async () => {
            const { data: match } = await supabaseClient
                .from('matches')
                .select('*')
                .eq('id', matchId)
                .single();
            
            if (match && match.status === 'ready') {
                clearInterval(this.roomWaitInterval);
                await this.startMatch(matchId);
            }
        }, 2000);
    },
    
    // ==========================================
    // MODO PRÁCTICA (Practice)
    // ==========================================
    
    async startPracticeMatch(userSong) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            // Generar canción random para CPU
            const cpuSongs = [
                { id: 'cpu1', name: 'Warrior Mode', artist: 'CPU Fighter', image: userSong.image, preview: userSong.preview },
                { id: 'cpu2', name: 'Battle Anthem', artist: 'Computer Champion', image: userSong.image, preview: userSong.preview },
                { id: 'cpu3', name: 'Victory March', artist: 'AI Opponent', image: userSong.image, preview: userSong.preview }
            ];
            
            const cpuSong = cpuSongs[Math.floor(Math.random() * cpuSongs.length)];
            
            const { data: match, error } = await supabaseClient
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
            
            if (error) throw error;
            
            showToast('¡Iniciando práctica!', 'success');
            await this.startMatch(match.id);
            
        } catch (error) {
            console.error('Error starting practice:', error);
            showToast('Error al iniciar práctica', 'error');
        }
    },
    
    // ==========================================
    // MODO TORNEO (Tournament)
    // ==========================================
    
    async createTournament(name, entryFee, maxParticipants) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            const { data: tournament, error } = await supabaseClient
                .from('tournaments')
                .insert([{
                    name: name,
                    entry_fee: entryFee,
                    prize_pool: 0,
                    max_participants: maxParticipants,
                    current_participants: 0,
                    status: 'registration'
                }])
                .select()
                .single();
            
            if (error) throw error;
            
            showToast(`Torneo "${name}" creado`, 'success');
            return tournament;
            
        } catch (error) {
            console.error('Error creating tournament:', error);
            showToast('Error al crear torneo', 'error');
        }
    },
    
    async joinTournament(tournamentId, song, betAmount) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            // Verificar balance
            const { data: tournament } = await supabaseClient
                .from('tournaments')
                .select('*')
                .eq('id', tournamentId)
                .single();
            
            if (betAmount < tournament.entry_fee) {
                showToast(`Entry fee: ${tournament.entry_fee} $MTOKEN`, 'error');
                return;
            }
            
            // Registrar participante
            const { error } = await supabaseClient
                .from('tournament_participants')
                .insert([{
                    tournament_id: tournamentId,
                    user_id: session.user.id
                }]);
            
            if (error) throw error;
            
            // Actualizar torneo
            await supabaseClient
                .from('tournaments')
                .update({
                    current_participants: tournament.current_participants + 1,
                    prize_pool: tournament.prize_pool + betAmount
                })
                .eq('id', tournamentId);
            
            // Descontar entrada
            await this.updateBalance(-betAmount, 'bet', null);
            
            showToast('¡Inscrito en el torneo!', 'success');
            
        } catch (error) {
            console.error('Error joining tournament:', error);
            showToast('Error al unirse al torneo', 'error');
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
            
            // Descontar apuesta
            await this.updateBalance(-bet1, 'bet', match.id);
            
            await this.startMatch(match.id);
            
        } catch (error) {
            console.error('Error creating match:', error);
        }
    },
    
    async startMatch(matchId) {
        try {
            // Ocultar todas las pantallas
            document.getElementById('songSelection')?.classList.add('hidden');
            document.getElementById('waitingScreen')?.classList.add('hidden');
            document.getElementById('roomScreen')?.classList.add('hidden');
            
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
            
            // Crear HTML de batalla
            this.createBattleUI(match);
            
            // Iniciar batalla
            await this.runBattle(match);
            
        } catch (error) {
            console.error('Error starting match:', error);
        }
    },
    
    createBattleUI(match) {
        const container = document.querySelector('.container');
        
        const battleHTML = `
            <section id="battleArena" class="battle-section">
                <div class="battle-arena-grid">
                    <!-- Fighter 1 -->
                    <div class="battle-card blue">
                        <div class="battle-avatar">
                            <img src="${match.player1_song_image}" alt="${match.player1_song_name}">
                        </div>
                        <h3 class="battle-name">${match.player1_song_name}</h3>
                        <p class="battle-artist">${match.player1_song_artist}</p>
                        <div class="health-bar">
                            <div class="health-fill blue" id="health1Fill" style="width: 100%">
                                <span class="health-text" id="health1Text">100%</span>
                            </div>
                        </div>
                        <div class="battle-bet">💰 ${match.player1_bet} $MTOKEN</div>
                    </div>
                    
                    <!-- VS -->
                    <div class="vs-divider">
                        <div class="vs-circle">
                            <span class="vs-text">VS</span>
                            <span class="timer" id="battleTimer">60</span>
                        </div>
                    </div>
                    
                    <!-- Fighter 2 -->
                    <div class="battle-card red">
                        <div class="battle-avatar">
                            <img src="${match.player2_song_image}" alt="${match.player2_song_name}">
                        </div>
                        <h3 class="battle-name">${match.player2_song_name}</h3>
                        <p class="battle-artist">${match.player2_song_artist}</p>
                        <div class="health-bar">
                            <div class="health-fill red" id="health2Fill" style="width: 100%">
                                <span class="health-text" id="health2Text">100%</span>
                            </div>
                        </div>
                        <div class="battle-bet">💰 ${match.player2_bet} $MTOKEN</div>
                    </div>
                </div>
            </section>
        `;
        
        container.innerHTML = battleHTML;
    },
    
    async runBattle(match) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const isPlayer1 = session.user.id === match.player1_id;
        
        // Reproducir SOLO la canción del usuario
        const userSong = isPlayer1 ? match.player1_song_preview : match.player2_song_preview;
        this.playUserSong(userSong);
        
        // Simular batalla
        let health1 = 100;
        let health2 = 100;
        let timeLeft = this.battleDuration;
        
        const battleInterval = setInterval(() => {
            timeLeft--;
            
            document.getElementById('battleTimer').textContent = timeLeft;
            
            // Daño aleatorio
            const damage1 = Math.random() * 3 + 1;
            const damage2 = Math.random() * 3 + 1;
            
            health1 -= damage2;
            health2 -= damage1;
            
            health1 = Math.max(0, health1);
            health2 = Math.max(0, health2);
            
            // Actualizar UI
            document.getElementById('health1Fill').style.width = `${health1}%`;
            document.getElementById('health2Fill').style.width = `${health2}%`;
            document.getElementById('health1Text').textContent = `${Math.round(health1)}%`;
            document.getElementById('health2Text').textContent = `${Math.round(health2)}%`;
            
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
        
        // Actualizar match
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
        
        // Reproducir canción ganadora
        const winnerSong = winner === 1 ? match.player1_song_preview : match.player2_song_preview;
        this.playVictorySong(winnerSong);
        
        // Procesar premios
        if (match.match_type !== 'practice') {
            if (userWon) {
                await this.updateBalance(match.total_pot, 'win', match.id);
            }
        } else {
            if (userWon) {
                await this.updateBalance(50, 'practice_reward', match.id);
            }
        }
        
        // Mostrar resultado después de 15 segundos
        setTimeout(() => {
            this.showVictoryScreen(match, winner, userWon);
        }, 15000);
    },
    
    showVictoryScreen(match, winner, userWon) {
        const winnerName = winner === 1 ? match.player1_song_name : match.player2_song_name;
        const prize = userWon ? match.total_pot : 0;
        
        const container = document.querySelector('.container');
        container.innerHTML = `
            <div class="victory-screen">
                <div class="victory-icon">${userWon ? '🏆' : '😔'}</div>
                <h1 class="victory-title">${userWon ? '¡VICTORIA!' : 'Derrota'}</h1>
                <h2 class="victory-winner">${winnerName}</h2>
                ${prize > 0 ? `<p class="victory-prize">+${prize} $MTOKEN</p>` : ''}
                <button onclick="location.reload()" class="btn-primary btn-large">
                    Jugar de Nuevo
                </button>
            </div>
        `;
    },
    
    // ==========================================
    // AUDIO
    // ==========================================
    
    playUserSong(url) {
        if (this.userAudio) this.userAudio.pause();
        this.userAudio = new Audio(url);
        this.userAudio.loop = true;
        this.userAudio.play();
    },
    
    stopUserSong() {
        if (this.userAudio) {
            this.userAudio.pause();
            this.userAudio = null;
        }
    },
    
    playVictorySong(url) {
        if (this.victoryAudio) this.victoryAudio.pause();
        this.victoryAudio = new Audio(url);
        this.victoryAudio.play();
        setTimeout(() => {
            if (this.victoryAudio) {
                this.victoryAudio.pause();
                this.victoryAudio = null;
            }
        }, this.victoryAudioDuration * 1000);
    },
    
    // ==========================================
    // BALANCE
    // ==========================================
    
    async updateBalance(amount, type, matchId = null) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            const { data } = await supabaseClient
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
    // REALTIME
    // ==========================================
    
    setupRealtimeSubscriptions() {
        // Escuchar cambios en matches
        supabaseClient
            .channel('matches')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'matches' 
            }, (payload) => {
                console.log('Match update:', payload);
            })
            .subscribe();
    }
};

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    if (window.supabaseClient) {
        window.GameEngine = GameEngine;
        console.log('🎮 GameEngine loaded!');
    }
});
