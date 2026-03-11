// =========================================
// GAME ENGINE - MusicToken Ring
// Sistema completo funcional con todos los modos
// =========================================

// Constante global para mínimo de apuesta (aplica a todos los modos con apuesta real)
const MIN_BET_AMOUNT = 5; // créditos (~$5 USDC, ya que créditos son estables 1:1)
const MIN_BET_TORNEO = 5; // mismo mínimo para Torneo (puede ajustarse después si se desea)

const GameEngine = {
    currentMatch: null,
    currentMode: null,
    currentUserId: null,
    userBalance: 0,
    minBet: MIN_BET_AMOUNT, // Usar constante global
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
    lastPrizeTxHash: null,
    quickMatchChannel: null,
    pendingChallenge: null,
    currentRoomCode: null,
    currentPrivateMatchId: null,
    practiceDemoBalance: 0,
    practiceDemoInitialBalance: 1000,
    songsEloDisableKey: 'mtr_songs_elo_disabled_until',
    streamsRealtime: null, // Will be initialized when StreamsRealtime module loads
    activeStreamTracking: null, // Current match ID being tracked
    
    // ==========================================
    // INICIALIZACIÓN
    // ==========================================
    
    async init() {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            // Logs de inicialización comentados para reducir ruido
            // console.log('🎮 Game Engine initializing...');
            try {
                this.loadSongsEloAvailability();
                this.loadPracticeDemoBalance();
                await this.loadUserBalance();
                await this.loadGameConfig();
                this.loadStoredWallet();
                this.setupRealtimeSubscriptions();
                this.scheduleEloRefresh();
                
                // Actualizar display después de cargar balances
                this.updatePracticeBetDisplay();
            } catch (initError) {
                console.error('Error during GameEngine initialization:', initError);
            }
            
            this.initialized = true;
            // console.log('✅ Game Engine ready!');
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
        try {
            const stored = localStorage.getItem('mtr_practice_demo_balance');
            if (stored !== null) {
                const parsed = parseInt(stored, 10);
                if (Number.isFinite(parsed) && parsed > 0) {
                    this.practiceDemoBalance = parsed;
                    return;
                }
            }
            // Si no hay valor válido en localStorage, establecer el inicial
            this.practiceDemoBalance = this.practiceDemoInitialBalance;
            localStorage.setItem('mtr_practice_demo_balance', String(this.practiceDemoBalance));
            // Log comentado para reducir ruido
            // console.log('[practice] Demo balance inicializado a', this.practiceDemoBalance);
        } catch (e) {
            console.error('[practice] Error cargando demo balance:', e);
            this.practiceDemoBalance = this.practiceDemoInitialBalance;
            localStorage.setItem('mtr_practice_demo_balance', String(this.practiceDemoBalance));
        }
    },

    setPracticeDemoBalance(amount) {
        this.practiceDemoBalance = Math.max(0, Math.round(amount));
        localStorage.setItem('mtr_practice_demo_balance', String(this.practiceDemoBalance));
    },

    updatePracticeBetDisplay() {
        // CRÍTICO: Protección contra loops infinitos
        // Evitar ejecuciones múltiples simultáneas
        if (this._updatingPracticeDisplay) {
            return; // Ya se está actualizando, evitar loop
        }
        this._updatingPracticeDisplay = true;
        
        // Resetear flag después de un delay
        setTimeout(() => {
            this._updatingPracticeDisplay = false;
        }, 100);
        
        const labelEl = document.getElementById('balanceLabel');
        const valueEl = document.getElementById('userBalance');
        const onchainEl = document.getElementById('onchainMtrBalance');
        
        // CRÍTICO: El balance demo SOLO debe mostrarse cuando el usuario está específicamente
        // en el modo de Práctica (window.currentMode === 'practice'), NO en otras secciones
        // como Desafío Social, Torneo, etc., incluso si la URL tiene ?mode=practice
        // REGLA: Saldo demo SOLO en modo práctica, saldo real en TODOS los demás modos
        const isInPracticeSection = typeof window !== 'undefined' && window.currentMode === 'practice';
        
        // Logs comentados para reducir ruido - esta función se ejecuta frecuentemente
        // console.log('[updatePracticeBetDisplay] En sección práctica:', isInPracticeSection, 'currentMode:', window.currentMode, 'Balance demo:', this.practiceDemoBalance);
        // console.log('[updatePracticeBetDisplay] Elementos encontrados:', {
        //     labelEl: !!labelEl,
        //     valueEl: !!valueEl,
        //     onchainEl: !!onchainEl,
        //     playableLabel: !!document.getElementById('playableLabel'),
        //     balanceUnit: !!document.getElementById('balanceUnit'),
        //     windowCurrentMode: window.currentMode,
        //     modeTitle: document.getElementById('modeTitle')?.textContent
        // });
        
        if (isInPracticeSection) {
            // Asegurar que el balance demo esté inicializado
            if (!this.practiceDemoBalance || this.practiceDemoBalance <= 0) {
                this.practiceDemoBalance = this.practiceDemoInitialBalance || 1000;
                localStorage.setItem('mtr_practice_demo_balance', String(this.practiceDemoBalance));
                console.log('[practice] Demo balance inicializado a', this.practiceDemoBalance);
            }
            
            // Actualizar UI para modo práctica - FORZAR actualización
            // CRÍTICO: Hacer muy claro que es DEMO y NO es balance real
            if (labelEl) {
                labelEl.textContent = '💰 Balance DEMO (práctica)';
                labelEl.style.color = '#8b5cf6'; // Color púrpura para práctica
                labelEl.style.fontWeight = 'bold';
            } else {
                console.error('[updatePracticeBetDisplay] balanceLabel no encontrado en el DOM');
            }
            
            // FORZAR actualización del valor del balance DEMO
            if (valueEl) {
                const balanceValue = this.practiceDemoBalance || this.practiceDemoInitialBalance || 1000;
                valueEl.textContent = String(balanceValue);
                valueEl.style.color = '#8b5cf6';
                valueEl.style.fontWeight = 'bold';
                console.log('[updatePracticeBetDisplay] ✅ Balance DEMO actualizado a', balanceValue);
            } else {
                console.error('[updatePracticeBetDisplay] ❌ userBalance no encontrado en el DOM');
            }
            
            // También actualizar onchainMtrBalance para mostrar el balance DEMO
            if (onchainEl) {
                const balanceValue = this.practiceDemoBalance || this.practiceDemoInitialBalance || 1000;
                onchainEl.textContent = String(balanceValue) + ' (DEMO)';
                onchainEl.style.color = '#8b5cf6';
                onchainEl.style.fontWeight = 'bold';
            }
            
            // Actualizar el label "Jugable" a "Saldo demo" en modo práctica
            // Usar función robusta que intenta múltiples veces
            const updatePlayableLabel = () => {
                const playableLabelEl = document.getElementById('playableLabel');
                if (playableLabelEl) {
                    // Verificar si ya está actualizado para evitar loops
                    if (playableLabelEl.textContent !== 'Saldo demo') {
                        playableLabelEl.textContent = 'Saldo demo';
                        playableLabelEl.style.color = '#8b5cf6';
                        // Log comentado para reducir ruido
                        // console.log('[updatePracticeBetDisplay] ✅ playableLabel actualizado a "Saldo demo"');
                    }
                    return true;
                }
                return false;
            };
            
            // Intentar actualizar inmediatamente y con delays
            updatePlayableLabel();
            setTimeout(() => { updatePlayableLabel(); }, 50);
            setTimeout(() => { updatePlayableLabel(); }, 100);
            setTimeout(() => { updatePlayableLabel(); }, 200);
            setTimeout(() => { updatePlayableLabel(); }, 500);
            
            // Ocultar o cambiar el texto "MTR" en modo práctica para evitar confusión
            const updateBalanceUnit = () => {
                const balanceUnitEl = document.getElementById('balanceUnit');
                if (balanceUnitEl) {
                    // Verificar si ya está actualizado para evitar loops
                    if (balanceUnitEl.textContent !== 'MTR (demo)') {
                        balanceUnitEl.textContent = 'MTR (demo)';
                        balanceUnitEl.style.color = '#8b5cf6';
                        // Log comentado para reducir ruido
                        // console.log('[updatePracticeBetDisplay] ✅ balanceUnit actualizado a "MTR (demo)"');
                    }
                    return true;
                }
                return false;
            };
            
            // Intentar actualizar inmediatamente y con delays
            updateBalanceUnit();
            setTimeout(() => { updateBalanceUnit(); }, 50);
            setTimeout(() => { updateBalanceUnit(); }, 100);
            setTimeout(() => { updateBalanceUnit(); }, 200);
            setTimeout(() => { updateBalanceUnit(); }, 500);
            
            // Usar MutationObserver para detectar cambios y corregirlos automáticamente
            if (!this.practiceLabelObserver) {
                this.practiceLabelObserver = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'childList' || mutation.type === 'characterData') {
                            const playableLabelEl = document.getElementById('playableLabel');
                            const balanceUnitEl = document.getElementById('balanceUnit');
                            
                            if (isInPracticeSection) {
                                if (playableLabelEl && playableLabelEl.textContent === 'Jugable') {
                                    // Log comentado para reducir ruido
                                    // console.log('[MutationObserver] Detectado cambio a "Jugable", corrigiendo a "Saldo demo"');
                                    playableLabelEl.textContent = 'Saldo demo';
                                    playableLabelEl.style.color = '#8b5cf6';
                                }
                                if (balanceUnitEl && balanceUnitEl.textContent === 'MTR' && balanceUnitEl.textContent !== 'MTR (demo)') {
                                    // Log comentado para reducir ruido
                                    // console.log('[MutationObserver] Detectado cambio a "MTR", corrigiendo a "MTR (demo)"');
                                    balanceUnitEl.textContent = 'MTR (demo)';
                                    balanceUnitEl.style.color = '#8b5cf6';
                                }
                            }
                        }
                    });
                });
                
                // Observar cambios en el contenedor de balance
                const balanceContainer = document.querySelector('#songSelection');
                if (balanceContainer) {
                    this.practiceLabelObserver.observe(balanceContainer, {
                        childList: true,
                        subtree: true,
                        characterData: true
                    });
                    // Log comentado para reducir ruido
                    // console.log('[updatePracticeBetDisplay] MutationObserver configurado para observar cambios');
                }
            }
            
            const formattedBalance = this.practiceDemoBalance.toLocaleString('es-ES');
            
            // CRÍTICO: Asegurar que el balance DEMO esté claramente marcado
            if (valueEl) {
                valueEl.textContent = formattedBalance;
                valueEl.style.color = '#8b5cf6';
                valueEl.style.fontWeight = 'bold';
                // Log comentado para reducir ruido
                // console.log('[updatePracticeBetDisplay] userBalance actualizado a', formattedBalance);
            } else {
                console.error('[updatePracticeBetDisplay] userBalance no encontrado en el DOM');
            }
            
            if (onchainEl) {
                onchainEl.textContent = formattedBalance + ' (DEMO)';
                onchainEl.style.color = '#8b5cf6';
                onchainEl.style.fontWeight = 'bold';
                // Log comentado para reducir ruido
                // console.log('[updatePracticeBetDisplay] onchainMtrBalance actualizado a', formattedBalance);
            } else {
                console.error('[updatePracticeBetDisplay] onchainMtrBalance no encontrado en el DOM');
            }
            
            // NO actualizar appBalanceDisplay con balance de práctica - SIEMPRE mantener balance real
            // El balance de práctica solo se muestra en la sección de práctica, NUNCA en el header
            const appBalanceDisplay = document.getElementById('appBalanceDisplay');
            if (appBalanceDisplay) {
                // SIEMPRE mostrar balance real (on-chain), incluso si es 0
                const onChainBalance = Number(window.__mtrOnChainBalance || 0);
                appBalanceDisplay.textContent = `Jugable: ${onChainBalance.toLocaleString('es-ES')} MTR`;
                appBalanceDisplay.style.color = '';
                // Log comentado para reducir ruido
                // console.log('[updatePracticeBetDisplay] Header actualizado con balance real:', onChainBalance);
            }
            
        } else {
            // Modo normal: mostrar balance REAL (no demo)
            // CRÍTICO: Asegurar que se muestre el balance real desde la plataforma
            if (labelEl) {
                labelEl.textContent = 'Tu MTR (on-chain)';
                labelEl.style.color = '';
                labelEl.style.fontWeight = '';
            }
            
            // Asegurar que los valores muestren balance REAL
            if (valueEl) {
                valueEl.style.color = '';
                valueEl.style.fontWeight = '';
            }
            
            if (onchainEl) {
                onchainEl.style.color = '';
                onchainEl.style.fontWeight = '';
                // Remover cualquier "(DEMO)" que pueda quedar
                if (onchainEl.textContent.includes('(DEMO)')) {
                    onchainEl.textContent = onchainEl.textContent.replace(' (DEMO)', '');
                }
            }
            
            // Restaurar el label "Jugable" en modo normal
            const playableLabelEl = document.getElementById('playableLabel');
            if (playableLabelEl && playableLabelEl.textContent !== 'Jugable') {
                playableLabelEl.textContent = 'Jugable';
                playableLabelEl.style.color = '';
                // Log comentado para reducir ruido
                // console.log('[updatePracticeBetDisplay] playableLabel restaurado a "Jugable"');
            }
            
            // Restaurar el texto "MTR" normal en modo normal
            const balanceUnitEl = document.getElementById('balanceUnit');
            if (balanceUnitEl && balanceUnitEl.textContent !== 'MTR') {
                balanceUnitEl.textContent = 'MTR';
                balanceUnitEl.style.color = '';
                // Log comentado para reducir ruido
                // console.log('[updatePracticeBetDisplay] balanceUnit restaurado a "MTR"');
            }
            
            // Desconectar el observer si existe
            if (this.practiceLabelObserver) {
                this.practiceLabelObserver.disconnect();
                this.practiceLabelObserver = null;
            }
            
            // CRÍTICO: NO llamar a loadBalance aquí para evitar loops infinitos
            // updatePracticeBetDisplay solo debe actualizar el DISPLAY, no cargar datos
            // La carga de balances reales se hace en selectMode() cuando se cambia de modo
            
            // CRÍTICO: Mostrar balance REAL (on-chain o créditos o Supabase)
            // NO usar saldo demo en modo normal
            const onChainBalance = Number(window.__mtrOnChainBalance || 0);
            let creditsBalance = 0;
            if (window.CreditsSystem && window.CreditsSystem.currentCredits !== undefined) {
                creditsBalance = Number(window.CreditsSystem.currentCredits || 0);
            }
            const playableBalance = onChainBalance > 0 ? onChainBalance : (creditsBalance > 0 ? creditsBalance : this.userBalance);
            
            if (valueEl) {
                valueEl.textContent = playableBalance.toLocaleString('es-ES');
                valueEl.style.color = '';
                // Asegurar que no tenga "(DEMO)"
                if (valueEl.textContent.includes('(DEMO)')) {
                    valueEl.textContent = valueEl.textContent.replace(' (DEMO)', '');
                }
            }
            if (onchainEl) {
                onchainEl.textContent = onChainBalance > 0 ? onChainBalance.toLocaleString('es-ES') : '--';
                onchainEl.style.color = '';
                // Asegurar que no tenga "(DEMO)"
                if (onchainEl.textContent.includes('(DEMO)')) {
                    onchainEl.textContent = onchainEl.textContent.replace(' (DEMO)', '');
                }
            }
            
            console.log('[updatePracticeBetDisplay] Modo normal - Balance REAL mostrado:', {
                playableBalance: playableBalance,
                onChainBalance: onChainBalance,
                creditsBalance: creditsBalance,
                userBalance: this.userBalance
            });
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
                // CRÍTICO: Para desafíos sociales, SIEMPRE usar 5 créditos como mínimo
                // No usar min_bet de la base de datos que puede ser 100
                // Solo usar min_bet de la base de datos para otros modos (Quick Match, Sala Privada, Torneo)
                const dbMinBet = data.min_bet || MIN_BET_AMOUNT;
                // Si el valor de la BD es mayor a 5, usar 5 como mínimo para evitar problemas
                // Los desafíos sociales siempre usarán SOCIAL_CHALLENGE_MIN_BET = 5 directamente
                this.minBet = dbMinBet;
                this.battleDuration = data.battle_duration;
                this.victoryAudioDuration = data.victory_audio_duration;
                if (data.platform_fee_rate) this.platformFeeRate = data.platform_fee_rate;
                if (data.jackpot_rate) this.jackpotRate = data.jackpot_rate;
                if (data.platform_revenue_target) this.platformRevenueTarget = data.platform_revenue_target;
                
                console.log('[loadGameConfig] minBet cargado desde BD:', this.minBet, '(Nota: Desafíos sociales siempre usan 5)');
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
    },
    
    updateBalanceDisplay() {
        // CRÍTICO: Protección contra loops infinitos
        // Evitar ejecuciones múltiples simultáneas
        if (this._updatingBalanceDisplay) {
            return; // Ya se está actualizando, evitar loop
        }
        this._updatingBalanceDisplay = true;
        
        // Resetear flag después de un delay
        setTimeout(() => {
            this._updatingBalanceDisplay = false;
        }, 100);
        
        // Verificar si estamos específicamente en la sección de Práctica
        const isInPracticeSection = typeof window !== 'undefined' && window.currentMode === 'practice';
        
        // SIEMPRE actualizar appBalanceDisplay con balance REAL (on-chain), incluso en modo práctica
        // El header siempre debe mostrar el balance real de la wallet, nunca el balance de práctica
        const onChainBalance = Number(window.__mtrOnChainBalance || 0);
        const balanceEl = document.getElementById('appBalanceDisplay');
        if (balanceEl) {
            // SIEMPRE mostrar balance real, incluso si es 0
            balanceEl.textContent = `Jugable: ${onChainBalance.toLocaleString('es-ES')} MTR`;
            balanceEl.style.color = '';
            console.log('[updateBalanceDisplay] Header actualizado con balance REAL:', onChainBalance, '(en sección práctica:', isInPracticeSection, ', currentMode:', window.currentMode, ')');
        }
        
        // NO actualizar userBalance si estamos específicamente en la sección de Práctica (dejar que updatePracticeBetDisplay lo maneje)
        if (!isInPracticeSection) {
            // CRÍTICO: En modo normal, SIEMPRE mostrar balance REAL desde la plataforma
            // Prioridad: 1) Balance on-chain (blockchain), 2) Créditos del backend, 3) Balance de Supabase
            
            // Obtener créditos del backend si CreditsSystem está disponible
            let creditsBalance = 0;
            if (window.CreditsSystem && window.CreditsSystem.currentCredits !== undefined) {
                creditsBalance = Number(window.CreditsSystem.currentCredits || 0);
            }
            
            // Para modo normal, usar saldo on-chain si está disponible, sino usar créditos, sino usar userBalance
            const playableBalance = onChainBalance > 0 ? onChainBalance : (creditsBalance > 0 ? creditsBalance : this.userBalance);
            
            console.log('[updateBalanceDisplay] Modo normal - Balance REAL:', {
                playableBalance: playableBalance,
                onChainBalance: onChainBalance,
                creditsBalance: creditsBalance,
                userBalance: this.userBalance
            });

            const userBalanceEl = document.getElementById('userBalance');
            if (userBalanceEl) {
                // CRÍTICO: Asegurar que NO muestre "(DEMO)" en modo normal
                const displayValue = playableBalance.toLocaleString('es-ES');
                userBalanceEl.textContent = displayValue;
                userBalanceEl.style.color = '';
                userBalanceEl.style.fontWeight = '';
                console.log('[updateBalanceDisplay] ✅ userBalance actualizado con balance REAL:', displayValue);
            } else {
                console.warn('[updateBalanceDisplay] userBalance no encontrado');
            }
            
            // Actualizar onchainMtrBalance con balance REAL
            const onchainEl = document.getElementById('onchainMtrBalance');
            if (onchainEl) {
                const displayValue = onChainBalance.toLocaleString('es-ES');
                onchainEl.textContent = displayValue;
                onchainEl.style.color = '';
                onchainEl.style.fontWeight = '';
                // Asegurar que no tenga "(DEMO)"
                if (onchainEl.textContent.includes('(DEMO)')) {
                    onchainEl.textContent = onchainEl.textContent.replace(' (DEMO)', '');
                }
                console.log('[updateBalanceDisplay] ✅ onchainMtrBalance actualizado con balance REAL:', displayValue);
            }
            
            // Asegurar que el label "Jugable" esté restaurado en modo normal
            const playableLabelEl = document.getElementById('playableLabel');
            if (playableLabelEl && playableLabelEl.textContent !== 'Jugable') {
                playableLabelEl.textContent = 'Jugable';
                playableLabelEl.style.color = '';
                playableLabelEl.style.fontWeight = '';
                console.log('[updateBalanceDisplay] ✅ playableLabel restaurado a "Jugable"');
            }
            
            // Asegurar que el texto "MTR" esté restaurado en modo normal (sin "(demo)")
            const balanceUnitEl = document.getElementById('balanceUnit');
            if (balanceUnitEl) {
                if (balanceUnitEl.textContent !== 'MTR' && balanceUnitEl.textContent.includes('MTR')) {
                    balanceUnitEl.textContent = 'MTR';
                    balanceUnitEl.style.color = '';
                    balanceUnitEl.style.fontWeight = '';
                    console.log('[updateBalanceDisplay] ✅ balanceUnit restaurado a "MTR"');
                }
            }
            
            // Asegurar que balanceLabel muestre texto correcto
            const balanceLabelEl = document.getElementById('balanceLabel');
            if (balanceLabelEl && balanceLabelEl.textContent.includes('DEMO')) {
                balanceLabelEl.textContent = 'Tu MTR (on-chain)';
                balanceLabelEl.style.color = '';
                balanceLabelEl.style.fontWeight = '';
                console.log('[updateBalanceDisplay] ✅ balanceLabel restaurado');
            }
        }
        
        // CRÍTICO: Solo actualizar display de práctica si estamos en modo práctica
        // NO llamar siempre para evitar loops infinitos
        if (isInPracticeSection) {
            setTimeout(() => {
                this.updatePracticeBetDisplay();
            }, 0);
        }
    },

    getAvailableWalletBalance() {
        const hasConnectedWallet = Boolean(window.__mtrConnectedWallet);
        const onChainBalance = Number(window.__mtrOnChainBalance || 0);
        const localBalance = Number(this.userBalance || 0);

        if (hasConnectedWallet && Number.isFinite(onChainBalance)) {
            return Math.max(0, onChainBalance);
        }

        return Number.isFinite(localBalance) ? Math.max(0, localBalance) : 0;
    },

    hasSufficientBalance(betAmount) {
        const available = this.getAvailableWalletBalance();
        if (Number(betAmount) > available) {
            showToast(`Saldo insuficiente. Disponible: ${available.toLocaleString('es-ES', { maximumFractionDigits: 4 })} MTR`, 'error');
            return false;
        }
        return true;
    },

    /**
     * Check if user has sufficient credits for betting
     * CRÍTICO: Para desafíos sociales, también verifica balance on-chain MTR como alternativa
     */
    async hasSufficientCredits(betAmount) {
        if (!window.CreditsSystem) {
            console.warn('[game-engine] CreditsSystem not available, falling back to balance check');
            return this.hasSufficientBalance(betAmount);
        }

        const credits = window.CreditsSystem.currentCredits || 0;
        const onchainBalance = Number(window.__mtrOnChainBalance || 0);
        
        // CRÍTICO: Verificar TANTO créditos off-chain COMO balance on-chain MTR
        // El usuario puede apostar con cualquiera de los dos
        const hasEnoughCredits = Number(betAmount) <= credits;
        const hasEnoughOnChain = Number(betAmount) <= onchainBalance;
        
        console.log('[game-engine] hasSufficientCredits - Bet:', betAmount, 'Credits:', credits, 'OnChain:', onchainBalance, 'HasCredits:', hasEnoughCredits, 'HasOnChain:', hasEnoughOnChain);
        
        if (hasEnoughCredits || hasEnoughOnChain) {
            return true;
        }
        
        // Si no tiene suficiente en ninguno, mostrar error con ambos balances
        showToast(`Saldo insuficiente. Créditos: ${credits.toFixed(2)}, MTR on-chain: ${onchainBalance.toLocaleString('es-ES', { maximumFractionDigits: 4 })}`, 'error');
        return false;
    },
    
    // ==========================================
    // MODO RÁPIDO (Quick Match)
    // ==========================================
    
    async joinQuickMatch(song, betAmount) {
        // Validate minimum bet (MIN_BET_AMOUNT créditos)
        const normalizedBet = Math.max(this.minBet, Math.round(betAmount || this.minBet));
        if (normalizedBet < this.minBet) {
            showToast(`Apuesta mínima: ${this.minBet} créditos`, 'error');
            return;
        }
        
        // Check credits balance instead of on-chain balance
        if (!(await this.hasSufficientCredits(normalizedBet))) {
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
            showToast(`La apuesta debe ser mínimo ${challenge.betAmount} MTR`, 'error');
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
    // MODO DESAFÍO SOCIAL (Social Challenge)
    // ==========================================
    
    async createSocialChallenge(song, betAmount) {
        // CRÍTICO: Desafíos sociales SIEMPRE tienen mínimo de 5 créditos, independientemente de game_config
        // NO usar this.minBet ni MIN_BET_AMOUNT que pueden venir de la base de datos con valor 100
        const SOCIAL_CHALLENGE_MIN_BET = 5;
        
        console.log('[createSocialChallenge] Validando apuesta - betAmount recibido:', betAmount, 'mínimo requerido:', SOCIAL_CHALLENGE_MIN_BET);
        
        const normalizedBet = Math.max(SOCIAL_CHALLENGE_MIN_BET, Math.round(betAmount || SOCIAL_CHALLENGE_MIN_BET));
        
        if (normalizedBet < SOCIAL_CHALLENGE_MIN_BET) {
            console.error('[createSocialChallenge] ❌ Apuesta rechazada - normalizedBet:', normalizedBet, '< mínimo:', SOCIAL_CHALLENGE_MIN_BET);
            showToast(`La apuesta mínima para desafíos sociales es ${SOCIAL_CHALLENGE_MIN_BET} créditos`, 'error');
            return;
        }
        
        console.log('[createSocialChallenge] ✅ Apuesta validada - normalizedBet:', normalizedBet);
        
        // Verificar créditos suficientes
        if (!(await this.hasSufficientCredits(normalizedBet))) {
            return;
        }
        
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            // Generar ID único para el desafío
            const challengeId = this.generateChallengeId();
            
            // Crear desafío en la base de datos
            const { data: challenge, error: challengeError } = await supabaseClient
                .from('social_challenges')
                .insert([{
                    challenge_id: challengeId,
                    challenger_id: session.user.id,
                    challenger_song_id: song.id,
                    challenger_song_name: song.name,
                    challenger_song_artist: song.artist,
                    challenger_song_image: song.image,
                    challenger_song_preview: song.preview,
                    bet_amount: normalizedBet,
                    status: 'pending',
                    created_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 días
                }])
                .select()
                .single();
            
            if (challengeError) throw challengeError;
            
            // Descontar créditos del desafío ANTES de mostrar UI
            // CRÍTICO: Esto debe ejecutarse ANTES de crear el desafío, pero como ya lo creamos,
            // si falla debemos eliminarlo
            let deductionSuccess = false;
            try {
                deductionSuccess = await this.updateBalance(-normalizedBet, 'bet', null);
            } catch (deductionError) {
                console.error('[createSocialChallenge] ❌ Error al descontar créditos (excepción):', deductionError);
                deductionSuccess = false;
            }
            
            if (!deductionSuccess) {
                console.error('[createSocialChallenge] ❌ Deducción falló, eliminando desafío creado...');
                
                // Obtener información de saldo para mensaje de error más claro
                const credits = window.CreditsSystem?.currentCredits || 0;
                const onchainBalance = Number(window.__mtrOnChainBalance || 0);
                
                // Si falla la deducción, eliminar el desafío
                try {
                    await supabaseClient
                        .from('social_challenges')
                        .delete()
                        .eq('id', challenge.id);
                    console.log('[createSocialChallenge] ✅ Desafío eliminado correctamente');
                } catch (deleteError) {
                    console.error('[createSocialChallenge] ❌ Error al eliminar desafío:', deleteError);
                }
                
                // Mensaje de error más claro
                let errorMsg = `No se pudieron descontar ${normalizedBet} créditos. `;
                if (credits < normalizedBet && onchainBalance >= normalizedBet) {
                    errorMsg += `Tienes ${credits.toFixed(2)} créditos pero ${onchainBalance.toLocaleString('es-ES')} MTR on-chain. La conversión automática falló. Intenta nuevamente.`;
                } else if (credits < normalizedBet && onchainBalance < normalizedBet) {
                    errorMsg += `Disponibles: ${credits.toFixed(2)} créditos y ${onchainBalance.toLocaleString('es-ES', { maximumFractionDigits: 4 })} MTR on-chain.`;
                } else {
                    errorMsg += `Verifica tu saldo y vuelve a intentar.`;
                }
                
                showToast(errorMsg, 'error');
                return;
            }
            
            console.log('[createSocialChallenge] ✅ Créditos descontados exitosamente');
            
            // Generar link único
            const challengeLink = `${window.location.origin}${window.location.pathname}?challenge=${challengeId}`;
            
            console.log('[createSocialChallenge] ✅ Desafío creado exitosamente:', {
                challengeId: challengeId,
                challengeLink: challengeLink,
                betAmount: normalizedBet
            });
            
            // Mostrar UI para compartir
            console.log('[createSocialChallenge] Mostrando UI de compartir...');
            this.showSocialChallengeShareUI(challenge, challengeLink, song, normalizedBet);
            
            console.log('[createSocialChallenge] ✅ UI de compartir mostrada');
            showToast('Desafío creado. Comparte el link con tu amigo.', 'success');
            
        } catch (error) {
            console.error('Error creating social challenge:', error);
            showToast('Error al crear desafío', 'error');
        }
    },
    
    generateChallengeId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let id = '';
        for (let i = 0; i < 12; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    },
    
    showSocialChallengeShareUI(challenge, challengeLink, song, betAmount) {
        // Ocultar selección de canciones
        document.getElementById('songSelection')?.classList.add('hidden');
        
        // Crear o mostrar UI de compartir
        let shareContainer = document.getElementById('socialChallengeShare');
        if (!shareContainer) {
            shareContainer = document.createElement('div');
            shareContainer.id = 'socialChallengeShare';
            shareContainer.className = 'max-w-2xl mx-auto p-6 sm:p-8 rounded-2xl border border-orange-500/15 bg-gradient-to-br from-gray-900/80 to-orange-950/30';
            document.querySelector('main').appendChild(shareContainer);
        }
        
        shareContainer.innerHTML = `
            <div class="text-center mb-6">
                <div class="text-5xl mb-4">⚔️</div>
                <h2 class="text-2xl font-bold text-white mb-2">Desafío Creado</h2>
                <p class="text-gray-400 text-sm mb-4">Comparte este link con tu amigo para que acepte tu desafío</p>
            </div>
            
            <div class="mb-6 p-4 rounded-xl bg-black/40 border border-white/10">
                <div class="flex items-center gap-4 mb-3">
                    <img src="${song.image}" alt="${song.name}" class="w-16 h-16 rounded-lg object-cover">
                    <div class="flex-1 text-left">
                        <h3 class="text-white font-bold">${song.name}</h3>
                        <p class="text-gray-400 text-sm">${song.artist}</p>
                        <p class="text-orange-400 text-sm font-semibold mt-1">Apuesta: ${betAmount} créditos</p>
                    </div>
                </div>
            </div>
            
            <div class="mb-6">
                <label class="text-sm text-gray-400 mb-2 block">Link del desafío</label>
                <div class="flex gap-2">
                    <input type="text" id="challengeLinkInput" readonly value="${challengeLink}" 
                           class="flex-1 px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white text-sm">
                    <button type="button" onclick="copyChallengeLink()" 
                            class="px-4 py-3 rounded-lg text-sm bg-orange-500/15 border border-orange-500/30 text-orange-400 hover:bg-orange-500/25 transition cursor-pointer">
                        📋 Copiar
                    </button>
                </div>
            </div>
            
            <div class="mb-6">
                <p class="text-sm text-gray-400 mb-3 text-center">Compartir en:</p>
                <div class="flex flex-wrap justify-center gap-3">
                    <button type="button" onclick="shareChallenge('whatsapp', '${challengeLink}')" 
                            class="px-4 py-2 rounded-lg text-sm font-semibold bg-green-500/15 border border-green-500/30 text-green-400 hover:bg-green-500/25 transition cursor-pointer">
                        📱 WhatsApp
                    </button>
                    <button type="button" onclick="shareChallenge('twitter', '${challengeLink}')" 
                            class="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 transition cursor-pointer">
                        🐦 Twitter
                    </button>
                    <button type="button" onclick="shareChallenge('facebook', '${challengeLink}')" 
                            class="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600/15 border border-blue-600/30 text-blue-500 hover:bg-blue-600/25 transition cursor-pointer">
                        📘 Facebook
                    </button>
                    <button type="button" onclick="shareChallenge('telegram', '${challengeLink}')" 
                            class="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25 transition cursor-pointer">
                        ✈️ Telegram
                    </button>
                </div>
            </div>
            
            <div class="text-center">
                <button type="button" onclick="cancelSocialChallenge('${challenge.challenge_id}')" 
                        class="px-6 py-2 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer">
                    Cancelar Desafío
                </button>
            </div>
        `;
        
        shareContainer.classList.remove('hidden');
    },
    
    async acceptSocialChallenge(challengeId, song, betAmount) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) {
                showToast('Debes iniciar sesión para aceptar el desafío', 'error');
                return;
            }
            
            // Buscar el desafío
            const { data: challenge, error: challengeError } = await supabaseClient
                .from('social_challenges')
                .select('*')
                .eq('challenge_id', challengeId)
                .eq('status', 'pending')
                .single();
            
            if (challengeError || !challenge) {
                showToast('Desafío no encontrado o ya fue aceptado', 'error');
                return;
            }
            
            // Verificar que no sea el mismo usuario
            if (challenge.challenger_id === session.user.id) {
                showToast('No puedes aceptar tu propio desafío', 'error');
                return;
            }
            
            // Verificar que la apuesta sea suficiente
            const normalizedBet = Math.max(challenge.bet_amount, Math.round(betAmount || challenge.bet_amount));
            if (normalizedBet < challenge.bet_amount) {
                showToast(`La apuesta mínima para este desafío es ${challenge.bet_amount} créditos`, 'error');
                return;
            }
            
            // Verificar créditos suficientes
            if (!(await this.hasSufficientCredits(normalizedBet))) {
                return;
            }
            
            // Verificar ELO si está habilitado
            const eloGate = await this.canMatchByElo(song.id, challenge.challenger_song_id);
            if (!eloGate.allowed) {
                showToast(`Matchmaking ELO bloqueado: diferencia ${eloGate.diff} (>300)`, 'error');
                return;
            }
            
            // Crear match
            await this.createMatch(
                'social',
                challenge.challenger_id,
                session.user.id,
                {
                    id: challenge.challenger_song_id,
                    name: challenge.challenger_song_name,
                    artist: challenge.challenger_song_artist,
                    image: challenge.challenger_song_image,
                    preview: challenge.challenger_song_preview
                },
                {
                    song_id: song.id,
                    song_name: song.name,
                    song_artist: song.artist,
                    song_image: song.image,
                    song_preview: song.preview
                },
                challenge.bet_amount,
                normalizedBet
            );
            
            // Actualizar estado del desafío
            await supabaseClient
                .from('social_challenges')
                .update({
                    status: 'accepted',
                    accepter_id: session.user.id,
                    accepted_at: new Date().toISOString()
                })
                .eq('id', challenge.id);
            
            // Limpiar parámetro de URL
            if (window.history && window.history.replaceState) {
                const url = new URL(window.location);
                url.searchParams.delete('challenge');
                window.history.replaceState({}, '', url);
            }
            
            showToast('¡Desafío aceptado! Iniciando partida...', 'success');
            
        } catch (error) {
            console.error('Error accepting social challenge:', error);
            showToast('Error al aceptar desafío', 'error');
        }
    },
    
    async cancelSocialChallenge(challengeId) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            // Buscar y eliminar el desafío
            const { data: challenge } = await supabaseClient
                .from('social_challenges')
                .select('*')
                .eq('challenge_id', challengeId)
                .eq('challenger_id', session.user.id)
                .eq('status', 'pending')
                .single();
            
            if (challenge) {
                // Reembolsar créditos
                await this.updateBalance(challenge.bet_amount, 'refund', null);
                
                // Eliminar desafío
                await supabaseClient
                    .from('social_challenges')
                    .delete()
                    .eq('id', challenge.id);
                
                showToast('Desafío cancelado. Créditos reembolsados.', 'info');
            }
            
            // Volver a selección de modos
            document.getElementById('socialChallengeShare')?.classList.add('hidden');
            document.getElementById('songSelection')?.classList.remove('hidden');
            
        } catch (error) {
            console.error('Error canceling social challenge:', error);
            showToast('Error al cancelar desafío', 'error');
        }
    },
    
    // MODO SALA PRIVADA (Private Room)
    // ==========================================
    
    async createPrivateRoom(song, betAmount) {
        // Validate minimum bet (MIN_BET_AMOUNT créditos)
        const normalizedBet = Math.max(this.minBet, Math.round(betAmount || this.minBet));
        if (normalizedBet < this.minBet) {
            showToast(`Apuesta mínima: ${this.minBet} créditos`, 'error');
            return;
        }

        // Check credits balance instead of on-chain balance
        if (!(await this.hasSufficientCredits(normalizedBet))) {
            return;
        }

        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            // Descontar créditos ANTES de crear la sala
            const deductionSuccess = await this.updateBalance(-normalizedBet, 'bet', null);
            if (!deductionSuccess) {
                showToast('Error al descontar créditos. Intenta nuevamente.', 'error');
                return;
            }

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
                    player1_bet: normalizedBet,
                    status: 'waiting'
                }])
                .select()
                .single();
            
            if (matchError) {
                // Si falla crear match después de descontar, reembolsar créditos
                await this.updateBalance(normalizedBet, 'refund', null);
                throw matchError;
            }

            this.currentRoomCode = roomCode;
            this.currentPrivateMatchId = match.id;
            
            // Crear sala
            const { error: roomError } = await supabaseClient
                .from('private_rooms')
                .insert([{
                    room_code: roomCode,
                    creator_id: session.user.id,
                    match_id: match.id,
                    min_bet: normalizedBet,
                    status: 'open'
                }]);
            
            if (roomError) {
                // Si falla crear sala después de crear match, reembolsar créditos y eliminar match
                await this.updateBalance(normalizedBet, 'refund', null);
                await supabaseClient.from('matches').delete().eq('id', match.id);
                throw roomError;
            }
            
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
                showToast(`Apuesta mínima de la sala: ${match.player1_bet} créditos`, 'error');
                return;
            }

            // Check credits balance instead of on-chain balance
            if (!(await this.hasSufficientCredits(betAmount))) {
                return;
            }

            const eloGate = await this.canMatchByElo(song.id, match.player1_song_id);
            if (!eloGate.allowed) {
                showToast(`Matchmaking ELO bloqueado: diferencia ${eloGate.diff} (>300)`, 'error');
                return;
            }

            // Descontar créditos ANTES de unirse al match
            const deductionSuccess = await this.updateBalance(-betAmount, 'bet', null);
            if (!deductionSuccess) {
                showToast('Error al descontar créditos. Intenta nuevamente.', 'error');
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
            
            if (updateError) {
                // Si falla unirse después de descontar, reembolsar créditos
                await this.updateBalance(betAmount, 'refund', null);
                throw updateError;
            }
            
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
    
    async startPracticeMatch(userSong, demoBet = 0) {
        console.log('[startPracticeMatch] ✅ INICIANDO práctica');
        console.log('[startPracticeMatch] Parámetros:', { userSong, demoBet });
        
        try {
            if (!userSong || !userSong.id) {
                console.error('[startPracticeMatch] ❌ Canción no válida:', userSong);
                showToast('Error: Canción no válida', 'error');
                return;
            }

            console.log('[startPracticeMatch] Canción válida:', userSong.name);

            if (this.practiceDemoBalance <= 0) {
                console.log('[startPracticeMatch] Balance demo en 0, reseteando a', this.practiceDemoInitialBalance);
                this.practiceDemoBalance = this.practiceDemoInitialBalance;
                localStorage.setItem('mtr_practice_demo_balance', String(this.practiceDemoBalance));
            }

            // Modo práctica: sin mínimo, acepta cualquier apuesta (incluso 0)
            const normalizedBet = Math.max(0, Math.round(demoBet || 0));
            console.log('[startPracticeMatch] Apuesta normalizada:', normalizedBet, 'Balance demo:', this.practiceDemoBalance);
            
            if (normalizedBet > this.practiceDemoBalance) {
                console.error('[startPracticeMatch] ❌ Saldo insuficiente');
                showToast(`Saldo demo insuficiente. Disponible: ${this.practiceDemoBalance} MTR`, 'error');
                return;
            }

            console.log('[startPracticeMatch] Descontando apuesta del balance demo...');
            this.setPracticeDemoBalance(this.practiceDemoBalance - normalizedBet);
            this.updatePracticeBetDisplay();
            console.log('[startPracticeMatch] Balance actualizado');
            let cpuSong;
            try {
                console.log('[startPracticeMatch] Obteniendo canción del CPU...');
                cpuSong = await Promise.race([
                    this.fetchCpuOpponentByElo(userSong),
                    new Promise((_, reject) => {
                        setTimeout(() => {
                            reject(new Error('Timeout obteniendo canción CPU'));
                        }, 20000); // Aumentado a 20s para evitar timeouts prematuros
                    })
                ]);

                if (!cpuSong || !cpuSong.id) {
                    throw new Error('CPU song fetch returned invalid result');
                }
                console.log('[startPracticeMatch] ✅ Canción CPU obtenida:', cpuSong.name);
            } catch (cpuError) {
                console.warn('[startPracticeMatch] ⚠️ Error obteniendo canción CPU, usando fallback:', cpuError.message);
                // Fallback: usar una canción genérica
                cpuSong = {
                    id: `cpu_fallback_${Date.now()}`,
                    name: 'Rival Generado',
                    artist: 'CPU Challenger',
                    image: userSong.image || 'https://via.placeholder.com/500x500.png?text=CPU+Rival',
                    preview: userSong.preview || ''
                };
                console.log('[startPracticeMatch] ✅ Usando canción fallback para CPU');
            }

            let match = null;
            let useLocalFallback = false;

            try {
                const { data: { session } } = await supabaseClient.auth.getSession();
                if (session) {
                    const { data, error } = await supabaseClient
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
                    match = data;
                } else {
                    useLocalFallback = true;
                }
            } catch (dbError) {
                console.warn('[practice] Supabase insert failed, using local mode:', dbError.message);
                useLocalFallback = true;
            }

            if (useLocalFallback) {
                match = {
                    id: 'local_practice_' + Date.now(),
                    match_type: 'practice',
                    player1_id: 'local_user',
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
                };
                console.log('[practice] Using local fallback match');
            }

            console.log('[startPracticeMatch] ✅ Match creado:', match.id);
            showToast(`¡Práctica iniciada: ${normalizedBet} MTR demo!`, 'success');
            
            console.log('[startPracticeMatch] Llamando a startLocalPractice...');
            await this.startLocalPractice(match);
            console.log('[startPracticeMatch] ✅✅✅ Práctica iniciada exitosamente');

        } catch (error) {
            console.error('[startPracticeMatch] ❌❌❌ ERROR:', error);
            console.error('[startPracticeMatch] Stack:', error.stack);
            showToast('Error al iniciar práctica: ' + (error.message || 'Error desconocido'), 'error');
            
            // Restaurar balance si falla
            const normalizedBet = Math.max(this.minBet, Math.round(demoBet || this.minBet));
            this.setPracticeDemoBalance(this.practiceDemoBalance + normalizedBet);
            this.updatePracticeBetDisplay();
        }
    },

    async startLocalPractice(match) {
        console.log('[startLocalPractice] ✅ INICIANDO batalla local');
        console.log('[startLocalPractice] Match:', match);
        
        if (!match) {
            console.error('[startLocalPractice] ❌ Match inválido');
            showToast('Error: Datos de batalla inválidos', 'error');
            return;
        }

        console.log('[startLocalPractice] Ocultando secciones...');
        // Ocultar secciones
        document.getElementById('songSelection')?.classList.add('hidden');
        document.getElementById('waitingScreen')?.classList.add('hidden');
        document.getElementById('roomScreen')?.classList.add('hidden');
        document.getElementById('modeSelector')?.classList.add('hidden');
        console.log('[startLocalPractice] Secciones ocultadas');

        this.currentMatch = match;
        
        try {
            console.log('[startLocalPractice] Creando UI de batalla...');
            this.createBattleUI(match);
            console.log('[startLocalPractice] ✅ UI de batalla creada');
        } catch (uiError) {
            console.error('[startLocalPractice] ❌ Error creating battle UI:', uiError);
            console.error('[startLocalPractice] Stack:', uiError.stack);
            showToast('Error al crear la interfaz de batalla: ' + (uiError.message || 'Error desconocido'), 'error');
            return;
        }

        // Esperar un momento para que el DOM se actualice
        await new Promise(resolve => setTimeout(resolve, 200));

        var userSong = match.player1_song_preview;
        if (userSong) {
            try {
                this.playUserSong(userSong);
            } catch (audioError) {
                // Silenciar error de audio
            }
        }

        var oracleStats;
        try {
            oracleStats = await Promise.race([
                this.fetchOracleStats(match),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Oracle timeout')), 8000))
            ]);
        } catch (oracleError) {
            // Usar valores por defecto
            oracleStats = {
                player1Projected: Math.floor(Math.random() * 800000) + 200000,
                player2Projected: Math.floor(Math.random() * 800000) + 200000
            };
        }
        
        var basePlays1 = oracleStats.player1Projected;
        var basePlays2 = oracleStats.player2Projected;
        var plays1 = 0, plays2 = 0;
        var timeLeft = this.battleDuration;
        var self = this;

        var statusEl = document.getElementById('battleStatusText');
        var battleInterval = setInterval(function () {
            timeLeft--;
            var timerEl = document.getElementById('battleTimer');
            if (timerEl) timerEl.textContent = timeLeft;

            plays1 += self.calculatePlaysIncrement(basePlays1);
            plays2 += self.calculatePlaysIncrement(basePlays2);

            var totalPlays = plays1 + plays2;
            var health1 = totalPlays > 0 ? Math.max(0, Math.min(100, (plays1 / totalPlays) * 100)) : 50;
            var health2 = 100 - health1;

            if (self.battleAnimState) {
                self.battleAnimState.h1 = health1;
                self.battleAnimState.h2 = health2;
                self.battleAnimState.time = timeLeft;
            }

            var h1f = document.getElementById('health1Fill');
            var h2f = document.getElementById('health2Fill');
            if (h1f) h1f.style.width = health1 + '%';
            if (h2f) h2f.style.width = health2 + '%';
            var h1t = document.getElementById('health1Text');
            var h2t = document.getElementById('health2Text');
            if (h1t) h1t.textContent = Math.round(health1) + '%';
            if (h2t) h2t.textContent = Math.round(health2) + '%';
            var p1 = document.getElementById('plays1');
            var p2 = document.getElementById('plays2');
            if (p1) p1.textContent = Math.round(plays1).toLocaleString('es-ES');
            if (p2) p2.textContent = Math.round(plays2).toLocaleString('es-ES');

            var diff = Math.abs(health1 - health2);
            if (statusEl) {
                if (timeLeft <= 5) statusEl.innerHTML = '<span class="text-red-400 font-bold animate-pulse">⚡ FINAL ÉPICO</span>';
                else if (diff < 5) statusEl.innerHTML = '<span class="text-yellow-400">🔥 Empate técnico</span>';
                else if (health1 > health2) statusEl.innerHTML = '<span class="text-cyan-400">🎵 Tu canción domina</span>';
                else statusEl.innerHTML = '<span class="text-fuchsia-400">🎵 CPU toma la delantera</span>';
            }

            var img1 = document.getElementById('fighter1Img');
            var img2 = document.getElementById('fighter2Img');
            if (img1) img1.style.boxShadow = '0 0 ' + (15 + health1 * 0.3) + 'px rgba(0,243,255,' + (0.3 + health1 * 0.005) + ')';
            if (img2) img2.style.boxShadow = '0 0 ' + (15 + health2 * 0.3) + 'px rgba(236,72,153,' + (0.3 + health2 * 0.005) + ')';

            if (timeLeft <= 0) {
                clearInterval(battleInterval);
                self.endPracticeLocally(match, plays1, plays2);
            }
        }, 1000);
    },

    async endPracticeLocally(match, plays1, plays2) {
        var winner = plays1 > plays2 ? 1 : 2;
        var userWon = winner === 1;
        this.stopUserSong();

        if (this.battleAnimState) {
            this.battleAnimState.finished = true;
            this.battleAnimState.winner = winner;
        }
        this.spawnVictoryParticles(winner);

        var winnerSong = winner === 1 ? match.player1_song_preview : match.player2_song_preview;
        this.playVictorySong(winnerSong);

        var statusEl = document.getElementById('battleStatusText');
        if (statusEl) {
            // Detectar si es móvil para ajustar el tamaño del mensaje
            const isMobile = typeof window !== 'undefined' && (
                /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                (window.innerWidth <= 768) ||
                (typeof isMobileDevice === 'function' && isMobileDevice())
            );
            
            const textSize = isMobile ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl';
            const paddingSize = isMobile ? 'py-3 px-3' : 'py-4 px-6';
            
            statusEl.innerHTML = userWon
                ? `<div class="inline-block ${paddingSize} rounded-2xl bg-gradient-to-r from-cyan-500/20 to-cyan-600/20 border-2 border-cyan-400/50 shadow-2xl animate-pulse">
                    <span class="${textSize} text-cyan-300 font-black drop-shadow-lg" style="text-shadow: 0 0 20px rgba(0,243,255,0.8);">
                        🏆 ¡VICTORIA! 🏆
                    </span>
                    <div class="mt-2 ${isMobile ? 'text-sm' : 'text-base'} text-cyan-200 font-bold">
                        Tu canción gana +50 MTR
                    </div>
                   </div>`
                : `<div class="inline-block ${paddingSize} rounded-2xl bg-gradient-to-r from-red-500/20 to-red-600/20 border-2 border-red-400/50 shadow-2xl">
                    <span class="${textSize} text-red-300 font-black drop-shadow-lg" style="text-shadow: 0 0 20px rgba(239,68,68,0.8);">
                        😔 Derrota
                    </span>
                    <div class="mt-2 ${isMobile ? 'text-sm' : 'text-base'} text-red-200 font-bold">
                        CPU gana esta vez
                    </div>
                   </div>`;
            
            // SCROLL AUTOMÁTICO AL MENSAJE DE RESULTADO
            setTimeout(() => {
                try {
                    console.log('[endBattle] Iniciando scroll automático al mensaje de resultado...');
                    const header = document.querySelector('header');
                    const headerHeight = header ? header.offsetHeight : (isMobile ? 64 : 80);
                    
                    // Obtener posición del elemento de estado
                    const rect = statusEl.getBoundingClientRect();
                    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || window.scrollY;
                    const elementTop = rect.top + scrollTop;
                    
                    // Calcular posición objetivo
                    const paddingOffset = isMobile ? 15 : 25;
                    const offset = headerHeight + paddingOffset;
                    const targetPosition = Math.max(0, elementTop - offset);
                    
                    console.log('[endBattle] Scroll al resultado calculado:', {
                        plataforma: isMobile ? 'MÓVIL' : 'DESKTOP',
                        elementTop: elementTop,
                        headerHeight: headerHeight,
                        targetPosition: targetPosition,
                        currentScroll: scrollTop
                    });
                    
                    // Hacer scroll suave al mensaje de resultado
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                    
                    // Verificación después del scroll
                    setTimeout(() => {
                        const finalRect = statusEl.getBoundingClientRect();
                        const finalTop = finalRect.top;
                        const viewportHeight = window.innerHeight;
                        const isVisible = finalTop >= headerHeight && finalTop < viewportHeight - 50;
                        
                        console.log('[endBattle] Verificación scroll resultado:', {
                            finalTop: finalTop,
                            headerHeight: headerHeight,
                            viewportHeight: viewportHeight,
                            isVisible: isVisible
                        });
                        
                        // Si no está completamente visible, hacer ajuste fino
                        if (!isVisible || finalTop < headerHeight + 10) {
                            const currentScroll = window.pageYOffset || document.documentElement.scrollTop || window.scrollY;
                            const finalElementTop = finalRect.top + currentScroll;
                            const fineTarget = finalElementTop - headerHeight - paddingOffset;
                            
                            window.scrollTo({
                                top: fineTarget,
                                behavior: 'smooth'
                            });
                            console.log('[endBattle] Ajuste fino aplicado al resultado');
                        }
                    }, 400);
                } catch (scrollError) {
                    console.error('[endBattle] ❌ Error en scroll automático al resultado:', scrollError);
                }
            }, 300); // Pequeño delay para que el mensaje se renderice
        }

        // Calcular ganancias correctamente: pozo total - fee 2%
        const totalPot = match.total_pot || (match.player1_bet * 2);
        const payouts = this.calculateMatchPayouts(totalPot);
        
        if (userWon) {
            // Agregar ganancias calculadas (pozo - fee) al balance de práctica
            const winnings = payouts.winnerPayout;
            this.setPracticeDemoBalance(this.practiceDemoBalance + winnings);
            console.log(`[practice] User won! Pozo: ${totalPot}, Fee (2%): ${payouts.platformFee}, Ganancia: +${winnings} MTR demo`);
            
            // Actualizar mensaje de victoria con ganancia real
            if (statusEl) {
                const isMobile = typeof window !== 'undefined' && (
                    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                    (window.innerWidth <= 768) ||
                    (typeof isMobileDevice === 'function' && isMobileDevice())
                );
                const textSize = isMobile ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl';
                const paddingSize = isMobile ? 'py-3 px-3' : 'py-4 px-6';
                
                statusEl.innerHTML = `<div class="inline-block ${paddingSize} rounded-2xl bg-gradient-to-r from-cyan-500/20 to-cyan-600/20 border-2 border-cyan-400/50 shadow-2xl animate-pulse">
                    <span class="${textSize} text-cyan-300 font-black drop-shadow-lg" style="text-shadow: 0 0 20px rgba(0,243,255,0.8);">
                        🏆 ¡VICTORIA! 🏆
                    </span>
                    <div class="mt-2 ${isMobile ? 'text-sm' : 'text-base'} text-cyan-200 font-bold">
                        Tu canción gana +${winnings} MTR demo
                    </div>
                   </div>`;
            }
        } else {
            console.log('[practice] CPU won - No ganancias');
        }
        this.updatePracticeBetDisplay();
        var self = this;
        setTimeout(function () {
            self.showVictoryScreen(match, winner, userWon, payouts);
        }, 5000);
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
                showToast(`Entry fee: ${tournament.entry_fee} créditos`, 'error');
                return;
            }

            // Check credits balance instead of on-chain balance
            if (!(await this.hasSufficientCredits(betAmount))) {
                return;
            }

            // Descontar créditos ANTES de registrar participante
            const deductionSuccess = await this.updateBalance(-betAmount, 'bet', null);
            if (!deductionSuccess) {
                showToast('Error al descontar créditos. Intenta nuevamente.', 'error');
                return;
            }
            
            // Registrar participante
            const { error } = await supabaseClient
                .from('tournament_participants')
                .insert([{
                    tournament_id: tournamentId,
                    user_id: session.user.id
                }]);
            
            if (error) {
                // Si falla registrar participante después de descontar, reembolsar créditos
                await this.updateBalance(betAmount, 'refund', null);
                throw error;
            }
            
            // Actualizar torneo
            const {
                platformFee,
                jackpotContribution,
                platformNet,
                prizeContribution
            } = this.calculateTournamentEntry(betAmount);
            
            const updateError = await supabaseClient
                .from('tournaments')
                .update({
                    current_participants: tournament.current_participants + 1,
                    prize_pool: tournament.prize_pool + prizeContribution
                })
                .eq('id', tournamentId);

            if (updateError.error) {
                // Si falla actualizar torneo después de registrar participante, reembolsar créditos y eliminar participante
                await this.updateBalance(betAmount, 'refund', null);
                await supabaseClient.from('tournament_participants')
                    .delete()
                    .eq('tournament_id', tournamentId)
                    .eq('user_id', session.user.id);
                throw updateError.error;
            }

            this.addToPlatformRevenue(platformNet);
            this.addToJackpotPool(jackpotContribution);
            
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
            // CRÍTICO: Descontar créditos ANTES de crear el match
            // Si falla la deducción, no se crea el match
            const deductionSuccess = await this.updateBalance(-bet1, 'bet', null);
            if (!deductionSuccess) {
                console.error('[game-engine] Failed to deduct credits, aborting match creation');
                showToast('Error al descontar créditos. Intenta nuevamente.', 'error');
                return;
            }
            
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
            
            // Actualizar matchId en la transacción de créditos si es necesario
            if (match && match.id && window.CreditsSystem) {
                // El backend debería manejar esto, pero podemos intentar actualizar
                const walletAddress = this.connectedWallet || localStorage.getItem('mtr_wallet');
                if (walletAddress) {
                    // Nota: El backend debería asociar la deducción con el matchId
                    // Esto es solo para logging adicional si es necesario
                }
            }
            
            await this.startMatch(match.id);
            
        } catch (error) {
            console.error('Error creating match:', error);
            showToast('Error al crear la partida. Intenta nuevamente.', 'error');
            // Si falla después de descontar, deberíamos reembolsar
            // Por ahora, el usuario debería contactar soporte
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
    
    battleAnimState: null,
    battleAnimFrameId: null,
    battleParticles: [],

    createBattleUI(match) {
        console.log('[createBattleUI] ✅ Creando UI de batalla');
        console.log('[createBattleUI] Match:', match);
        
        // Ocultar todas las secciones principales primero
        const songSelection = document.getElementById('songSelection');
        const waitingScreen = document.getElementById('waitingScreen');
        const roomScreen = document.getElementById('roomScreen');
        const modeSelector = document.getElementById('modeSelector');
        const battleArena = document.getElementById('battleArena');
        
        console.log('[createBattleUI] Elementos encontrados:', {
            songSelection: !!songSelection,
            waitingScreen: !!waitingScreen,
            roomScreen: !!roomScreen,
            modeSelector: !!modeSelector,
            battleArena: !!battleArena
        });
        
        if (songSelection) songSelection.classList.add('hidden');
        if (waitingScreen) waitingScreen.classList.add('hidden');
        if (roomScreen) roomScreen.classList.add('hidden');
        if (modeSelector) modeSelector.classList.add('hidden');
        
        // Si ya existe battleArena, limpiarlo primero
        if (battleArena) {
            console.log('[createBattleUI] Removiendo battleArena existente');
            battleArena.remove();
        }
        
        // Buscar el contenedor principal
        const container = document.querySelector('main');
        if (!container) { 
            console.error('[createBattleUI] ❌ No main container found');
            showToast('Error: No se encontró el contenedor principal', 'error');
            return; 
        }
        
        console.log('[createBattleUI] Contenedor principal encontrado');

        const pot = (match.player1_bet || 0) + (match.player2_bet || 0);
        
        // Crear la sección de batalla y agregarla al contenedor
        console.log('[createBattleUI] Creando elemento battleSection...');
        const battleSection = document.createElement('section');
        battleSection.id = 'battleArena';
        battleSection.className = 'max-w-5xl mx-auto py-6 px-4';
        
        console.log('[createBattleUI] Generando HTML...');
        battleSection.innerHTML = `
            <div class="text-center mb-4">
                <div class="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-white/5 border border-white/10 mb-2">
                    <span class="text-xs text-gray-400 uppercase tracking-widest">Batalla en curso</span>
                    <span class="text-3xl font-black text-white tabular-nums" id="battleTimer">${this.battleDuration}</span>
                    <span class="text-xs text-gray-400">seg</span>
                </div>
                <div class="text-sm text-gray-500">💰 Pot: ${pot} MTR</div>
            </div>

            <div class="relative rounded-2xl overflow-hidden border border-cyan-500/20 bg-black/60 mb-6 h-[300px] sm:h-[340px] md:h-[380px]" id="battleCanvasWrap">
                <canvas id="battleCanvas" class="absolute inset-0 w-full h-full"></canvas>
                <div class="absolute inset-0 flex items-center justify-center px-2 sm:px-6 md:px-12 z-10 pointer-events-none">
                    <!-- Contenedor responsivo con distribución equilibrada -->
                    <div class="flex items-center justify-center w-full max-w-full gap-1 sm:gap-2 md:gap-4">
                        <!-- Fighter 1 - Izquierda -->
                        <div class="text-center flex-shrink-0" id="fighter1Card" style="flex: 0 0 auto; min-width: 0;">
                            <div class="relative inline-block">
                                <img src="${match.player1_song_image}" alt="" class="w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full object-cover border-4 border-cyan-400" style="box-shadow:0 0 25px rgba(0,243,255,0.5)" id="fighter1Img">
                                <div class="absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 rounded-full bg-cyan-500 text-black text-xs font-black flex items-center justify-center" id="fighter1Badge">♪</div>
                            </div>
                            <h3 class="text-white font-bold text-xs sm:text-sm md:text-base mt-1 sm:mt-2 max-w-[90px] sm:max-w-[120px] md:max-w-[140px] truncate">${match.player1_song_name}</h3>
                            <p class="text-cyan-400 text-[10px] sm:text-xs">${match.player1_song_artist}</p>
                            <p class="text-gray-400 text-[10px] sm:text-xs mt-0.5 sm:mt-1">🎧 <span id="plays1">0</span></p>
                        </div>
                        
                        <!-- Video central con VS -->
                        <div class="flex flex-col items-center justify-center gap-1 relative flex-shrink-0" style="z-index: 20; flex: 0 0 auto;">
                            <!-- Video de animación central - Tamaño responsivo -->
                            <div class="relative w-24 h-24 sm:w-40 sm:h-40 md:w-56 md:h-56 rounded-full overflow-hidden border-2 sm:border-4 border-white/20 shadow-2xl" style="box-shadow: 0 0 30px rgba(255,255,255,0.3);">
                                <video 
                                    id="battleCenterVideo" 
                                    autoplay 
                                    loop 
                                    muted 
                                    playsinline
                                    class="w-full h-full object-cover"
                                    style="filter: brightness(1.1) contrast(1.1);">
                                    <source src="./assets/videos/batallas-en-vivo.mp4" type="video/mp4">
                                    Tu navegador no soporta videos HTML5.
                                </video>
                                <!-- Overlay con "VS" semi-transparente sobre el video -->
                                <div class="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <span class="text-2xl sm:text-4xl md:text-6xl font-black text-white/80 drop-shadow-2xl" style="text-shadow: 0 0 20px rgba(255,255,255,0.8);">VS</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Fighter 2 - Derecha -->
                        <div class="text-center flex-shrink-0" id="fighter2Card" style="flex: 0 0 auto; min-width: 0;">
                            <div class="relative inline-block">
                                <img src="${match.player2_song_image}" alt="" class="w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full object-cover border-4 border-fuchsia-400" style="box-shadow:0 0 25px rgba(236,72,153,0.5)" id="fighter2Img">
                                <div class="absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 rounded-full bg-fuchsia-500 text-white text-xs font-black flex items-center justify-center" id="fighter2Badge">♫</div>
                            </div>
                            <h3 class="text-white font-bold text-xs sm:text-sm md:text-base mt-1 sm:mt-2 max-w-[90px] sm:max-w-[120px] md:max-w-[140px] truncate">${match.player2_song_name}</h3>
                            <p class="text-fuchsia-400 text-[10px] sm:text-xs">${match.player2_song_artist}</p>
                            <p class="text-gray-400 text-[10px] sm:text-xs mt-0.5 sm:mt-1">🎧 <span id="plays2">0</span></p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="max-w-3xl mx-auto space-y-3 mb-4">
                <div class="flex items-center gap-3">
                    <span class="text-cyan-400 font-bold text-sm w-12 text-right tabular-nums" id="health1Text">50%</span>
                    <div class="flex-1 h-5 bg-gray-800/80 rounded-full overflow-hidden relative">
                        <div id="health1Fill" class="h-full rounded-full transition-all duration-700 ease-out" style="width:50%;background:linear-gradient(90deg,#06b6d4,#22d3ee);box-shadow:0 0 12px rgba(0,243,255,0.5)"></div>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-fuchsia-400 font-bold text-sm w-12 text-right tabular-nums" id="health2Text">50%</span>
                    <div class="flex-1 h-5 bg-gray-800/80 rounded-full overflow-hidden relative">
                        <div id="health2Fill" class="h-full rounded-full transition-all duration-700 ease-out" style="width:50%;background:linear-gradient(90deg,#d946ef,#ec4899);box-shadow:0 0 12px rgba(236,72,153,0.5)"></div>
                    </div>
                </div>
            </div>
            <div id="battleStatusText" class="text-center py-4 px-4 mb-4"></div>
        `;
        
        console.log('[createBattleUI] HTML generado, agregando al DOM...');
        // Agregar la sección al contenedor
        container.appendChild(battleSection);
        console.log('[createBattleUI] ✅ battleSection agregado al DOM');
        
        // Verificar que el elemento esté visible
        const addedArena = document.getElementById('battleArena');
        if (addedArena) {
            console.log('[createBattleUI] ✅ battleArena encontrado en DOM');
            addedArena.classList.remove('hidden');
            console.log('[createBattleUI] ✅ battleArena visible');
            
            // Detectar si es dispositivo móvil (ANTES del setTimeout)
            const isMobile = typeof window !== 'undefined' && (
                /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                (window.innerWidth <= 768) ||
                (typeof isMobileDevice === 'function' && isMobileDevice())
            );
            
            // SCROLL AUTOMÁTICO AL ÁREA DE BATALLA (CON DETECCIÓN DE PLATAFORMA)
            // Delay más largo para desktop para asegurar renderizado completo
            setTimeout(() => {
                try {
                    // Verificar nuevamente que el elemento existe y está en el DOM
                    const verifyArena = document.getElementById('battleArena');
                    if (!verifyArena) {
                        console.error('[createBattleUI] ❌ battleArena no encontrado en timeout');
                        return;
                    }
                    
                    // Verificar que el elemento tiene dimensiones (está renderizado)
                    const initialRect = verifyArena.getBoundingClientRect();
                    if (initialRect.height === 0 && initialRect.width === 0) {
                        console.warn('[createBattleUI] ⚠️ Elemento sin dimensiones, esperando más tiempo...');
                        setTimeout(() => {
                            // Reintentar después de más tiempo
                            const retryArena = document.getElementById('battleArena');
                            if (retryArena) {
                                retryArena.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        }, 300);
                        return;
                    }
                    
                    console.log('[createBattleUI] Iniciando scroll automático a battleArena...');
                    console.log('[createBattleUI] Plataforma detectada:', isMobile ? 'MÓVIL' : 'DESKTOP');
                    console.log('[createBattleUI] Dimensiones del elemento:', {
                        height: initialRect.height,
                        width: initialRect.width,
                        top: initialRect.top,
                        left: initialRect.left
                    });
                    
                    const header = document.querySelector('header');
                    const headerHeight = header ? header.offsetHeight : (isMobile ? 64 : 80);
                    
                    // Obtener posición del elemento DESPUÉS de verificar renderizado
                    const rect = verifyArena.getBoundingClientRect();
                    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || window.scrollY;
                    const elementTop = rect.top + scrollTop;
                    
                    // Calcular offset según plataforma
                    // Móvil: menos padding, más preciso
                    // Desktop: más padding, más espacio
                    const paddingOffset = isMobile ? 10 : 20;
                    const offset = headerHeight + paddingOffset;
                    const targetPosition = Math.max(0, elementTop - offset);
                    
                    console.log('[createBattleUI] Scroll calculado:', {
                        plataforma: isMobile ? 'MÓVIL' : 'DESKTOP',
                        elementTop: elementTop,
                        headerHeight: headerHeight,
                        paddingOffset: paddingOffset,
                        offset: offset,
                        targetPosition: targetPosition,
                        currentScroll: scrollTop,
                        windowWidth: window.innerWidth,
                        windowHeight: window.innerHeight,
                        elementHeight: rect.height
                    });
                    
                    // En móvil, usar scrollIntoView con mejor configuración
                    if (isMobile) {
                        console.log('[createBattleUI] Usando scrollIntoView para móvil...');
                        
                        // Primero asegurar que el elemento esté completamente renderizado
                        requestAnimationFrame(() => {
                            // Obtener posición precisa después del render
                            const rect = addedArena.getBoundingClientRect();
                            const scrollTop = window.pageYOffset || document.documentElement.scrollTop || window.scrollY;
                            const elementTop = rect.top + scrollTop;
                            const targetPos = Math.max(0, elementTop - headerHeight - 5);
                            
                            console.log('[createBattleUI] Scroll móvil preciso:', {
                                elementTop: elementTop,
                                targetPos: targetPos,
                                currentScroll: scrollTop
                            });
                            
                            // Usar scrollTo con posición calculada para mayor precisión
                            window.scrollTo({
                                top: targetPos,
                                behavior: 'smooth'
                            });
                            
                            // Verificación y ajuste fino después del scroll
                            setTimeout(() => {
                                const finalRect = addedArena.getBoundingClientRect();
                                const finalTop = finalRect.top;
                                const expectedTop = headerHeight + 5;
                                
                                console.log('[createBattleUI] Verificación móvil:', {
                                    finalTop: finalTop,
                                    expectedTop: expectedTop,
                                    diferencia: finalTop - expectedTop
                                });
                                
                                // Ajuste fino si es necesario
                                if (Math.abs(finalTop - expectedTop) > 10) {
                                    const currentScroll = window.pageYOffset || document.documentElement.scrollTop || window.scrollY;
                                    const adjustment = finalTop - expectedTop;
                                    window.scrollTo({
                                        top: currentScroll - adjustment,
                                        behavior: 'smooth'
                                    });
                                    console.log('[createBattleUI] Ajuste fino móvil aplicado:', -adjustment);
                                }
                                
                                // Verificación final - asegurar que battleArena esté visible
                                const finalCheck = addedArena.getBoundingClientRect();
                                const viewportHeight = window.innerHeight;
                                const isVisible = finalCheck.top >= headerHeight && finalCheck.top < viewportHeight - 100;
                                
                                if (!isVisible) {
                                    console.warn('[createBattleUI] ⚠️ battleArena no está completamente visible, ajustando...');
                                    const finalScroll = window.pageYOffset || document.documentElement.scrollTop || window.scrollY;
                                    const finalElementTop = finalCheck.top + finalScroll;
                                    window.scrollTo({
                                        top: finalElementTop - headerHeight - 10,
                                        behavior: 'smooth'
                                    });
                                }
                            }, 500);
                        });
                    } else {
                        // Desktop: usar método mejorado y más robusto
                        console.log('[createBattleUI] Usando scroll mejorado para desktop...');
                        
                        // CRÍTICO: Verificar que estamos scrollando al elemento correcto
                        const elementId = verifyArena.id;
                        console.log('[createBattleUI] Verificando elemento para desktop:', {
                            id: elementId,
                            isCorrectElement: elementId === 'battleArena',
                            elementExists: !!verifyArena,
                            elementInDOM: document.body.contains(verifyArena)
                        });
                        
                        if (elementId !== 'battleArena' || !verifyArena) {
                            console.error('[createBattleUI] ❌ ERROR DESKTOP: Elemento incorrecto o no encontrado!');
                            return;
                        }
                        
                        // Método más robusto: usar múltiples requestAnimationFrame y verificación de posición
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    // Obtener posición ABSOLUTA del elemento en el documento DESPUÉS de múltiples frames
                                    const rect = verifyArena.getBoundingClientRect();
                                    const currentScrollY = window.pageYOffset || document.documentElement.scrollTop || window.scrollY;
                                    const absoluteTop = rect.top + currentScrollY;
                                    
                                    // Verificar que el elemento tiene posición válida
                                    if (rect.height === 0 || rect.width === 0) {
                                        console.warn('[createBattleUI] ⚠️ Elemento sin dimensiones válidas, usando scrollIntoView como fallback');
                                        verifyArena.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        return;
                                    }
                                    
                                    // Calcular posición objetivo: posición absoluta menos header menos padding
                                    const desktopPaddingOffset = 25; // Padding adecuado para desktop
                                    const desktopOffset = headerHeight + desktopPaddingOffset;
                                    const desktopTargetPosition = Math.max(0, absoluteTop - desktopOffset);
                                    
                                    console.log('[createBattleUI] Scroll desktop calculado (después de 3 RAF):', {
                                        rectTop: rect.top,
                                        rectHeight: rect.height,
                                        currentScrollY: currentScrollY,
                                        absoluteTop: absoluteTop,
                                        headerHeight: headerHeight,
                                        desktopPaddingOffset: desktopPaddingOffset,
                                        desktopOffset: desktopOffset,
                                        desktopTargetPosition: desktopTargetPosition,
                                        windowWidth: window.innerWidth,
                                        windowHeight: window.innerHeight
                                    });
                                    
                                    // Hacer scroll DIRECTO a la posición calculada (instantáneo primero para precisión)
                                    window.scrollTo({
                                        top: desktopTargetPosition,
                                        behavior: 'auto' // Instantáneo primero
                                    });
                                    
                                    // Después de scroll instantáneo, verificar y hacer ajuste fino suave
                                    setTimeout(() => {
                                        const verifyRect = verifyArena.getBoundingClientRect();
                                        const verifyScroll = window.pageYOffset || document.documentElement.scrollTop || window.scrollY;
                                        const verifyTop = verifyRect.top;
                                        const expectedTop = headerHeight + desktopPaddingOffset;
                                        const difference = verifyTop - expectedTop;
                                        
                                        console.log('[createBattleUI] Verificación desktop después de scroll instantáneo:', {
                                            verifyTop: verifyTop,
                                            expectedTop: expectedTop,
                                            diferencia: difference,
                                            verifyScroll: verifyScroll,
                                            isInViewport: verifyTop >= headerHeight && verifyTop < window.innerHeight - 50
                                        });
                                        
                                        // Si hay diferencia significativa, hacer ajuste fino suave
                                        if (Math.abs(difference) > 5) {
                                            const adjustedPosition = verifyRect.top + verifyScroll - desktopOffset;
                                            console.log('[createBattleUI] Aplicando ajuste fino desktop a:', adjustedPosition);
                                            
                                            window.scrollTo({
                                                top: Math.max(0, adjustedPosition),
                                                behavior: 'smooth'
                                            });
                                            
                                            // Verificación final después del ajuste
                                            setTimeout(() => {
                                                const finalRect = verifyArena.getBoundingClientRect();
                                                const finalTop = finalRect.top;
                                                const finalScroll = window.pageYOffset || document.documentElement.scrollTop || window.scrollY;
                                                
                                                console.log('[createBattleUI] Verificación FINAL desktop:', {
                                                    finalTop: finalTop,
                                                    finalScroll: finalScroll,
                                                    headerHeight: headerHeight,
                                                    isCorrectlyPositioned: finalTop >= headerHeight && finalTop <= headerHeight + 40,
                                                    elementVisible: finalTop >= 0 && finalTop < window.innerHeight
                                                });
                                                
                                                // Verificar que NO estamos en otra sección (como contactSection o depositSection)
                                                const contactSection = document.getElementById('contactSection');
                                                const depositSection = document.querySelector('[id*="deposit"], [class*="deposit"]');
                                                
                                                if (contactSection) {
                                                    const contactRect = contactSection.getBoundingClientRect();
                                                    const contactTop = contactRect.top;
                                                    const contactDistance = Math.abs(contactTop - finalTop);
                                                    
                                                    console.log('[createBattleUI] Verificando distancia a contactSection:', {
                                                        contactTop: contactTop,
                                                        battleArenaTop: finalTop,
                                                        distance: contactDistance
                                                    });
                                                    
                                                    // Si estamos muy cerca de contactSection (menos de 200px), corregir
                                                    if (contactDistance < 200 && contactTop < finalTop) {
                                                        console.warn('[createBattleUI] ⚠️ Detectado scroll incorrecto cerca de contactSection, corrigiendo...');
                                                        const correctPosition = finalRect.top + finalScroll - desktopOffset;
                                                        window.scrollTo({
                                                            top: Math.max(0, correctPosition),
                                                            behavior: 'smooth'
                                                        });
                                                        return;
                                                    }
                                                }
                                                
                                                // Verificación final de posición
                                                if (finalTop < headerHeight || finalTop > headerHeight + 50) {
                                                    console.warn('[createBattleUI] ⚠️ Posición desktop aún no perfecta, último ajuste...');
                                                    const lastPosition = finalRect.top + finalScroll - desktopOffset;
                                                    window.scrollTo({
                                                        top: Math.max(0, lastPosition),
                                                        behavior: 'smooth'
                                                    });
                                                } else {
                                                    console.log('[createBattleUI] ✅ battleArena PERFECTAMENTE posicionado en desktop');
                                                }
                                            }, 600);
                                        } else {
                                            console.log('[createBattleUI] ✅ Posición desktop correcta desde el primer intento');
                                        }
                                    }, 150); // Delay un poco más largo para desktop
                                });
                            });
                        });
                    }
                } catch (scrollError) {
                    console.error('[createBattleUI] ❌ Error en scroll automático:', scrollError);
                    console.error('[createBattleUI] Stack:', scrollError.stack);
                    // Fallback: usar scrollIntoView si hay error
                    try {
                        const fallbackArena = document.getElementById('battleArena');
                        if (fallbackArena) {
                            console.log('[createBattleUI] Usando scrollIntoView como fallback...');
                            fallbackArena.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    } catch (fallbackError) {
                        console.error('[createBattleUI] ❌ Error en fallback:', fallbackError);
                    }
                }
            }, isMobile ? 200 : 300); // Delay más largo para desktop (300ms) para asegurar renderizado completo
        } else {
            console.error('[createBattleUI] ❌ battleArena NO encontrado después de agregar');
        }
        
        // Inicializar el canvas después de agregar al DOM
        setTimeout(() => {
            try {
                console.log('[createBattleUI] Inicializando canvas...');
                this.initBattleCanvas();
                console.log('[createBattleUI] ✅ Canvas inicializado');
                
                // Inicializar video central
                const battleVideo = document.getElementById('battleCenterVideo');
                if (battleVideo) {
                    console.log('[createBattleUI] Inicializando video central...');
                    battleVideo.load(); // Precargar el video
                    battleVideo.play().catch(error => {
                        console.warn('[createBattleUI] Error al reproducir video automáticamente:', error);
                        // Intentar reproducir después de interacción del usuario
                        document.addEventListener('click', function playVideoOnce() {
                            battleVideo.play().catch(() => {});
                            document.removeEventListener('click', playVideoOnce);
                        }, { once: true });
                    });
                    console.log('[createBattleUI] ✅ Video central inicializado');
                } else {
                    console.warn('[createBattleUI] ⚠️ battleCenterVideo no encontrado');
                }
            } catch (canvasError) {
                console.error('[createBattleUI] ❌ Error initializing canvas:', canvasError);
                console.error('[createBattleUI] Stack:', canvasError.stack);
            }
        }, 100);
    },

    initBattleCanvas() {
        var canvas = document.getElementById('battleCanvas');
        var wrap = document.getElementById('battleCanvasWrap');
        if (!canvas || !wrap) return;
        canvas.width = wrap.offsetWidth;
        canvas.height = wrap.offsetHeight;
        this.battleAnimState = { h1: 50, h2: 50, time: this.battleDuration, finished: false, winner: 0 };
        this.battleParticles = [];
        var self = this;
        function loop() {
            self.battleAnimFrameId = requestAnimationFrame(loop);
            self.drawBattleFrame(canvas);
        }
        loop();
    },

    drawBattleFrame(canvas) {
        var ctx = canvas.getContext('2d');
        var w = canvas.width, h = canvas.height;
        var st = this.battleAnimState;
        if (!st) return;
        var t = performance.now() * 0.001;
        ctx.clearRect(0, 0, w, h);

        for (var wave = 0; wave < 5; wave++) {
            var baseY = h * 0.5 + (wave - 2) * 22;
            var isCyan = wave % 2 === 0;
            var lead = st.h1 - 50;
            var alpha = 0.12 + Math.abs(lead) * 0.003 + Math.sin(t + wave) * 0.05;
            ctx.beginPath();
            ctx.strokeStyle = isCyan ? 'rgba(0,243,255,' + alpha + ')' : 'rgba(236,72,153,' + alpha + ')';
            ctx.lineWidth = 1.2;
            for (var x = 0; x <= w; x += 4) {
                var amp = 12 + Math.abs(lead) * 0.3 + Math.sin(t * 0.3 + wave) * 6;
                var y = baseY + Math.sin(x * 0.007 + t * 1.5 + wave * 0.9) * amp;
                if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        var cx = w * 0.5, cy = h * 0.5;
        if (!st.finished) {
            var lead1 = Math.max(0, st.h1 - 50) / 50;
            var lead2 = Math.max(0, st.h2 - 50) / 50;
            if (Math.random() < 0.15 + lead1 * 0.3) {
                this.battleParticles.push({ x: w * 0.18, y: cy + (Math.random() - 0.5) * 80, vx: 1.5 + Math.random() * 2, vy: (Math.random() - 0.5) * 1.5, life: 1, decay: 0.015 + Math.random() * 0.01, size: 2 + Math.random() * 3, color: 'cyan' });
            }
            if (Math.random() < 0.15 + lead2 * 0.3) {
                this.battleParticles.push({ x: w * 0.82, y: cy + (Math.random() - 0.5) * 80, vx: -(1.5 + Math.random() * 2), vy: (Math.random() - 0.5) * 1.5, life: 1, decay: 0.015 + Math.random() * 0.01, size: 2 + Math.random() * 3, color: 'magenta' });
            }
        }

        for (var i = this.battleParticles.length - 1; i >= 0; i--) {
            var p = this.battleParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0) { this.battleParticles.splice(i, 1); continue; }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            var c = p.color === 'cyan' ? '0,243,255' : (p.color === 'gold' ? '255,215,0' : '236,72,153');
            ctx.fillStyle = 'rgba(' + c + ',' + (p.life * 0.7) + ')';
            ctx.shadowColor = 'rgba(' + c + ',0.5)';
            ctx.shadowBlur = 8 * p.life;
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        if (!st.finished && st.time <= 10) {
            var pulse = Math.sin(t * 4) * 0.3 + 0.3;
            ctx.fillStyle = 'rgba(255,50,50,' + (pulse * 0.08) + ')';
            ctx.fillRect(0, 0, w, h);
        }

        if (st.finished) {
            var winC = st.winner === 1 ? '0,243,255' : '236,72,153';
            var pulse2 = Math.sin(t * 3) * 0.15 + 0.15;
            var grad = ctx.createRadialGradient(st.winner === 1 ? w * 0.18 : w * 0.82, cy, 0, st.winner === 1 ? w * 0.18 : w * 0.82, cy, 200);
            grad.addColorStop(0, 'rgba(' + winC + ',' + (pulse2 + 0.1) + ')');
            grad.addColorStop(1, 'rgba(' + winC + ',0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }
    },

    spawnVictoryParticles(winner) {
        var canvas = document.getElementById('battleCanvas');
        if (!canvas) return;
        var w = canvas.width, h = canvas.height;
        var ox = winner === 1 ? w * 0.18 : w * 0.82;
        var oy = h * 0.5;
        var color = winner === 1 ? 'cyan' : 'magenta';
        for (var i = 0; i < 60; i++) {
            var angle = Math.random() * Math.PI * 2;
            var speed = 2 + Math.random() * 5;
            this.battleParticles.push({ x: ox, y: oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, decay: 0.008 + Math.random() * 0.008, size: 3 + Math.random() * 5, color: Math.random() > 0.3 ? color : 'gold' });
        }
    },

    destroyBattleCanvas() {
        if (this.battleAnimFrameId) cancelAnimationFrame(this.battleAnimFrameId);
        this.battleAnimFrameId = null;
        this.battleAnimState = null;
        this.battleParticles = [];
    },
    
    async runBattle(match) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const isPlayer1 = session.user.id === match.player1_id;
        
        // Reproducir SOLO la canción del usuario
        const userSong = isPlayer1 ? match.player1_song_preview : match.player2_song_preview;
        this.playUserSong(userSong);
        
        // Initialize real-time streams tracking
        this.initializeStreamsTracking(match);
        
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

            // Use real-time streams data if available, otherwise fallback to calculated
            const streamData = this.getRealTimeStreams(match.id);
            if (streamData && streamData.lastUpdate > Date.now() - 10000) {
                // Use real-time data (updated within last 10 seconds)
                plays1 = streamData.streams1;
                plays2 = streamData.streams2;
                health1 = streamData.percentage1;
                health2 = streamData.percentage2;
            } else {
                // Fallback to calculated increments
                plays1 += this.calculatePlaysIncrement(basePlays1);
                plays2 += this.calculatePlaysIncrement(basePlays2);
                const totalPlays = plays1 + plays2;
                const share1 = totalPlays > 0 ? (plays1 / totalPlays) * 100 : 50;
                const share2 = 100 - share1;
                health1 = Math.max(0, Math.min(100, share1));
                health2 = Math.max(0, Math.min(100, share2));
            }
            
            this.updateBattleRhythmAnimation(timeLeft, plays1, plays2);
            
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
                // Use real-time streams for final determination
                const finalStreamData = this.getRealTimeStreams(match.id);
                if (finalStreamData) {
                    plays1 = finalStreamData.streams1;
                    plays2 = finalStreamData.streams2;
                    health1 = finalStreamData.percentage1;
                    health2 = finalStreamData.percentage2;
                }
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
        // Determine winner based on real-time stream percentages
        let winner = null;
        if (window.StreamsRealtime) {
            winner = window.StreamsRealtime.determineWinner(match.id);
        }
        
        // Fallback to plays comparison if real-time determination fails
        if (winner === null) {
            winner = plays1 > plays2 ? 1 : 2;
        }
        
        const userWon = (isPlayer1 && winner === 1) || (!isPlayer1 && winner === 2);
        const payouts = this.calculateMatchPayouts(match.total_pot);
        
        // Stop streams tracking
        this.stopStreamsTracking(match.id);
        
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
                // Award credits instead of MTR directly
                const creditsWon = payouts.winnerPayout; // Credits amount (ya con fee descontado)
                await this.awardCredits(creditsWon, match.id);
                // NO llamar updateBalance aquí para evitar duplicación
            }
            // Enviar fee de apuesta (2%) al vault
            await this.sendBetFeeToVault(payouts.platformFee, match.id);
            this.addToPlatformRevenue(payouts.platformFee);
            await this.logPlatformFeeTransaction(match.id, payouts.platformFee);
        } else {
            if (userWon) {
                // En práctica, calcular ganancias correctamente: pozo total - fee 2%
                const totalPot = match.total_pot || 0;
                const practicePayouts = this.calculateMatchPayouts(totalPot);
                const winnings = practicePayouts.winnerPayout;
                this.setPracticeDemoBalance(this.practiceDemoBalance + winnings);
                console.log(`[practice] User won! Pozo: ${totalPot}, Fee (2%): ${practicePayouts.platformFee}, Ganancia: +${winnings} MTR demo`);
                this.updatePracticeBetDisplay();
            }
        }
        
        this.finalizeBattleRhythmAnimation(winner);

        // Mostrar resultado después de 15 segundos
        setTimeout(() => {
            this.showVictoryScreen(match, winner, userWon, payouts);
        }, 15000);
    },
    
    showVictoryScreen(match, winner, userWon, payouts) {
        this.destroyBattleCanvas();
        var winnerName = winner === 1 ? match.player1_song_name : match.player2_song_name;
        var winnerImg = winner === 1 ? match.player1_song_image : match.player2_song_image;
        var prize = userWon ? payouts.winnerPayout : 0;
        var isPractice = match.match_type === 'practice';
        var accentColor = userWon ? 'cyan' : 'fuchsia';
        var glowClass = userWon ? 'shadow-[0_0_40px_rgba(0,243,255,0.4)]' : 'shadow-[0_0_40px_rgba(239,68,68,0.3)]';

        var container = document.querySelector('main') || document.querySelector('.container');
        container.innerHTML = '<section id="victorySection" class="max-w-3xl mx-auto py-12 px-4 text-center relative min-h-[500px]">' +
            '<canvas id="victoryCanvas" class="absolute inset-0 w-full h-full pointer-events-none rounded-2xl"></canvas>' +
            '<div class="relative z-10">' +
            '<div class="text-7xl sm:text-8xl mb-4" style="animation:bounce 0.6s ease-out">' + (userWon ? '🏆' : '😔') + '</div>' +
            '<h1 class="text-4xl sm:text-6xl font-black mb-3 ' + (userWon ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-white to-fuchsia-400' : 'text-red-400') + '" style="animation:fadeInUp 0.5s ease-out">' + (userWon ? '¡VICTORIA!' : 'Derrota') + '</h1>' +
            '<div class="flex items-center justify-center gap-4 mb-4">' +
            '<img src="' + winnerImg + '" class="w-16 h-16 rounded-full border-2 border-' + accentColor + '-400 ' + glowClass + '">' +
            '<h2 class="text-xl sm:text-2xl font-bold text-white">' + winnerName + '</h2>' +
            '</div>' +
            (prize > 0 ? '<p class="text-3xl sm:text-4xl font-black text-cyan-400 mb-6" style="text-shadow:0 0 20px rgba(0,243,255,0.5);animation:pulse 1s ease-in-out infinite">+' + prize + ' MTR</p>' : '<p class="text-lg text-gray-400 mb-6">Mejor suerte la próxima vez</p>') +
            (!isPractice && payouts.platformFee ? '<div class="text-sm text-gray-500 mb-6 space-y-1"><p>Comisión: ' + payouts.platformFee + ' MTR</p><p>Pago ganador: ' + payouts.winnerPayout + ' MTR</p></div>' : '') +
            (this.lastPrizeTxHash ? '<p class="text-sm text-cyan-400 mb-4">Tx: <a href="https://basescan.org/tx/' + this.lastPrizeTxHash + '" target="_blank" class="underline">' + this.lastPrizeTxHash.slice(0, 14) + '...</a></p>' : '') +
            '<button onclick="' + (isPractice ? 'GameEngine.goToPracticeSelection()' : 'location.reload()') + '" class="px-8 py-3 rounded-xl text-lg font-bold bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-white hover:opacity-90 transition-all shadow-lg shadow-cyan-500/25 cursor-pointer">' +
            (isPractice ? '🎯 Continuar en práctica' : '🔄 Jugar de Nuevo') +
            '</button>' +
            '</div></section>';

        this.initVictoryCanvas(userWon);
        
        // SCROLL AUTOMÁTICO A LA PANTALLA DE VICTORIA
        setTimeout(() => {
            try {
                const victorySection = document.getElementById('victorySection');
                if (victorySection) {
                    // Detectar si es móvil
                    const isMobile = typeof window !== 'undefined' && (
                        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                        (window.innerWidth <= 768) ||
                        (typeof isMobileDevice === 'function' && isMobileDevice())
                    );
                    
                    console.log('[showVictoryScreen] Iniciando scroll automático a pantalla de victoria...');
                    console.log('[showVictoryScreen] Plataforma:', isMobile ? 'MÓVIL' : 'DESKTOP');
                    
                    const header = document.querySelector('header');
                    const headerHeight = header ? header.offsetHeight : (isMobile ? 64 : 80);
                    
                    // Obtener posición del elemento
                    const rect = victorySection.getBoundingClientRect();
                    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || window.scrollY;
                    const elementTop = rect.top + scrollTop;
                    
                    // Calcular posición objetivo
                    const paddingOffset = isMobile ? 15 : 25;
                    const offset = headerHeight + paddingOffset;
                    const targetPosition = Math.max(0, elementTop - offset);
                    
                    console.log('[showVictoryScreen] Scroll calculado:', {
                        plataforma: isMobile ? 'MÓVIL' : 'DESKTOP',
                        elementTop: elementTop,
                        headerHeight: headerHeight,
                        targetPosition: targetPosition
                    });
                    
                    // Hacer scroll suave a la pantalla de victoria
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                    
                    // Verificación después del scroll
                    setTimeout(() => {
                        const finalRect = victorySection.getBoundingClientRect();
                        const finalTop = finalRect.top;
                        const viewportHeight = window.innerHeight;
                        const isVisible = finalTop >= headerHeight && finalTop < viewportHeight - 50;
                        
                        console.log('[showVictoryScreen] Verificación scroll:', {
                            finalTop: finalTop,
                            headerHeight: headerHeight,
                            isVisible: isVisible
                        });
                        
                        // Si no está completamente visible, hacer ajuste fino
                        if (!isVisible || finalTop < headerHeight + 10) {
                            const currentScroll = window.pageYOffset || document.documentElement.scrollTop || window.scrollY;
                            const finalElementTop = finalRect.top + currentScroll;
                            const fineTarget = finalElementTop - headerHeight - paddingOffset;
                            
                            window.scrollTo({
                                top: fineTarget,
                                behavior: 'smooth'
                            });
                            console.log('[showVictoryScreen] Ajuste fino aplicado');
                        }
                    }, 400);
                } else {
                    console.warn('[showVictoryScreen] ⚠️ victorySection no encontrado');
                }
            } catch (scrollError) {
                console.error('[showVictoryScreen] ❌ Error en scroll automático:', scrollError);
            }
        }, 200); // Pequeño delay para que el elemento se renderice
    },

    initVictoryCanvas(userWon) {
        var canvas = document.getElementById('victoryCanvas');
        var section = document.getElementById('victorySection');
        if (!canvas || !section) return;
        canvas.width = section.offsetWidth;
        canvas.height = section.offsetHeight;
        var particles = [];
        var w = canvas.width, h = canvas.height;
        var colors = userWon ? ['0,243,255', '255,215,0', '192,132,252', '34,211,238'] : ['239,68,68', '156,163,175', '107,114,128'];

        for (var i = 0; i < (userWon ? 80 : 20); i++) {
            particles.push({ x: Math.random() * w, y: -20 - Math.random() * 100, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 3, size: 2 + Math.random() * 4, color: colors[Math.floor(Math.random() * colors.length)], life: 1, decay: 0.002 + Math.random() * 0.003, rotation: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.1 });
        }

        var ctx = canvas.getContext('2d');
        var frameId = null;
        function draw() {
            frameId = requestAnimationFrame(draw);
            ctx.clearRect(0, 0, w, h);
            for (var i = particles.length - 1; i >= 0; i--) {
                var p = particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.rotation += p.spin;
                p.life -= p.decay;
                if (p.life <= 0 || p.y > h + 20) {
                    if (userWon) { p.x = Math.random() * w; p.y = -10; p.life = 1; }
                    else { particles.splice(i, 1); continue; }
                }
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillStyle = 'rgba(' + p.color + ',' + (p.life * 0.8) + ')';
                ctx.shadowColor = 'rgba(' + p.color + ',0.4)';
                ctx.shadowBlur = 6;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
                ctx.restore();
            }
            if (!particles.length && frameId) cancelAnimationFrame(frameId);
        }
        draw();
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
            console.log('[wallet] connectWallet() request');
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
            const chainId = Number.parseInt(chainIdHex, 16);
            if (accounts && accounts.length > 0) {
                this.connectedWallet = accounts[0];
                localStorage.setItem('mtr_wallet', accounts[0]);
                localStorage.setItem('mtr_wallet_chain', this.getChainNameFromId(chainId));
                this.updateWalletDisplay();
                console.log('[wallet] connected', { address: accounts[0], chainId });
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
            42161: 'arbitrum',
            59144: 'linea',
            8453: 'base',
            11155111: 'ethereum'
        };
        return map[chainId] || 'base';
    },


    getPreferredNetwork() {
        const configured = localStorage.getItem('mtr_preferred_network');
        if (configured) return configured;

        const connectedChain = localStorage.getItem('mtr_wallet_chain');
        if (connectedChain === 'base') return connectedChain;

        return 'base';
    },

    getPlatformWalletAddress() {
        const addresses = window.PLATFORM_WALLET_ADDRESSES || {};
        const preferredOrder = [
            this.getPreferredNetwork(),
            'base',
            'ethereum',
            'optimism',
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
        // NUEVO: Fee de apuesta fijo 2% (va al vault)
        const BET_FEE_RATE = 0.02; // 2%
        const betFee = totalPot * BET_FEE_RATE;
        const winnerPayout = totalPot - betFee;
        
        return {
            platformFee: betFee, // Fee va al vault
            winnerPayout: winnerPayout // Ganador recibe pozo - fee
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
        const runtimeConfig = window.CONFIG || (typeof CONFIG !== 'undefined' ? CONFIG : null);
        const configuredBase = runtimeConfig?.BACKEND_API || window.APP_BACKEND_API || '';
        return String(configuredBase || '').trim().replace(/\/$/, '');
    },

    getBackendCandidates() {
        const configuredBase = (this.getBackendApiBase() || '').trim().replace(/\/$/, '');
        const sameOriginBase = window.location.origin;

        const candidates = [];
        if (configuredBase) candidates.push(configuredBase);

        // Fallback útil cuando el backend está detrás del mismo dominio y el CORS de un host externo falla.
        if (!configuredBase || configuredBase !== sameOriginBase) {
            candidates.push(sameOriginBase);
        }

        return [...new Set(candidates)];
    },

    async backendRequest(path, payload = {}) {
        const backendCandidates = this.getBackendCandidates();

        const { data: { session } } = await supabaseClient.auth.getSession();
        const token = session?.access_token;

        let networkError = null;

        for (const base of backendCandidates) {
            try {
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
            } catch (error) {
                networkError = error;
                console.warn(`Backend request failed against ${base}${path}:`, error);
            }
        }

        console.error('Backend request failed for all candidates:', networkError);
        showToast('No se pudo conectar al backend (CORS/red). Intenta recargar o usar el mismo dominio del backend.', 'error');
        return null;
    },

    async verifyDepositAndCredit(txHash, options = {}) {
        if (!txHash || txHash.length < 12) {
            showToast('Hash inválido', 'error');
            return null;
        }

        try {
            const data = await this.backendRequest('/api/deposits/verify', {
                txHash,
                network: options.network || 'base',
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
                network: 'base'
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
                network: options.network || 'base',
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

    async sendPrizeToWinner(winnerAddress, amountMtr, matchId = null) {
        if (!winnerAddress || !amountMtr) {
            console.error('[prize] Invalid parameters:', { winnerAddress, amountMtr });
            showToast('Error: Parámetros inválidos para envío de premio', 'error');
            return null;
        }

        // Validate address format
        if (!/^0x[a-fA-F0-9]{40}$/.test(winnerAddress)) {
            console.error('[prize] Invalid wallet address format:', winnerAddress);
            showToast('Error: Dirección de wallet inválida', 'error');
            return null;
        }

        // Validate amount (minimum MIN_BET_AMOUNT créditos for payout)
        const normalizedAmount = Math.max(this.minBet, Math.round(amountMtr));
        if (normalizedAmount < this.minBet) {
            console.error('[prize] Amount below minimum:', normalizedAmount);
            showToast(`Error: Monto mínimo para payout es ${this.minBet} MTR`, 'error');
            return null;
        }

        try {
            console.log('[prize] Sending prize request to backend', { winnerAddress, amountMtr: normalizedAmount, matchId });
            
            // Try backend API first
            let data = null;
            try {
                data = await this.backendRequest('/api/prizes/send', {
                    winner: winnerAddress,
                    amount: normalizedAmount,
                    matchId,
                    network: 'base',
                    token: 'MTR',
                    tokenAddress: '0x99cd1eb32846c9027ed9cb8710066fa08791c33b'
                });
            } catch (backendError) {
                console.warn('[prize] Backend API failed, trying direct on-chain:', backendError);
                // Fallback to direct on-chain call if backend fails
                data = await this.sendPrizeOnChain(winnerAddress, normalizedAmount);
            }

            if (data?.txHash) {
                this.lastPrizeTxHash = data.txHash;
                showToast(`Premio enviado! Tx: ${data.txHash.slice(0, 10)}...`, 'success');
                console.log('[prize] Prize tx hash', data.txHash);
            } else {
                throw new Error('No transaction hash returned');
            }
            return data;
        } catch (error) {
            console.error('[prize] Error sending prize:', error);
            const errorMsg = error?.message || 'Error desconocido al enviar premio';
            showToast(`Error: ${errorMsg}`, 'error');
            return null;
        }
    },

    /**
     * Send prize directly on-chain using viem/wagmi pattern
     */
    async sendPrizeOnChain(winnerAddress, amountMtr) {
        // This would require viem to be available in the context
        // For now, return error to use backend API
        throw new Error('Direct on-chain payout requires backend API. Please ensure backend is available.');
    },

    /**
     * Initialize real-time streams tracking for a match
     */
    initializeStreamsTracking(match) {
        if (!window.StreamsRealtime) {
            console.warn('[game-engine] StreamsRealtime module not loaded, using fallback');
            return;
        }

        const song1 = {
            id: match.player1_song_id,
            name: match.player1_song_name,
            artist: match.player1_song_artist
        };
        const song2 = {
            id: match.player2_song_id,
            name: match.player2_song_name,
            artist: match.player2_song_artist
        };

        this.activeStreamTracking = match.id;
        window.StreamsRealtime.startTracking(match.id, song1, song2, (streams1, streams2, pct1, pct2) => {
            // Real-time update callback
            console.log(`[game-engine] Streams update: ${streams1} vs ${streams2} (${pct1.toFixed(1)}% vs ${pct2.toFixed(1)}%)`);
        });
    },

    /**
     * Stop streams tracking for a match
     */
    stopStreamsTracking(matchId) {
        if (window.StreamsRealtime && matchId) {
            window.StreamsRealtime.stopTracking(matchId);
            if (this.activeStreamTracking === matchId) {
                this.activeStreamTracking = null;
            }
        }
    },

    /**
     * Get real-time streams data for a match
     */
    getRealTimeStreams(matchId) {
        if (!window.StreamsRealtime || !matchId) {
            return null;
        }
        return window.StreamsRealtime.getStreamPercentages(matchId);
    },

    // ==========================================
    // BALANCE
    // ==========================================
    
    /**
     * Award credits to user (for wins)
     * NUEVO: Los créditos otorgados ya tienen el fee del 2% descontado del pozo
     */
    async awardCredits(credits, matchId = null) {
        try {
            const walletAddress = this.connectedWallet || localStorage.getItem('mtr_wallet');
            if (!walletAddress || !window.CreditsSystem) {
                console.warn('[game-engine] Cannot award credits: wallet or CreditsSystem not available');
                return;
            }

            // Update credits via backend API
            const backendUrl = window.CONFIG?.BACKEND_API || 'https://musictoken-backend.onrender.com';
            const userId = await window.CreditsSystem.getUserId(walletAddress);
            
            if (userId) {
                // Add credits via backend
                const response = await fetch(`${backendUrl}/api/user/add-credits`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId,
                        credits: credits,
                        reason: 'match_win',
                        matchId: matchId
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[game-engine] Error adding credits:', errorText);
                    showToast('Error al otorgar créditos. Contacta soporte.', 'error');
                    return;
                }

                // Record win in database
                const { data: { session } } = await supabaseClient.auth.getSession();
                if (session?.user?.id) {
                    await supabaseClient
                        .from('match_wins')
                        .insert([{
                            user_id: session.user.id,
                            match_id: matchId,
                            credits_won: credits,
                            created_at: new Date().toISOString()
                        }]);
                }

                // Reload credits balance
                await window.CreditsSystem.loadBalance(walletAddress);
                showToast(`¡Ganaste ${credits.toFixed(2)} créditos (estables)!`, 'success');
            }
        } catch (error) {
            console.error('[game-engine] Error awarding credits:', error);
            showToast('Error al otorgar créditos. Contacta soporte.', 'error');
        }
    },

    /**
     * Send bet fee to vault (2% del pozo)
     */
    async sendBetFeeToVault(feeAmount, matchId) {
        try {
            const backendUrl = window.CONFIG?.BACKEND_API || 'https://musictoken-backend.onrender.com';
            
            // Registrar fee en backend para que se envíe al vault
            const response = await fetch(`${backendUrl}/api/vault/add-fee`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    feeType: 'bet',
                    amount: feeAmount,
                    matchId: matchId,
                    source: 'match_payout'
                })
            });

            if (!response.ok) {
                console.warn('[game-engine] Error sending bet fee to vault (non-critical):', await response.text());
            } else {
                console.log(`[game-engine] Bet fee ${feeAmount} créditos sent to vault`);
            }
        } catch (error) {
            console.error('[game-engine] Error sending bet fee to vault:', error);
            // No bloquear el flujo si falla el registro del fee
        }
    },

    async updateBalance(amount, type, matchId = null) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            // If betting, deduct credits instead of legacy balance
            if (type === 'bet' && window.CreditsSystem) {
                const walletAddress = this.connectedWallet || localStorage.getItem('mtr_wallet');
                console.log('[updateBalance] Intentando descontar créditos:', {
                    walletAddress: walletAddress,
                    amount: amount,
                    type: type,
                    hasCreditsSystem: !!window.CreditsSystem
                });
                
                if (walletAddress) {
                    // Deduct credits via backend
                    const backendUrl = window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com';
                    console.log('[updateBalance] Obteniendo userId para wallet:', walletAddress);
                    
                    const userId = await window.CreditsSystem.getUserId(walletAddress);
                    console.log('[updateBalance] userId obtenido:', userId);
                    
                    if (userId) {
                        const creditsToDeduct = Math.abs(amount);
                        console.log('[updateBalance] Descontando créditos:', {
                            userId: userId,
                            credits: creditsToDeduct,
                            backendUrl: backendUrl,
                            endpoint: `${backendUrl}/api/user/deduct-credits`
                        });
                        
                        // Deduct credits
                        const response = await fetch(`${backendUrl}/api/user/deduct-credits`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userId,
                                credits: creditsToDeduct,
                                reason: 'match_bet',
                                matchId: matchId
                            })
                        });

                        console.log('[updateBalance] Respuesta del backend:', {
                            ok: response.ok,
                            status: response.status,
                            statusText: response.statusText
                        });

                        if (!response.ok) {
                            const errorText = await response.text();
                            console.error('[updateBalance] ❌ Error al descontar créditos:', {
                                status: response.status,
                                statusText: response.statusText,
                                errorText: errorText
                            });
                            
                            // Si el error es "Insufficient credits" pero el usuario tiene suficiente MTR on-chain,
                            // intentar convertir MTR a créditos automáticamente
                            // CRÍTICO: Verificar múltiples variantes del mensaje de error
                            const errorTextLower = errorText.toLowerCase();
                            const isInsufficientError = response.status === 400 && (
                                errorTextLower.includes('insufficient') || 
                                errorTextLower.includes('credit') ||
                                errorTextLower.includes('saldo') ||
                                errorTextLower.includes('balance') ||
                                errorTextLower.includes('fondos')
                            );
                            
                            if (isInsufficientError) {
                                const credits = window.CreditsSystem?.currentCredits || 0;
                                const onchainBalance = Number(window.__mtrOnChainBalance || 0);
                                const creditsNeeded = creditsToDeduct - credits;
                                
                                console.log('[updateBalance] Créditos insuficientes, verificando MTR on-chain:', {
                                    credits: credits,
                                    onchainBalance: onchainBalance,
                                    creditsNeeded: creditsNeeded,
                                    creditsToDeduct: creditsToDeduct,
                                    canConvert: onchainBalance >= creditsNeeded
                                });
                                
                                // Si tiene suficiente MTR on-chain, intentar convertir automáticamente
                                // CRÍTICO: Verificar que tenga suficiente MTR para cubrir TODA la apuesta, no solo la diferencia
                                if (onchainBalance >= creditsToDeduct) {
                                    console.log('[updateBalance] Usuario tiene suficiente MTR on-chain, convirtiendo automáticamente...');
                                    
                                    // Obtener precio actual de MTR (1 MTR = X USDC)
                                    // Por ahora, asumimos 1:1 para simplificar, pero deberíamos obtener el precio real
                                    const mtrToUsdcRate = 1; // TODO: Obtener precio real de MTR/USDC
                                    const mtrToConvert = creditsNeeded / mtrToUsdcRate;
                                    
                                    try {
                                        console.log('[updateBalance] 🔄 Iniciando conversión automática MTR → Créditos:', {
                                            userId: userId,
                                            creditsNeeded: creditsNeeded,
                                            mtrToConvert: mtrToConvert,
                                            endpoint: `${backendUrl}/api/user/add-credits`
                                        });
                                        
                                        // Intentar agregar créditos equivalentes al MTR que el usuario tiene
                                        // NOTA: Esto es una solución temporal. Idealmente deberíamos hacer un swap real de MTR a USDC
                                        const addCreditsResponse = await fetch(`${backendUrl}/api/user/add-credits`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                userId,
                                                credits: creditsNeeded,
                                                reason: 'mtr_conversion',
                                                mtrAmount: mtrToConvert,
                                                note: `Conversión automática de ${mtrToConvert.toFixed(4)} MTR a ${creditsNeeded} créditos USDC`
                                            })
                                        });
                                        
                                        console.log('[updateBalance] Respuesta de add-credits:', {
                                            ok: addCreditsResponse.ok,
                                            status: addCreditsResponse.status,
                                            statusText: addCreditsResponse.statusText
                                        });
                                        
                                        if (addCreditsResponse.ok) {
                                            const addData = await addCreditsResponse.json();
                                            console.log('[updateBalance] ✅ Créditos agregados automáticamente desde MTR:', addData);
                                            
                                            // Esperar un momento para que la base de datos se actualice
                                            await new Promise(resolve => setTimeout(resolve, 500));
                                            
                                            // Recargar balance antes de intentar descontar
                                            await window.CreditsSystem.loadBalance(walletAddress);
                                            
                                            console.log('[updateBalance] 🔄 Intentando descontar créditos después de conversión...');
                                            
                                            // Ahora intentar descontar nuevamente
                                            const retryResponse = await fetch(`${backendUrl}/api/user/deduct-credits`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    userId,
                                                    credits: creditsToDeduct,
                                                    reason: 'match_bet',
                                                    matchId: matchId
                                                })
                                            });
                                            
                                            console.log('[updateBalance] Respuesta de deduct-credits (retry):', {
                                                ok: retryResponse.ok,
                                                status: retryResponse.status,
                                                statusText: retryResponse.statusText
                                            });
                                            
                                            if (retryResponse.ok) {
                                                const retryData = await retryResponse.json();
                                                console.log('[updateBalance] ✅✅✅ Créditos descontados exitosamente después de conversión:', retryData);
                                                await window.CreditsSystem.loadBalance(walletAddress);
                                                return true;
                                            } else {
                                                const retryErrorText = await retryResponse.text();
                                                console.error('[updateBalance] ❌ Error al descontar después de conversión:', {
                                                    status: retryResponse.status,
                                                    errorText: retryErrorText
                                                });
                                                // Retornar false en lugar de lanzar error
                                                return false;
                                            }
                                        } else {
                                            const addErrorText = await addCreditsResponse.text();
                                            console.error('[updateBalance] ❌ Error al agregar créditos desde MTR:', {
                                                status: addCreditsResponse.status,
                                                statusText: addCreditsResponse.statusText,
                                                errorText: addErrorText
                                            });
                                            // Retornar false en lugar de lanzar error
                                            return false;
                                        }
                                    } catch (conversionError) {
                                        console.error('[updateBalance] ❌ Excepción en conversión automática:', conversionError);
                                        console.error('[updateBalance] Stack:', conversionError.stack);
                                        // Retornar false en lugar de lanzar error
                                        return false;
                                    }
                                } else {
                                    // Usuario no tiene suficiente MTR on-chain para cubrir la apuesta
                                    console.error('[updateBalance] ❌ Usuario no tiene suficiente MTR on-chain para conversión automática');
                                    // Retornar false en lugar de lanzar error
                                    return false;
                                }
                            } else {
                                // Error diferente a "Insufficient credits", retornar false
                                console.error('[updateBalance] ❌ Error diferente a créditos insuficientes');
                                return false;
                            }
                        } else {
                            // Response OK - procesar respuesta exitosa
                            const responseData = await response.json();
                            console.log('[updateBalance] ✅ Créditos descontados exitosamente:', responseData);
                            
                            await window.CreditsSystem.loadBalance(walletAddress);
                            return true; // Return early, don't update legacy balance
                        }
                    } else {
                        console.error('[updateBalance] ❌ No se pudo obtener userId para wallet:', walletAddress);
                        // Intentar usar el sistema legacy como fallback
                        console.log('[updateBalance] Intentando usar sistema legacy como fallback...');
                    }
            } else {
                console.error('[updateBalance] ❌ No hay walletAddress disponible');
            }
                // If CreditsSystem not available, fall through to legacy system
            }
            
            // Legacy balance system (for practice mode and compatibility)
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

