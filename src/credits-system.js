/**
 * Frontend Credits System
 * Manages credits display, balance fetching, and claim functionality
 */

(function() {
    'use strict';

    const CreditsSystem = {
        backendUrl: window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com',
        currentCredits: 0,
        currentUsdcValue: 0,
        currentRate: 778,
        currentMtrPrice: 0,
        updateInterval: 30000, // 30 seconds
        updateTimer: null,

        /**
         * Initialize credits system
         */
        async init(walletAddress) {
            if (!walletAddress) {
                return;
            }
            
            // Detectar navegador interno de wallet
            const isWalletBrowser = typeof window.isWalletBrowser === 'function' 
                ? window.isWalletBrowser() 
                : (navigator.userAgent.toLowerCase().includes('metamask') || 
                   navigator.userAgent.toLowerCase().includes('mmsb') ||
                   navigator.userAgent.toLowerCase().includes('trust') ||
                   navigator.userAgent.toLowerCase().includes('binance'));
            
            console.log('[credits-system] Inicializando sistema de créditos', {
                walletAddress: walletAddress.slice(0, 10) + '...',
                isWalletBrowser
            });
            
            // Load initial balance
            await this.loadBalance(walletAddress);
            
            // En navegador interno, forzar actualización adicional después de un delay
            if (isWalletBrowser) {
                setTimeout(async () => {
                    console.log('[credits-system] [WALLET-BROWSER] Re-cargando balance después de delay...');
                    await this.loadBalance(walletAddress);
                }, 2000);
            }
            
            // Start periodic updates
            this.startPeriodicUpdates(walletAddress);
        },

        /**
         * Load user credits balance
         * Now supports wallet-based authentication for internal wallet browsers (MOBILE ONLY)
         */
        async loadBalance(walletAddress) {
            try {
                // 🔗 NUEVO: Try to get userId from wallet link if no Supabase session (MOBILE ONLY)
                let userIdFromWallet = null;
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                
                // Detectar si estamos en navegador interno de wallet
                const isWalletBrowser = typeof window.isWalletBrowser === 'function' 
                    ? window.isWalletBrowser() 
                    : (navigator.userAgent.toLowerCase().includes('metamask') || 
                       navigator.userAgent.toLowerCase().includes('mmsb') ||
                       navigator.userAgent.toLowerCase().includes('trust') ||
                       navigator.userAgent.toLowerCase().includes('binance'));
                
                // En navegador interno de wallet, SIEMPRE verificar wallet link primero
                if (isMobile && (isWalletBrowser || typeof supabaseClient === 'undefined')) {
                    try {
                        let hasSupabaseSession = false;
                        if (typeof supabaseClient !== 'undefined') {
                            try {
                                const { data: { session } } = await supabaseClient.auth.getSession();
                                hasSupabaseSession = !!(session && session.user);
                            } catch (e) {
                                // Ignorar errores de sesión
                            }
                        }
                        
                        if (!hasSupabaseSession) {
                            // No Supabase session - try wallet-based auth (CRÍTICO para navegadores internos)
                            console.log('[credits-system] [MOBILE] [WALLET-BROWSER] No Supabase session, checking wallet link...');
                            const walletResponse = await fetch(`${this.backendUrl}/api/user/wallet/${walletAddress}`);
                            if (walletResponse.ok) {
                                const walletData = await walletResponse.json();
                                if (walletData.linked && walletData.userId) {
                                    userIdFromWallet = walletData.userId;
                                    console.log('[credits-system] [MOBILE] [WALLET-BROWSER] ✅ Wallet linked to user:', userIdFromWallet);
                                } else {
                                    console.log('[credits-system] [MOBILE] [WALLET-BROWSER] ⚠️ Wallet NO vinculada aún');
                                }
                            } else {
                                console.warn('[credits-system] [MOBILE] [WALLET-BROWSER] Error verificando wallet link:', walletResponse.status);
                            }
                        }
                    } catch (walletAuthError) {
                        console.warn('[credits-system] Could not check wallet link:', walletAuthError);
                    }
                }

                const response = await fetch(`${this.backendUrl}/api/user/credits/${walletAddress}`);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                this.currentCredits = data.credits || 0;
                // NUEVO: 1 crédito = 1 USDC fijo siempre
                this.currentUsdcValue = this.currentCredits; // 1:1 fijo
                this.currentRate = null; // Ya no se usa rate variable
                this.currentMtrPrice = null; // Ya no relevante para créditos

                // Store userId for later use
                if (data.userId) {
                    this.currentUserId = data.userId;
                } else if (userIdFromWallet) {
                    this.currentUserId = userIdFromWallet;
                }

                console.log('[credits-system] [MOBILE] Saldos cargados:', {
                    credits: this.currentCredits,
                    usdcValue: this.currentUsdcValue,
                    userId: this.currentUserId,
                    isWalletBrowser
                });

                // Update UI - Asegurar que se actualice después de cargar
                this.updateCreditsDisplay();
                
                // Forzar actualización adicional después de un pequeño delay para asegurar que el DOM esté listo
                setTimeout(() => {
                    this.updateCreditsDisplay();
                }, 100);

            } catch (error) {
                console.error('[credits-system] Error loading balance:', error);
                this.currentCredits = 0;
                this.currentUsdcValue = 0;
                this.updateCreditsDisplay();
            }
        },

        /**
         * Update credits display in UI
         */
        updateCreditsDisplay() {
            // SIN LOGS - Esta función se ejecuta frecuentemente
            
            // Update combined display FIRST (this contains the child elements) - DESKTOP
            // ESPECIFICACIÓN REFINADA: Mostrar créditos estables como "MTR créditos jugables" (alias gráfico)
            // Internamente son créditos estables 1:1 USDC, pero visualmente se muestran como "MTR créditos"
            const combinedDisplay = document.getElementById('creditsCombinedDisplay');
            if (combinedDisplay) {
                // Actualizar el contenido completo del combined display
                // Mostrar como "MTR créditos jugables" con clarificación de que son estables 1:1 USDC
                combinedDisplay.innerHTML = `
                    <span id="creditsDisplay" class="text-cyan-400 font-bold">${this.currentCredits.toFixed(2)} MTR créditos</span>
                    <span id="usdcValueDisplay" class="text-gray-400 text-sm">= $${this.currentUsdcValue.toFixed(2)} USDC estables</span>
                    <span class="text-xs text-green-400 ml-1 cursor-help" title="Estas fichas valen siempre $1 cada una. No fluctúan como el token MTR nativo. 1 MTR crédito jugable = $1 USDC estable (1:1 fijo – sin volatilidad)">✓</span>
                `;
                
                // Asegurar que el elemento esté visible si hay créditos
                if (this.currentCredits > 0) {
                    combinedDisplay.classList.remove('hidden');
                    combinedDisplay.classList.add('sm:inline');
                }
                
                // Ahora actualizar los elementos individuales si existen (pueden estar en otros lugares)
                const creditsBadge = document.getElementById('creditsDisplay');
                if (creditsBadge && creditsBadge !== combinedDisplay.querySelector('#creditsDisplay')) {
                    creditsBadge.textContent = `${this.currentCredits.toFixed(2)} MTR créditos`;
                }

                const usdcDisplay = document.getElementById('usdcValueDisplay');
                if (usdcDisplay && usdcDisplay !== combinedDisplay.querySelector('#usdcValueDisplay')) {
                    usdcDisplay.textContent = `= $${this.currentUsdcValue.toFixed(2)} USDC estables`;
                }
            } else {
                // Fallback: intentar actualizar elementos individuales si existen
                const creditsBadge = document.getElementById('creditsDisplay');
                if (creditsBadge) {
                    creditsBadge.textContent = `${this.currentCredits.toFixed(2)} MTR créditos`;
                }

                const usdcDisplay = document.getElementById('usdcValueDisplay');
                if (usdcDisplay) {
                    usdcDisplay.textContent = `= $${this.currentUsdcValue.toFixed(2)} USDC estables`;
                }
            }
            
            // Update mobile display (compacto)
            const mobileDisplay = document.getElementById('creditsCombinedDisplayMobile');
            if (mobileDisplay) {
                const creditsMobile = document.getElementById('creditsDisplayMobile');
                const usdcMobile = document.getElementById('usdcValueDisplayMobile');
                if (creditsMobile) creditsMobile.textContent = this.currentCredits.toFixed(2);
                if (usdcMobile) usdcMobile.textContent = `$${this.currentUsdcValue.toFixed(2)}`;
                // Mostrar si hay créditos o wallet conectada
                if (this.currentCredits > 0 || window.connectedAddress) {
                    mobileDisplay.classList.remove('hidden');
                }
            }

            // Update bet eligibility
            this.updateBetEligibility();
        },

        /**
         * Update bet eligibility based on credits
         */
        updateBetEligibility() {
            const minBet = typeof MIN_BET_AMOUNT !== 'undefined' ? MIN_BET_AMOUNT : (typeof GameEngine !== 'undefined' ? GameEngine.minBet : 5); // Minimum bet in credits (5)
            const canBet = this.currentCredits >= minBet;

            // Enable/disable bet buttons
            const betButtons = document.querySelectorAll('#actionButtons button, #startQuickBtn, #startPracticeBtn, #createRoomBtn');
            betButtons.forEach(btn => {
                if (btn && btn.id !== 'joinRoomBtn' && btn.id !== 'joinTournamentBtn') {
                    btn.disabled = !canBet || !selectedSong;
                    if (!canBet && this.currentCredits > 0) {
                        btn.title = `Mínimo ${minBet} créditos (tienes ${this.currentCredits.toFixed(2)})`;
                    }
                }
            });
        },

        /**
         * Start periodic balance updates
         */
        startPeriodicUpdates(walletAddress) {
            if (this.updateTimer) {
                clearInterval(this.updateTimer);
            }

            this.updateTimer = setInterval(() => {
                this.loadBalance(walletAddress);
            }, this.updateInterval);
        },

        /**
         * Stop periodic updates
         */
        stopPeriodicUpdates() {
            if (this.updateTimer) {
                clearInterval(this.updateTimer);
                this.updateTimer = null;
            }
        },

        /**
         * Claim credits (convert to USDC)
         */
        async claimCredits(credits, walletAddress) {
            try {
                if (!credits || credits < minClaim) {
                    if (typeof showToast === 'function') {
                        showToast('Mínimo 5 créditos para reclamar', 'error');
                    }
                    return null;
                }

                if (credits > this.currentCredits) {
                    if (typeof showToast === 'function') {
                        showToast('Créditos insuficientes', 'error');
                    }
                    return null;
                }

                // Find user ID (supports both Supabase auth and wallet-based auth - MOBILE ONLY for wallet link)
                let userId = null;
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                
                // Try Supabase session first
                if (typeof supabaseClient !== 'undefined') {
                    try {
                        const { data: { session } } = await supabaseClient.auth.getSession();
                        if (session && session.user) {
                            userId = session.user.id;
                            console.log('[credits-system] Using userId from Supabase session');
                        }
                    } catch (sessionError) {
                        console.warn('[credits-system] Could not get Supabase session:', sessionError);
                    }
                }

                // If no Supabase session, try wallet-based auth (MOBILE ONLY)
                if (!userId) {
                    userId = await this.getUserId(walletAddress);
                    if (userId) {
                        if (isMobile) {
                            console.log('[credits-system] [MOBILE] Using userId from wallet link');
                        } else {
                            console.log('[credits-system] Using userId from backend API');
                        }
                    }
                }

                if (!userId) {
                    throw new Error('Usuario no encontrado. Conecta tu wallet o inicia sesión.');
                }

                if (typeof showToast === 'function') {
                    showToast('Procesando reclamación...', 'info');
                }

                const response = await fetch(`${this.backendUrl}/api/claim`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId,
                        credits,
                        walletAddress
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Error al procesar reclamación');
                }

                const result = await response.json();

                // Update balance
                await this.loadBalance(walletAddress);

                if (typeof showToast === 'function') {
                    showToast(`✅ ${result.usdcAmount} USDC enviados! Tx: ${result.txHash.slice(0, 10)}...`, 'success');
                }

                return result;

            } catch (error) {
                console.error('[credits-system] Error claiming credits:', error);
                if (typeof showToast === 'function') {
                    showToast(`Error: ${error.message}`, 'error');
                }
                return null;
            }
        },

        /**
         * Get user ID from wallet address
         * Now supports wallet-based authentication for internal wallet browsers (MOBILE ONLY)
         */
        async getUserId(walletAddress) {
            var logFn = window.__originalLog || console.log;
            var errorFn = console.error;
            
            if (!walletAddress) {
                errorFn('[getUserId] ❌ No se proporcionó walletAddress');
                return null;
            }
            
            // 🔗 Detectar si es dispositivo móvil
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            try {
                logFn('[getUserId] ========================================');
                logFn('[getUserId] Obteniendo userId para wallet:', walletAddress);
                logFn('[getUserId] Dispositivo:', isMobile ? 'MÓVIL' : 'PC');
                logFn('[getUserId] Backend URL:', this.backendUrl);
                
                // 🔗 NUEVO: Try Supabase session first
                let userIdFromSession = null;
                if (typeof supabaseClient !== 'undefined') {
                    try {
                        const { data: { session } } = await supabaseClient.auth.getSession();
                        if (session && session.user) {
                            userIdFromSession = session.user.id;
                            logFn('[getUserId] ✅ Usuario autenticado con Supabase:', userIdFromSession);
                            
                            // 🔗 NUEVO: Auto-link wallet if user is authenticated (MOBILE ONLY)
                            if (isMobile) {
                                try {
                                    await this.linkWalletToUser(walletAddress);
                                    logFn('[getUserId] [MOBILE] ✅ Wallet vinculada automáticamente');
                                } catch (linkError) {
                                    logFn('[getUserId] [MOBILE] ⚠️ No se pudo vincular wallet (puede estar ya vinculada):', linkError.message);
                                }
                            }
                            
                            return userIdFromSession;
                        }
                    } catch (sessionError) {
                        logFn('[getUserId] ⚠️ Error verificando sesión Supabase:', sessionError.message);
                    }
                }
                
                // 🔗 NUEVO: Try wallet link if no Supabase session (MOBILE ONLY - for internal wallet browsers)
                if (!userIdFromSession && isMobile) {
                    try {
                        logFn('[getUserId] [MOBILE] [Wallet Link] Verificando si wallet está vinculada...');
                        const walletResponse = await fetch(`${this.backendUrl}/api/user/wallet/${walletAddress}`);
                        if (walletResponse.ok) {
                            const walletData = await walletResponse.json();
                            if (walletData.linked && walletData.userId) {
                                logFn('[getUserId] [MOBILE] ✅✅✅ userId obtenido desde wallet link:', walletData.userId);
                                logFn('[getUserId] ========================================');
                                return walletData.userId;
                            }
                        }
                    } catch (walletLinkError) {
                        logFn('[getUserId] [MOBILE] ⚠️ Error verificando wallet link:', walletLinkError.message);
                    }
                }
                
                // PRIMERO intentar obtener del backend API (más confiable)
                try {
                    logFn('[getUserId] [1/2] Intentando obtener userId desde backend API...');
                    const backendUrl = `${this.backendUrl}/api/user/credits/${walletAddress}`;
                    logFn('[getUserId] URL completa:', backendUrl);
                    
                    const response = await fetch(backendUrl, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        cache: 'no-cache'
                    });
                    
                    logFn('[getUserId] Respuesta recibida:', {
                        ok: response.ok,
                        status: response.status,
                        statusText: response.statusText,
                        headers: Object.fromEntries(response.headers.entries())
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        logFn('[getUserId] Datos del backend:', data);
                        if (data.userId) {
                            logFn('[getUserId] ✅✅✅ userId obtenido desde backend:', data.userId);
                            logFn('[getUserId] ========================================');
                            return data.userId;
                        } else {
                            errorFn('[getUserId] ⚠️ Backend respondió OK pero userId es null/undefined');
                            errorFn('[getUserId] Respuesta completa:', data);
                        }
                    } else {
                        const errorText = await response.text();
                        errorFn('[getUserId] ⚠️ Backend API falló:', {
                            status: response.status,
                            statusText: response.statusText,
                            errorText: errorText
                        });
                    }
                } catch (backendError) {
                    errorFn('[getUserId] ⚠️ Excepción al consultar backend API:', backendError);
                    errorFn('[getUserId] Stack:', backendError.stack);
                }
                
                // FALLBACK: Intentar desde Supabase (puede fallar por RLS - NO USAR si backend falla)
                // COMENTADO: Supabase tiene problemas de permisos RLS, mejor no usar como fallback
                /*
                if (window.supabaseClient) {
                    try {
                        logFn('[getUserId] [2/2] Intentando obtener userId desde Supabase (fallback)...');
                        const { data, error } = await window.supabaseClient
                            .from('users')
                            .select('id')
                            .eq('wallet_address', walletAddress.toLowerCase())
                            .single();
                        
                        if (error) {
                            errorFn('[getUserId] ⚠️ Error en consulta Supabase:', error);
                            errorFn('[getUserId] Error code:', error.code);
                            errorFn('[getUserId] Error message:', error.message);
                        } else if (data?.id) {
                            logFn('[getUserId] ✅ userId obtenido desde Supabase:', data.id);
                            return data.id;
                        }
                    } catch (supabaseError) {
                        errorFn('[getUserId] ⚠️ Error al consultar Supabase:', supabaseError);
                    }
                }
                */

                errorFn('[getUserId] ❌❌❌ No se pudo obtener userId por ningún método');
                errorFn('[getUserId] ========================================');
                return null;
            } catch (error) {
                errorFn('[getUserId] ❌ Error crítico al obtener userId:', error);
                errorFn('[getUserId] Stack:', error.stack);
                return null;
            }
        },

        /**
         * Get current price and rate
         */
        async getPriceInfo() {
            try {
                const response = await fetch(`${this.backendUrl}/api/price`);
                if (response.ok) {
                    return await response.json();
                }
            } catch (error) {
                console.error('[credits-system] Error getting price:', error);
            }
            return null;
        },

        /**
         * Link wallet to authenticated user
         * Called automatically when user connects wallet and is authenticated
         */
        async linkWalletToUser(walletAddress) {
            try {
                if (!walletAddress) {
                    console.warn('[credits-system] linkWalletToUser: No wallet address provided');
                    return false;
                }

                // Verify user is authenticated
                if (typeof supabaseClient === 'undefined') {
                    console.warn('[credits-system] linkWalletToUser: Supabase client not available');
                    return false;
                }

                const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
                if (sessionError || !session || !session.user) {
                    console.warn('[credits-system] linkWalletToUser: User not authenticated');
                    return false;
                }

                const userId = session.user.id;
                console.log('[credits-system] linkWalletToUser: Linking wallet', walletAddress, 'to user', userId);

                // Call backend endpoint to link wallet
                const response = await fetch(`${this.backendUrl}/api/user/link-wallet`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                        walletAddress: walletAddress.toLowerCase()
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                    // If wallet is already linked, that's OK
                    if (response.status === 400 && errorData.error && errorData.error.includes('already linked')) {
                        console.log('[credits-system] linkWalletToUser: Wallet already linked (OK)');
                        return true;
                    }
                    console.error('[credits-system] linkWalletToUser: Error linking wallet:', errorData);
                    return false;
                }

                const result = await response.json();
                console.log('[credits-system] linkWalletToUser: ✅ Wallet linked successfully:', result);
                return true;

            } catch (error) {
                console.error('[credits-system] linkWalletToUser: Exception:', error);
                return false;
            }
        }
    };

    // Export to window
    window.CreditsSystem = CreditsSystem;

    console.log('[credits-system] Module loaded');
})();
