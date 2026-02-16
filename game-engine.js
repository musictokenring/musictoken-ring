// =========================================
// GAME ENGINE - MusicToken Ring
// Sistema completo funcional con todos los modos
// =========================================

const GameEngine = {
    currentMatch: null,
    currentMode: null,
    currentUserId: null,
    userBalance: 0,
    minBet: 100,
    battleDuration: 60,
    victoryAudioDuration: 15,
    platformFeeRate: 0.3,
    jackpotRate: 0.1,
    platformRevenueTarget: 100000,
    songsEloTableAvailable: Boolean(window?.MTR_ENABLE_SONGS_ELO),
    initialized: false,
    initPromise: null,
    eloRefreshIntervalId: null,
    userAudio: null,
    victoryAudio: null,
    connectedWallet: null,
    quickMatchChannel: null,
    pendingChallenge: null,
    currentRoomCode: null,
    currentPrivateMatchId: null,
    practiceDemoBalance: 0,
    practiceDemoInitialBalance: 1000,
    songsEloDisableKey: 'mtr_songs_elo_disabled_until',
    
    // ==========================================
    // INICIALIZACIÓN
    // ==========================================
    
    async init() {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            console.log('🎮 Game Engine initializing...');
            this.loadSongsEloAvailability();
            this.loadPracticeDemoBalance();
            await this.loadUserBalance();
            await this.loadGameConfig();
            this.loadStoredWallet();
            this.setupRealtimeSubscriptions();
            this.scheduleEloRefresh();
            this.initialized = true;
            console.log('✅ Game Engine ready!');
        })().finally(() => {
            this.initPromise = null;
        });

        return this.initPromise;
    },

    loadSongsEloAvailability() {
        const raw = localStorage.getItem(this.songsEloDisableKey);
        if (!raw) return;
        const disabledUntil = Number(raw);
        if (Number.isFinite(disabledUntil) && Date.now() < disabledUntil) {
            this.songsEloTableAvailable = false;
        } else {
            localStorage.removeItem(this.songsEloDisableKey);
        }
    },

    disableSongsEloTableForOneDay() {
        this.songsEloTableAvailable = false;
        localStorage.setItem(this.songsEloDisableKey, String(Date.now() + 24 * 60 * 60 * 1000));
    },

    loadPracticeDemoBalance() {
        const stored = parseInt(localStorage.getItem('mtr_practice_demo_balance') || `${this.practiceDemoInitialBalance}`, 10);
        this.practiceDemoBalance = Number.isFinite(stored) ? stored : this.practiceDemoInitialBalance;
    },

    setPracticeDemoBalance(amount) {
        this.practiceDemoBalance = Math.max(0, Math.round(amount));
        localStorage.setItem('mtr_practice_demo_balance', String(this.practiceDemoBalance));
    },

    updatePracticeBetDisplay() {
        const labelEl = document.getElementById('balanceLabel');
        const valueEl = document.getElementById('userBalance');
        if (labelEl) labelEl.textContent = 'Saldo real';
        if (valueEl) valueEl.textContent = this.userBalance;

        if (typeof window !== 'undefined' && window.currentMode === 'practice') {
            if (labelEl) labelEl.textContent = 'Saldo demo (práctica)';
            if (valueEl) valueEl.textContent = this.practiceDemoBalance;
        }
    },
    
    async loadUserBalance() {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) return;

            this.currentUserId = session.user.id;
            
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
                this.userBalance = Math.max(0, Math.round(data.balance || 0));
                this.updateBalanceDisplay();
            } else {
                // Usuario nuevo - saldo real inicia en cero hasta recarga
                this.userBalance = 0;
                this.updateBalanceDisplay();
            }
        } catch (error) {
            if (error?.name === 'AbortError' || String(error?.message || '').includes('aborted')) {
                console.warn('Carga de balance cancelada (AbortError).');
                return;
            }
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
                if (data.platform_fee_rate) this.platformFeeRate = data.platform_fee_rate;
                if (data.jackpot_rate) this.jackpotRate = data.jackpot_rate;
                if (data.platform_revenue_target) this.platformRevenueTarget = data.platform_revenue_target;
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
        this.updatePracticeBetDisplay();
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
            
            if (this.pendingChallenge) {
                await this.acceptQuickChallenge(song, betAmount, session.user.id);
                return;
            }

            showToast('Buscando oponente...', 'info');
            await this.broadcastQuickChallenge(song, betAmount, session.user.id);
            
            // Buscar oponente en cola
            const { data: opponents } = await supabaseClient
                .from('matchmaking_queue')
                .select('*')
                .neq('user_id', session.user.id)
                .gte('bet_amount', betAmount * 0.8)
                .lte('bet_amount', betAmount * 1.2)
                .order('created_at', { ascending: true })
                .limit(8);
            
            if (opponents && opponents.length > 0) {
                const eligibleOpponents = [];
                for (const candidate of opponents) {
                    const canBattle = await this.canMatchByElo(song.id, candidate.song_id);
                    if (canBattle.allowed) eligibleOpponents.push(candidate);
                }

                if (eligibleOpponents.length > 0) {
                    const opponent = eligibleOpponents[0];
                    await this.createMatch('quick', session.user.id, opponent.user_id, song, opponent, betAmount, opponent.bet_amount);

                    await supabaseClient
                        .from('matchmaking_queue')
                        .delete()
                        .eq('id', opponent.id);

                    showToast('¡Oponente encontrado!', 'success');
                } else {
                    showToast('Sin rival en rango ELO (<300). Te agregamos a la cola.', 'info');
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

                    document.getElementById('songSelection').classList.add('hidden');
                    document.getElementById('waitingScreen').classList.remove('hidden');
                    this.startMatchmakingPolling();
                }
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

    async broadcastQuickChallenge(song, betAmount, userId) {
        if (!this.quickMatchChannel) return;
        const payload = {
            type: 'challenge',
            from: userId,
            betAmount,
            song: {
                id: song.id,
                name: song.name,
                artist: song.artist,
                image: song.image,
                preview: song.preview
            }
        };
        await this.quickMatchChannel.send({
            type: 'broadcast',
            event: 'quick-challenge',
            payload
        });
    },

    async acceptQuickChallenge(song, betAmount, userId) {
        const challenge = this.pendingChallenge;
        if (!challenge) return;
        if (betAmount < challenge.betAmount) {
            showToast(`La apuesta debe ser mínimo ${challenge.betAmount} $MTOKEN`, 'error');
            return;
        }
        this.pendingChallenge = null;

        await this.createMatch(
            'quick',
            userId,
            challenge.from,
            song,
            {
                song_id: challenge.song.id,
                song_name: challenge.song.name,
                song_artist: challenge.song.artist,
                song_image: challenge.song.image,
                song_preview: challenge.song.preview
            },
            betAmount,
            challenge.betAmount
        );

        await this.quickMatchChannel.send({
            type: 'broadcast',
            event: 'quick-challenge-response',
            payload: {
                type: 'accepted',
                from: userId,
                to: challenge.from
            }
        });
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

            this.currentRoomCode = roomCode;
            this.currentPrivateMatchId = match.id;
            
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
            const linkEl = document.getElementById('roomInviteLink');
            if (linkEl) {
                linkEl.value = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
            }
            
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
            

            const eloGate = await this.canMatchByElo(song.id, match.player1_song_id);
            if (!eloGate.allowed) {
                showToast(`Matchmaking ELO bloqueado: diferencia ${eloGate.diff} (>300)`, 'error');
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

    async leavePrivateRoom() {
        try {
            clearInterval(this.roomWaitInterval);

            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) {
                showToast('Sesión no encontrada', 'error');
                return;
            }

            if (this.currentRoomCode) {
                await supabaseClient
                    .from('private_rooms')
                    .delete()
                    .eq('room_code', this.currentRoomCode)
                    .eq('creator_id', session.user.id);
            }

            if (this.currentPrivateMatchId) {
                await supabaseClient
                    .from('matches')
                    .delete()
                    .eq('id', this.currentPrivateMatchId)
                    .eq('player1_id', session.user.id);
            }

            this.currentRoomCode = null;
            this.currentPrivateMatchId = null;

            document.getElementById('roomScreen')?.classList.add('hidden');
            document.getElementById('songSelection')?.classList.add('hidden');
            document.getElementById('modeSelector')?.classList.remove('hidden');

            showToast('Sala cerrada', 'info');
        } catch (error) {
            console.error('Error leaving room:', error);
            showToast('Error al salir de la sala', 'error');
        }
    },
    
    // ==========================================
    // MODO PRÁCTICA (Practice)
    // ==========================================
    
    async startPracticeMatch(userSong, demoBet = 100) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();

            const normalizedBet = Math.max(this.minBet, Math.round(demoBet || this.minBet));
            if (normalizedBet > this.practiceDemoBalance) {
                showToast(`Saldo demo insuficiente. Disponible: ${this.practiceDemoBalance} $MTOKEN`, 'error');
                return;
            }

            this.setPracticeDemoBalance(this.practiceDemoBalance - normalizedBet);
            this.updatePracticeBetDisplay();
            
            const cpuSong = await this.fetchCpuOpponentByElo(userSong);
            
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
                    player1_bet: normalizedBet,
                    player2_song_id: cpuSong.id,
                    player2_song_name: cpuSong.name,
                    player2_song_artist: cpuSong.artist,
                    player2_song_image: cpuSong.image,
                    player2_song_preview: cpuSong.preview,
                    player2_bet: normalizedBet,
                    total_pot: normalizedBet * 2,
                    status: 'ready'
                }])
                .select()
                .single();
            
            if (error) throw error;
            
            showToast(`¡Iniciando práctica con ${normalizedBet} $MTOKEN demo!`, 'success');
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
            const {
                platformFee,
                jackpotContribution,
                platformNet,
                prizeContribution
            } = this.calculateTournamentEntry(betAmount);
            await supabaseClient
                .from('tournaments')
                .update({
                    current_participants: tournament.current_participants + 1,
                    prize_pool: tournament.prize_pool + prizeContribution
                })
                .eq('id', tournamentId);

            this.addToPlatformRevenue(platformNet);
            this.addToJackpotPool(jackpotContribution);
            
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
                        <div class="battle-plays">🎧 Reproducciones: <span id="plays1">0</span></div>
                        <div class="battle-bet">💰 ${match.player1_bet} $MTOKEN</div>
                    </div>
                    
                    <!-- VS -->
                    <div class="vs-divider">
                        <div class="vs-circle">
                            <span class="vs-text">VS</span>
                            <span class="timer" id="battleTimer">60</span>
                        </div>
                        <div id="battleRhythm" class="battle-rhythm beat-a" aria-label="Animación de batalla musical">
                            <div class="rhythm-fighter left" aria-hidden="true">
                                <span class="fighter-head"><span class="fighter-face">😐</span></span>
                                <span class="fighter-body"></span>
                                <span class="fighter-arm front"></span>
                                <span class="fighter-arm back"></span>
                                <span class="fighter-leg front"></span>
                                <span class="fighter-leg back"></span>
                                <span class="fighter-hit" id="leftHitFx">♪</span>
                            </div>
                            <div class="rhythm-stage" aria-hidden="true"></div>
                            <div class="rhythm-fighter right" aria-hidden="true">
                                <span class="fighter-head"><span class="fighter-face">😐</span></span>
                                <span class="fighter-body"></span>
                                <span class="fighter-arm front"></span>
                                <span class="fighter-arm back"></span>
                                <span class="fighter-leg front"></span>
                                <span class="fighter-leg back"></span>
                                <span class="fighter-hit" id="rightHitFx">♫</span>
                            </div>
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
                        <div class="battle-plays">🎧 Reproducciones: <span id="plays2">0</span></div>
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
        
        const oracleStats = await this.fetchOracleStats(match);
        const basePlays1 = oracleStats.player1Projected;
        const basePlays2 = oracleStats.player2Projected;
        let plays1 = 0;
        let plays2 = 0;
        let health1 = 100;
        let health2 = 100;
        let timeLeft = this.battleDuration;
        
        const battleInterval = setInterval(() => {
            timeLeft--;
            
            document.getElementById('battleTimer').textContent = timeLeft;

            plays1 += this.calculatePlaysIncrement(basePlays1);
            plays2 += this.calculatePlaysIncrement(basePlays2);
            this.updateBattleRhythmAnimation(timeLeft, plays1, plays2);

            const totalPlays = plays1 + plays2;
            const share1 = totalPlays > 0 ? (plays1 / totalPlays) * 100 : 50;
            const share2 = 100 - share1;
            health1 = Math.max(0, Math.min(100, share1));
            health2 = Math.max(0, Math.min(100, share2));
            
            // Actualizar UI
            document.getElementById('health1Fill').style.width = `${health1}%`;
            document.getElementById('health2Fill').style.width = `${health2}%`;
            document.getElementById('health1Text').textContent = `${Math.round(health1)}%`;
            document.getElementById('health2Text').textContent = `${Math.round(health2)}%`;
            document.getElementById('plays1').textContent = Math.round(plays1).toLocaleString('es-ES');
            document.getElementById('plays2').textContent = Math.round(plays2).toLocaleString('es-ES');
            
            // Fin de batalla
            if (timeLeft <= 0) {
                clearInterval(battleInterval);
                this.endBattle(match, health1, health2, isPlayer1, plays1, plays2);
            }
        }, 1000);
    },
    updateBattleRhythmAnimation(timeLeft, plays1, plays2) {
        const rhythmEl = document.getElementById('battleRhythm');
        if (!rhythmEl) return;

        const totalPlays = Math.max(1, plays1 + plays2);
        const diff = plays1 - plays2;
        const leadRatio = Math.abs(diff) / totalPlays;
        const impactPulse = timeLeft % 4 === 0;
        const phaseClass = timeLeft % 2 === 0 ? 'beat-a' : 'beat-b';
        const intensity = Math.min(1, 0.35 + leadRatio * 3 + (this.battleDuration - timeLeft) / Math.max(1, this.battleDuration));

        let leftApproach = 12;
        let rightApproach = 12;

        const leftFade = diff >= 0 ? 1 : Math.max(0.35, 1 - leadRatio * 3);
        const rightFade = diff <= 0 ? 1 : Math.max(0.35, 1 - leadRatio * 3);

        rhythmEl.style.setProperty('--battle-intensity', intensity.toFixed(2));
        rhythmEl.style.setProperty('--left-approach', `${leftApproach}px`);
        rhythmEl.style.setProperty('--right-approach', `${rightApproach}px`);
        rhythmEl.style.setProperty('--left-fade', leftFade.toFixed(2));
        rhythmEl.style.setProperty('--right-fade', rightFade.toFixed(2));

        rhythmEl.classList.remove(
            'beat-a', 'beat-b', 'left-attack', 'right-attack', 'pressure-left', 'pressure-right',
            'impact-pulse', 'clash', 'climax', 'battle-finished', 'winner-left', 'winner-right', 'loser-left', 'loser-right'
        );
        rhythmEl.classList.add(phaseClass);

        if (leadRatio >= 0.16) {
            rhythmEl.classList.add(diff > 0 ? 'left-attack' : 'right-attack');
            if (diff > 0) {
                leftApproach = 32;
                rightApproach = 24;
            } else {
                leftApproach = 24;
                rightApproach = 32;
            }
        } else if (leadRatio >= 0.08) {
            rhythmEl.classList.add(diff > 0 ? 'pressure-left' : 'pressure-right');
            if (diff > 0) {
                leftApproach = 24;
                rightApproach = 18;
            } else {
                leftApproach = 18;
                rightApproach = 24;
            }
        } else {
            rhythmEl.classList.add('clash');
            leftApproach = 28;
            rightApproach = 28;
        }

        if (impactPulse) {
            rhythmEl.classList.add('impact-pulse');
        }

        if (timeLeft <= 10) {
            rhythmEl.classList.add('climax');
            leftApproach += 4;
            rightApproach += 4;
        }

        rhythmEl.style.setProperty('--left-approach', `${leftApproach}px`);
        rhythmEl.style.setProperty('--right-approach', `${rightApproach}px`);
    },

    finalizeBattleRhythmAnimation(winner) {
        const rhythmEl = document.getElementById('battleRhythm');
        if (!rhythmEl) return;

        const leftFace = rhythmEl.querySelector('.rhythm-fighter.left .fighter-face');
        const rightFace = rhythmEl.querySelector('.rhythm-fighter.right .fighter-face');

        rhythmEl.classList.add('battle-finished');
        rhythmEl.classList.remove('left-attack', 'right-attack', 'pressure-left', 'pressure-right', 'impact-pulse', 'clash');

        if (winner === 1) {
            rhythmEl.classList.add('winner-left', 'loser-right');
            rhythmEl.style.setProperty('--left-fade', '1');
            rhythmEl.style.setProperty('--right-fade', '0.3');
            if (leftFace) leftFace.textContent = '😄';
            if (rightFace) rightFace.textContent = '😞';
        } else {
            rhythmEl.classList.add('winner-right', 'loser-left');
            rhythmEl.style.setProperty('--left-fade', '0.3');
            rhythmEl.style.setProperty('--right-fade', '1');
            if (leftFace) leftFace.textContent = '😞';
            if (rightFace) rightFace.textContent = '😄';
        }
    },

    goToPracticeSelection() {
        try {
            if (typeof window !== 'undefined' && window.location) {
                const url = new URL(window.location.href);
                url.searchParams.set('mode', 'practice');
                window.location.href = `${url.pathname}${url.search}`;
                return;
            }
        } catch (error) {
            console.warn('No se pudo redirigir a práctica:', error);
        }
        window.location.reload();
    },

    async endBattle(match, health1, health2, isPlayer1, plays1, plays2) {
        const winner = plays1 > plays2 ? 1 : 2;
        const userWon = (isPlayer1 && winner === 1) || (!isPlayer1 && winner === 2);
        const payouts = this.calculateMatchPayouts(match.total_pot);
        
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
                player1_streams: Math.round(plays1),
                player2_streams: Math.round(plays2),
                finished_at: new Date().toISOString()
            })
            .eq('id', match.id);
        
        // Reproducir canción ganadora
        const winnerSong = winner === 1 ? match.player1_song_preview : match.player2_song_preview;
        this.playVictorySong(winnerSong);
        
        // Procesar premios
        if (match.match_type !== 'practice') {
            if (userWon) {
                await this.updateBalance(payouts.winnerPayout, 'win', match.id);
            }
            this.addToPlatformRevenue(payouts.platformFee);
            await this.logPlatformFeeTransaction(match.id, payouts.platformFee);
        } else {
            if (userWon) {
                await this.updateBalance(50, 'practice_reward', match.id);
            }
        }
        
        this.finalizeBattleRhythmAnimation(winner);

        // Mostrar resultado después de 15 segundos
        setTimeout(() => {
            this.showVictoryScreen(match, winner, userWon, payouts);
        }, 15000);
    },
    
    showVictoryScreen(match, winner, userWon, payouts) {
        const winnerName = winner === 1 ? match.player1_song_name : match.player2_song_name;
        const prize = userWon ? payouts.winnerPayout : 0;
        const platformWallet = this.getPlatformWalletAddress();
        const payoutNetwork = this.getPreferredNetwork();
        
        const container = document.querySelector('.container');
        container.innerHTML = `
            <div class="victory-screen">
                <div class="victory-icon">${userWon ? '🏆' : '😔'}</div>
                <h1 class="victory-title">${userWon ? '¡VICTORIA!' : 'Derrota'}</h1>
                <h2 class="victory-winner">${winnerName}</h2>
                ${prize > 0 ? `<p class="victory-prize">+${prize} $MTOKEN</p>` : ''}
                ${match.match_type !== 'practice' ? `
                    <div class="victory-breakdown">
                        <p>Comisión plataforma: ${payouts.platformFee} $MTOKEN</p>
                        <p>Pago al ganador: ${payouts.winnerPayout} $MTOKEN</p>
                        <p>Red de cobro: ${payoutNetwork.toUpperCase()}</p>
                        <p>Billetera plataforma: ${platformWallet}</p>
                    </div>
                ` : ''}
                <button onclick="${match.match_type === 'practice' ? 'GameEngine.goToPracticeSelection()' : 'location.reload()'}" class="btn-primary btn-large">
                    ${match.match_type === 'practice' ? 'Continuar en práctica' : 'Jugar de Nuevo'}
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
        if (!url) return;
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
    // ORÁCULOS & CPU
    // ==========================================

    async fetchDeezerJsonp(url) {
        return new Promise((resolve, reject) => {
            const callbackName = `deezerOracle_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            window[callbackName] = function(data) {
                delete window[callbackName];
                const scriptEl = document.getElementById(callbackName);
                if (scriptEl) scriptEl.remove();
                resolve(data);
            };

            const script = document.createElement('script');
            script.id = callbackName;
            script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${callbackName}`;
            script.onerror = () => {
                delete window[callbackName];
                script.remove();
                reject(new Error('JSONP request failed'));
            };
            document.head.appendChild(script);
        });
    },

    async fetchTrackDetails(trackId) {
        try {
            return await this.fetchDeezerJsonp(`https://api.deezer.com/track/${trackId}`);
        } catch (error) {
            console.warn('No se pudo obtener detalle Deezer:', error);
            return null;
        }
    },

    async fetchRelatedArtists(artistId) {
        try {
            const data = await this.fetchDeezerJsonp(`https://api.deezer.com/artist/${artistId}/related`);
            return data?.data || [];
        } catch (error) {
            console.warn('No se pudo obtener artistas relacionados:', error);
            return [];
        }
    },

    async fetchChartTracks() {
        try {
            const data = await this.fetchDeezerJsonp('https://api.deezer.com/chart/0/tracks?limit=20');
            return data?.data || [];
        } catch (error) {
            console.warn('No se pudo obtener chart tracks:', error);
            return [];
        }
    },

    async fetchSearchTracks(query) {
        try {
            const data = await this.fetchDeezerJsonp(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=20`);
            return data?.data || [];
        } catch (error) {
            console.warn('No se pudo obtener búsqueda Deezer:', error);
            return [];
        }
    },

    async fetchTopTrackForArtist(artistId) {
        try {
            const data = await this.fetchDeezerJsonp(`https://api.deezer.com/artist/${artistId}/top?limit=6`);
            const tracks = data?.data || [];
            return tracks.find(track => track.preview) || tracks[0];
        } catch (error) {
            console.warn('No se pudo obtener top tracks:', error);
            return null;
        }
    },

    pickCpuTrack(tracks, userSong) {
        if (!tracks || tracks.length === 0) return null;
        const differentArtist = tracks.find(track => {
            const artistName = track.artist?.name?.toLowerCase();
            const sameArtist = artistName === userSong.artist.toLowerCase();
            const cover = track.album?.cover_big || track.album?.cover_medium;
            return track.preview && cover && cover !== userSong.image && !sameArtist;
        });
        if (differentArtist) return differentArtist;

        const differentCover = tracks.find(track => {
            const cover = track.album?.cover_big || track.album?.cover_medium;
            return track.preview && cover && cover !== userSong.image;
        });
        if (differentCover) return differentCover;

        return tracks.find(track => track.preview) || tracks[0];
    },

    async fetchCpuOpponentTrack(userSong) {
        const userDetails = await this.fetchTrackDetails(userSong.id);
        const artistId = userDetails?.artist?.id;
        if (artistId) {
            const relatedArtists = await this.fetchRelatedArtists(artistId);
            for (const artist of relatedArtists) {
                if (artist.name?.toLowerCase() === userSong.artist.toLowerCase()) continue;
                const topTrack = await this.fetchTopTrackForArtist(artist.id);
                if (!topTrack) continue;
                const cpuTrack = {
                    id: topTrack.id,
                    name: topTrack.title,
                    artist: topTrack.artist?.name || artist.name,
                    image: topTrack.album?.cover_big || topTrack.album?.cover_medium,
                    preview: topTrack.preview,
                    rank: topTrack.rank
                };
                if (cpuTrack.image && cpuTrack.image !== userSong.image) {
                    return cpuTrack;
                }
            }
        }

        const chartTracks = await this.fetchChartTracks();
        const chartPick = this.pickCpuTrack(chartTracks, userSong);
        if (chartPick) {
            return {
                id: chartPick.id,
                name: chartPick.title,
                artist: chartPick.artist?.name,
                image: chartPick.album?.cover_big || chartPick.album?.cover_medium,
                preview: chartPick.preview,
                rank: chartPick.rank
            };
        }

        const searchTracks = await this.fetchSearchTracks(`${userSong.artist} hits`);
        const searchPick = this.pickCpuTrack(searchTracks, userSong);
        if (searchPick) {
            return {
                id: searchPick.id,
                name: searchPick.title,
                artist: searchPick.artist?.name,
                image: searchPick.album?.cover_big || searchPick.album?.cover_medium,
                preview: searchPick.preview,
                rank: searchPick.rank
            };
        }

        return {
            id: `cpu_fallback_${Date.now()}`,
            name: 'Rival Generado',
            artist: 'CPU Challenger',
            image: 'https://via.placeholder.com/500x500.png?text=CPU+Rival',
            preview: userSong.preview
        };
    },

    async fetchOracleStats(match) {
        const [track1, track2] = await Promise.all([
            this.fetchTrackDetails(match.player1_song_id),
            this.fetchTrackDetails(match.player2_song_id)
        ]);
        const projected1 = track1?.rank || Math.floor(Math.random() * 800000) + 200000;
        const projected2 = track2?.rank || Math.floor(Math.random() * 800000) + 200000;
        return {
            player1Projected: projected1,
            player2Projected: projected2
        };
    },

    calculatePlaysIncrement(projectedPlays) {
        const base = projectedPlays / this.battleDuration;
        const variance = 0.7 + Math.random() * 0.6;
        return base * variance;
    },

    // ==========================================
    // WALLETS & PAYOUTS
    // ==========================================

    loadStoredWallet() {
        const stored = localStorage.getItem('mtr_wallet');
        if (stored) {
            this.connectedWallet = stored;
            this.updateWalletDisplay();
        }
    },

    async connectWallet() {
        if (!window.ethereum || !window.ethereum.isMetaMask) {
            showToast('Instala MetaMask para conectar tu billetera', 'error');
            return;
        }
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
            const chainId = Number.parseInt(chainIdHex, 16);
            if (accounts && accounts.length > 0) {
                this.connectedWallet = accounts[0];
                localStorage.setItem('mtr_wallet', accounts[0]);
                localStorage.setItem('mtr_wallet_chain', this.getChainNameFromId(chainId));
                this.updateWalletDisplay();
                showToast('Wallet conectada', 'success');
            }
        } catch (error) {
            console.error('Error conectando wallet:', error);
            showToast('No se pudo conectar la wallet', 'error');
        }
    },

    updateWalletDisplay() {
        const walletEl = document.getElementById('walletAddress');
        if (walletEl && this.connectedWallet) {
            walletEl.textContent = `${this.connectedWallet.slice(0, 6)}...${this.connectedWallet.slice(-4)}`;
            walletEl.classList.remove('hidden');
        }
    },
    getChainNameFromId(chainId) {
        const map = {
            1: 'ethereum',
            10: 'optimism',
            56: 'bnb',
            137: 'polygon',
            42161: 'arbitrum',
            59144: 'linea',
            8453: 'base',
            80001: 'polygon',
            11155111: 'ethereum'
        };
        return map[chainId] || 'polygon';
    },


    getPreferredNetwork() {
        const configured = localStorage.getItem('mtr_preferred_network');
        if (configured) return configured;

        const connectedChain = localStorage.getItem('mtr_wallet_chain');
        if (connectedChain) return connectedChain;

        return 'polygon';
    },

    getPlatformWalletAddress() {
        const addresses = window.PLATFORM_WALLET_ADDRESSES || {};
        const preferredOrder = [
            this.getPreferredNetwork(),
            'polygon',
            'ethereum',
            'optimism',
            'base',
            'arbitrum',
            'bnb',
            'linea',
            'tron',
            'solana',
            'bitcoin'
        ];

        for (const chainKey of preferredOrder) {
            if (addresses[chainKey]) return addresses[chainKey];
        }

        return 'PENDIENTE_CONFIGURAR';
    },

    calculatePoolSplit(totalAmount, feeRate = this.platformFeeRate) {
        if (!totalAmount) {
            return { platformFee: 0, netPool: 0 };
        }

        const normalizedFeeRate = Math.max(0, Math.min(1, Number(feeRate) || 0));
        const platformFee = Math.round(totalAmount * normalizedFeeRate);
        const netPool = Math.max(0, totalAmount - platformFee);

        return { platformFee, netPool };
    },

    calculateMatchPayouts(totalPot) {
        const split = this.calculatePoolSplit(totalPot, this.platformFeeRate);
        return {
            platformFee: split.platformFee,
            winnerPayout: split.netPool
        };
    },

    calculateTournamentEntry(entryFee) {
        const split = this.calculatePoolSplit(entryFee, this.platformFeeRate);
        const platformFee = split.platformFee;
        const threshold = this.platformRevenueTarget * 0.9;
        const currentRevenue = this.getPlatformRevenue();
        const jackpotContribution = currentRevenue >= threshold
            ? Math.round(platformFee * this.jackpotRate)
            : 0;
        const platformNet = Math.max(0, platformFee - jackpotContribution);
        const prizeContribution = split.netPool;
        return {
            platformFee,
            jackpotContribution,
            platformNet,
            prizeContribution,
            threshold
        };
    },


    scheduleEloRefresh() {
        if (this.eloRefreshIntervalId) return;
        this.refreshSongEloScores();
        this.eloRefreshIntervalId = setInterval(() => this.refreshSongEloScores(), 2 * 60 * 60 * 1000);
    },

    async refreshSongEloScores() {
        if (!this.songsEloTableAvailable) {
            return;
        }

        try {
            const tracks = await this.fetchChartTracks();
            const top = (tracks || []).slice(0, 24);
            for (const track of top) {
                const avg24h = Math.max(1, Math.round((track.rank || 1000) / 1000));
                const { error } = await supabaseClient
                    .from('songs_elo')
                    .upsert({
                        track_id: String(track.id),
                        elo_score: avg24h,
                        last_update: new Date().toISOString()
                    }, { onConflict: 'track_id' });

                if (error) {
                    if (
                        error.code === 'PGRST205' ||
                        error.status === 404 ||
                        error.message?.includes('relation') ||
                        error.message?.includes('songs_elo')
                    ) {
                        this.disableSongsEloTableForOneDay();
                        console.warn('La tabla songs_elo no existe en Supabase. Se desactiva el refresh automático de ELO.');
                        break;
                    }
                    throw error;
                }
            }

            if (this.songsEloTableAvailable) {
                localStorage.setItem('mtr_last_elo_refresh', new Date().toISOString());
            }
        } catch (error) {
            console.warn('No se pudo refrescar songs_elo:', error);
        }
    },

    async getSongElo(trackId) {
        if (!this.songsEloTableAvailable) {
            return 1000;
        }

        try {
            const { data, error } = await supabaseClient
                .from('songs_elo')
                .select('elo_score')
                .eq('track_id', String(trackId))
                .maybeSingle();

            if (error) {
                if (error.code === 'PGRST205' || error.status === 404 || error.message?.includes('relation') || error.message?.includes('songs_elo')) {
                    this.disableSongsEloTableForOneDay();
                    return 1000;
                }
                throw error;
            }

            if (data?.elo_score) return Number(data.elo_score);

            const { error: upsertError } = await supabaseClient
                .from('songs_elo')
                .upsert({
                    track_id: String(trackId),
                    elo_score: 1000,
                    last_update: new Date().toISOString()
                }, { onConflict: 'track_id' });

            if (upsertError) {
                if (upsertError.code === 'PGRST205' || upsertError.status === 404 || upsertError.message?.includes('relation') || upsertError.message?.includes('songs_elo')) {
                    this.disableSongsEloTableForOneDay();
                }
                return 1000;
            }

            return 1000;
        } catch {
            return 1000;
        }
    },

    async ensureSongEligibleForMatchmaking(trackId) {
        const elo = await this.getSongElo(trackId);
        return { allowed: Number.isFinite(elo), elo };
    },

    async canMatchByElo(trackIdA, trackIdB) {
        const [a, b] = await Promise.all([this.getSongElo(trackIdA), this.getSongElo(trackIdB)]);
        const diff = Math.abs((a || 1000) - (b || 1000));
        return { allowed: diff < 300, diff, a, b };
    },

    async fetchCpuOpponentByElo(userSong) {
        for (let i = 0; i < 4; i++) {
            const cpuSong = await this.fetchCpuOpponentTrack(userSong);
            const gate = await this.canMatchByElo(userSong.id, cpuSong.id);
            if (gate.allowed) return cpuSong;
        }
        return this.fetchCpuOpponentTrack(userSong);
    },

    async logPlatformFeeTransaction(matchId, amount) {
        if (!amount || amount <= 0) return;
        try {
            await supabaseClient
                .from('transactions')
                .insert([{
                    match_id: matchId,
                    type: 'fee',
                    amount,
                    created_at: new Date().toISOString()
                }]);
        } catch (error) {
            console.warn('No se pudo registrar comisión fee:', error);
        }
    },

    addToPlatformRevenue(amount) {
        const current = parseInt(localStorage.getItem('mtr_platform_revenue') || '0', 10);
        localStorage.setItem('mtr_platform_revenue', current + amount);
    },

    getPlatformRevenue() {
        return parseInt(localStorage.getItem('mtr_platform_revenue') || '0', 10);
    },

    addToJackpotPool(amount) {
        const current = parseInt(localStorage.getItem('mtr_jackpot_pool') || '0', 10);
        localStorage.setItem('mtr_jackpot_pool', current + amount);
    },

    getJackpotPool() {
        return parseInt(localStorage.getItem('mtr_jackpot_pool') || '0', 10);
    },

    // ==========================================
    // DEPOSITOS / LIQUIDACION (BACKEND VERIFY)
    // ==========================================

    getBackendApiBase() {
        if (window.CONFIG?.BACKEND_API) return window.CONFIG.BACKEND_API;
        if (window.APP_BACKEND_API) return window.APP_BACKEND_API;
        return '';
    },

    async backendRequest(path, payload = {}) {
        const base = this.getBackendApiBase();
        if (!base) {
            showToast('Backend API no configurada', 'error');
            return null;
        }

        const { data: { session } } = await supabaseClient.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(`${base}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify(payload)
        });

        let data = null;
        try {
            data = await response.json();
        } catch {
            data = null;
        }

        if (!response.ok) {
            const message = data?.message || `Error ${response.status}`;
            showToast(message, 'error');
            return null;
        }

        return data;
    },

    async verifyDepositAndCredit(txHash, options = {}) {
        if (!txHash || txHash.length < 12) {
            showToast('Hash inválido', 'error');
            return null;
        }

        try {
            const data = await this.backendRequest('/api/deposits/verify', {
                txHash,
                network: options.network || this.getPreferredNetwork(),
                expectedAmount: options.expectedAmount || null,
                walletAddress: this.connectedWallet || localStorage.getItem('mtr_wallet') || null
            });

            if (!data) return null;

            if (typeof data.newBalance === 'number') {
                this.userBalance = data.newBalance;
                this.updateBalanceDisplay();
            } else {
                await this.loadUserBalance();
            }

            return data;
        } catch (error) {
            console.error('Error verifying deposit:', error);
            showToast('No se pudo verificar la recarga', 'error');
            return null;
        }
    },

    async getUsdSettlementQuote(tokenAmount) {
        try {
            const data = await this.backendRequest('/api/settlement/quote', {
                tokenAmount,
                network: this.getPreferredNetwork()
            });
            return data;
        } catch (error) {
            console.error('Error getting settlement quote:', error);
            showToast('No se pudo obtener la cotización', 'error');
            return null;
        }
    },

    async requestCashout(tokenAmount, options = {}) {
        if (tokenAmount > this.userBalance) {
            showToast('No tienes saldo suficiente para retirar', 'error');
            return null;
        }

        try {
            const data = await this.backendRequest('/api/settlement/request-cashout', {
                tokenAmount,
                network: options.network || this.getPreferredNetwork(),
                walletAddress: this.connectedWallet || localStorage.getItem('mtr_wallet') || null,
                stableCurrency: 'USDs'
            });

            if (!data) return null;

            if (typeof data.newBalance === 'number') {
                this.userBalance = data.newBalance;
                this.updateBalanceDisplay();
            } else {
                await this.loadUserBalance();
            }

            return data;
        } catch (error) {
            console.error('Error requesting cashout:', error);
            showToast('No se pudo solicitar el retiro', 'error');
            return null;
        }
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

        this.quickMatchChannel = supabaseClient.channel('quick-match');
        this.quickMatchChannel
            .on('broadcast', { event: 'quick-challenge' }, (payload) => {
                const { from, betAmount, song } = payload.payload || {};
                if (!from || !song) return;
                if (this.currentUserId && from === this.currentUserId) return;
                this.pendingChallenge = { from, betAmount, song };
                if (typeof window.showIncomingChallenge === 'function') {
                    window.showIncomingChallenge(this.pendingChallenge);
                } else {
                    showToast('Tienes un reto rápido disponible', 'info');
                }
            })
            .on('broadcast', { event: 'quick-challenge-response' }, (payload) => {
                const { type } = payload.payload || {};
                if (type === 'accepted') {
                    showToast('Tu reto fue aceptado', 'success');
                }
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