// Inicializar - Asignar inmediatamente para que esté disponible
if (typeof window !== 'undefined') {
    window.GameEngine = GameEngine;
    console.log('🎮 GameEngine asignado a window.GameEngine');
}

// También inicializar cuando DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    if (window.supabaseClient && window.GameEngine) {
        console.log('🎮 GameEngine loaded!');
    } else if (!window.GameEngine) {
        window.GameEngine = GameEngine;
        console.log('🎮 GameEngine asignado en DOMContentLoaded');
    }
});

// Fallback UI handlers: keep core buttons functional even if inline script fails to parse.
if (typeof window !== 'undefined') {
    function fallbackToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }
        console[type === 'error' ? 'error' : 'log'](message);
    }

    function fallbackBetAmount() {
        return Number(document.getElementById('betAmount')?.value || MIN_BET_AMOUNT);
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
        window.selectMode = function selectModeFallback(mode) {
            const modeSelector = document.getElementById('modeSelector');
            const songSelection = document.getElementById('songSelection');
            const modeTitle = document.getElementById('modeTitle');
            const titles = {
                quick: 'Modo Rápido',
                private: 'Sala Privada',
                practice: 'Modo Práctica',
                tournament: 'Modo Torneo'
            };

            window.currentMode = mode;
            if (modeSelector) modeSelector.classList.add('hidden');
            if (songSelection) songSelection.classList.remove('hidden');
            if (modeTitle) modeTitle.textContent = titles[mode] || 'Modo de Juego';
            updateActionButtonsFallback(mode);

            if (window.GameEngine && typeof window.GameEngine.updatePracticeBetDisplay === 'function') {
                window.GameEngine.updatePracticeBetDisplay();
            }
        };
    }

    if (typeof window.backToModes !== 'function') {
        window.backToModes = function backToModesFallback() {
            const modeSelector = document.getElementById('modeSelector');
            const songSelection = document.getElementById('songSelection');
            if (songSelection) songSelection.classList.add('hidden');
            if (modeSelector) modeSelector.classList.remove('hidden');
            window.currentMode = null;
        };
    }

    if (typeof window.searchSong !== 'function') {
        window.searchSong = function searchSongFallback() {
            const query = document.getElementById('songSearch')?.value || '';
            if (!query.trim()) return fallbackToast('Escribe una canción o artista', 'error');
            if (typeof window.searchDeezer === 'function') return window.searchDeezer(query, 'searchResults');
            fallbackToast('Buscador no disponible aún. Recarga la página.', 'error');
        };
    }

    if (typeof window.startPractice !== 'function') {
        window.startPractice = async function startPracticeFallback() {
            if (window.GameEngine && typeof window.GameEngine.startPractice === 'function') {
                return window.GameEngine.startPractice(window.selectedSong || null);
            }
            if (window.GameEngine && typeof window.GameEngine.startPracticeMatch === 'function') {
                return window.GameEngine.startPracticeMatch(window.selectedSong || null, fallbackBetAmount());
            }
            fallbackToast('Modo práctica no disponible todavía. Recarga la página.', 'error');
        };
    }

    if (typeof window.startQuickMatch !== 'function') {
        window.startQuickMatch = async function startQuickMatchFallback() {
            if (window.GameEngine && typeof window.GameEngine.startQuickMatchmaking === 'function') {
                return window.GameEngine.startQuickMatchmaking(window.selectedSong || null, fallbackBetAmount());
            }
            fallbackToast('Matchmaking no disponible todavía. Recarga la página.', 'error');
        };
    }

    if (typeof window.createRoom !== 'function') {
        window.createRoom = async function createRoomFallback() {
            if (window.GameEngine && typeof window.GameEngine.createPrivateRoom === 'function') {
                return window.GameEngine.createPrivateRoom(window.selectedSong || null, fallbackBetAmount());
            }
            fallbackToast('Crear sala no disponible todavía. Recarga la página.', 'error');
        };
    }

    if (typeof window.joinRoom !== 'function') {
        window.joinRoom = async function joinRoomFallback() {
            const code = (document.getElementById('joinRoomCode')?.value || '').trim().toUpperCase();
            if (!code) return fallbackToast('Ingresa un código de sala', 'error');
            if (window.GameEngine && typeof window.GameEngine.joinPrivateRoom === 'function') {
                return window.GameEngine.joinPrivateRoom(code, window.selectedSong || null, fallbackBetAmount());
            }
            fallbackToast('Unirse a sala no disponible todavía. Recarga la página.', 'error');
        };
    }

    if (typeof window.joinTournamentMode !== 'function') {
        window.joinTournamentMode = async function joinTournamentModeFallback() {
            const tournamentId = (document.getElementById('tournamentId')?.value || '').trim();
            if (!tournamentId) return fallbackToast('Ingresa el ID del torneo', 'error');
            if (window.GameEngine && typeof window.GameEngine.joinTournament === 'function') {
                return window.GameEngine.joinTournament(tournamentId, window.selectedSong || null, fallbackBetAmount());
            }
            fallbackToast('Torneo no disponible todavía. Recarga la página.', 'error');
        };
    }
}
