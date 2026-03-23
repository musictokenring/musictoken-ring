/**
 * Frontend Credits System
 * Manages credits display, balance fetching, and claim functionality
 * 
 * VERSIÓN: v2.9-no-limits (SIN LIMITACIONES DE BALANCE)
 * FECHA: 2026-03-11
 * 
 * CAMBIOS CRÍTICOS:
 * - Eliminadas TODAS las validaciones que rechazaban valores grandes
 * - El sistema ahora acepta cualquier balance válido sin límites artificiales
 * - Soporte para balance unificado (fiat + onchain + legacy credits)
 */

(function() {
    'use strict';
    
    // Log de versión para confirmar que se carga la versión correcta
    console.log('[credits-system] ✅✅✅ Versión v3.0-no-limits cargada - SIN LIMITACIONES DE BALANCE');
    console.log('[credits-system] ✅✅✅ FECHA DE CARGA:', new Date().toISOString());
    console.log('[credits-system] ✅✅✅ Este archivo NO contiene validaciones de MAX_REASONABLE_CREDITS');
    
    // Verificación crítica: Si hay alguna referencia a validaciones antiguas, alertar
    if (typeof MAX_REASONABLE_CREDITS !== 'undefined') {
        console.error('[credits-system] ❌❌❌ ERROR: MAX_REASONABLE_CREDITS aún está definido!');
    }

    const CreditsSystem = {
        backendUrl: window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com',
        currentCredits: 0,
        currentUsdcValue: 0,
        currentRate: 778,
        currentMtrPrice: 0,
        updateInterval: 30000, // 30 seconds (balance entre rendimiento y actualización)
        updateTimer: null,
        updateDisplayDebounceTimer: null, // Para debounce de updateCreditsDisplay
        profileUpdateTimer: null, // Timer para actualizar perfil del usuario actual

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
            
            // OPTIMIZACIÓN: Eliminado re-carga adicional en wallet browser (redundante)
            // El polling periódico ya maneja las actualizaciones
            
            // Start periodic updates
            this.startPeriodicUpdates(walletAddress);
        },

        /**
         * Load user credits balance
         * Now supports wallet-based authentication for internal wallet browsers (MOBILE ONLY)
         * NEW: Supports fiat balance (email auth without wallet)
         * @param {string|null} walletAddress - Wallet address (null for email-only users)
         * @param {string|null} userId - Supabase user ID (optional, will be fetched if not provided)
         */
        async loadBalance(walletAddress, userId = null) {
            // Logs reducidos: solo en desarrollo
            const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            if (isDevelopment) {
                console.log('[credits-system] 🔄 loadBalance iniciado:', {
                    walletAddress: walletAddress?.slice(0, 10) + '...',
                    timestamp: new Date().toISOString()
                });
            }
            
            try {
                // NUEVO: Si no hay wallet pero hay userId (email auth), cargar solo saldo fiat
                if (!walletAddress && userId) {
                    return await this.loadFiatBalance(userId);
                }
                
                // Si no hay wallet ni userId, intentar obtener userId de sesión Supabase
                if (!walletAddress && !userId) {
                    if (typeof supabaseClient !== 'undefined') {
                        try {
                            const { data: { session } } = await supabaseClient.auth.getSession();
                            if (session && session.user) {
                                userId = session.user.id;
                                return await this.loadFiatBalance(userId);
                            }
                        } catch (e) {
                            console.warn('[credits-system] No se pudo obtener sesión Supabase:', e);
                        }
                    }
                    // Si no hay sesión, retornar 0
                    this.currentCredits = 0;
                    this.currentUsdcValue = 0;
                    this.updateCreditsDisplay();
                    return;
                }
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
                
                console.log('[credits-system] 🔄 Verificando wallet link...', {
                    isMobile: isMobile,
                    isWalletBrowser: isWalletBrowser,
                    hasSupabaseClient: typeof supabaseClient !== 'undefined'
                });
                
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

                const creditsUrl = `${this.backendUrl}/api/user/credits/${walletAddress}`;
                console.log('[credits-system] 🔄 Llamando al backend:', creditsUrl);
                console.log('[credits-system] 🔄 Backend URL completa:', creditsUrl);
                console.log('[credits-system] 🔄 Wallet address:', walletAddress);
                
                // CRÍTICO: Agregar timeout para evitar que la promise quede colgada
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    console.error('[credits-system] ❌ TIMEOUT: Backend no respondió después de 8 segundos');
                    controller.abort();
                }, 8000);
                
                console.log('[credits-system] 🔄 Iniciando fetch con timeout de 8 segundos...');
                
                let response;
                try {
                    response = await fetch(creditsUrl, {
                        signal: controller.signal,
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    clearTimeout(timeoutId);
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    if (fetchError.name === 'AbortError') {
                        throw new Error('Timeout: Backend no respondió después de 8 segundos. URL: ' + creditsUrl);
                    }
                    throw fetchError;
                }
                
                console.log('[credits-system] 🔄 Respuesta del backend recibida:', {
                    ok: response.ok,
                    status: response.status,
                    statusText: response.statusText,
                    url: creditsUrl
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[credits-system] ❌ Error del backend:', {
                        status: response.status,
                        statusText: response.statusText,
                        errorText: errorText
                    });
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                const data = await response.json();

                console.log('[credits-system] 🔍🔍🔍 RESPUESTA DEL BACKEND:', {
                    data: data,
                    credits: data.credits,
                    userId: data.userId,
                    walletAddress: walletAddress
                });

                // CRÍTICO: Obtener saldo on-chain para referencia (NO para limitar créditos)
                const onchainBalance = Number(window.__mtrOnChainBalance || 0);
                
                // CRÍTICO: SIEMPRE consultar Supabase primero si tenemos userId
                // El backend puede tener bugs que multipliquen el saldo
                let rawCredits = 0;
                let usarBackend = false;
                
                // Intentar obtener userId para consultar Supabase
                let userId = this.currentUserId;
                if (!userId && walletAddress) {
                    userId = await this.getUserId(walletAddress);
                }
                
                // CRÍTICO: Consultar balance unificado (fiat + onchain + credits) PRIMERO
                if (typeof supabaseClient !== 'undefined' && userId) {
                    try {
                        console.log('[credits-system] 🔄🔴 CONSULTANDO BALANCE UNIFICADO (fuente de verdad)...', {
                            userId: userId,
                            onchainBalance: onchainBalance
                        });
                        
                        // Método 1: Intentar usar función RPC unificada (si existe y migración ejecutada)
                        let unifiedBalance = null;
                        let useRPC = false;
                        try {
                            const { data: rpcBalance, error: rpcError } = await supabaseClient
                                .rpc('get_user_unified_balance', { user_id_param: userId });
                            
                            if (!rpcError && rpcBalance !== null && rpcBalance !== undefined) {
                                unifiedBalance = parseFloat(rpcBalance) || 0;
                                console.log('[credits-system] ✅ Balance unificado desde RPC:', unifiedBalance);
                                useRPC = true;
                            } else {
                                console.log('[credits-system] RPC error o no disponible:', rpcError?.message || 'unknown');
                            }
                        } catch (rpcError) {
                            console.log('[credits-system] RPC no disponible o migración no ejecutada:', rpcError.message);
                        }
                        
                        // Método 2: Si RPC no está disponible, calcular manualmente
                        if (!useRPC) {
                            console.log('[credits-system] Calculando balance manualmente...');
                            
                            let fiatBalance = 0;
                            let onchainBalanceFromDB = 0;
                            
                            // Intentar obtener datos de users (puede fallar si migración no ejecutada)
                            try {
                                const { data: userData, error: userError } = await supabaseClient
                                    .from('users')
                                    .select('saldo_fiat, saldo_onchain')
                                    .eq('id', userId)
                                    .maybeSingle();
                                
                                if (!userError && userData) {
                                    fiatBalance = parseFloat(userData.saldo_fiat || 0);
                                    onchainBalanceFromDB = parseFloat(userData.saldo_onchain || 0);
                                    console.log('[credits-system] Datos de users obtenidos:', { fiatBalance, onchainBalanceFromDB });
                                } else {
                                    console.log('[credits-system] Columnas saldo_fiat/saldo_onchain no existen (migración no ejecutada)');
                                }
                            } catch (userError) {
                                console.log('[credits-system] Error obteniendo saldo_fiat/saldo_onchain (migración no ejecutada):', userError.message);
                            }
                            
                            // Obtener credits (siempre disponible)
                            const { data: creditsData, error: creditsError } = await supabaseClient
                                .from('user_credits')
                                .select('credits')
                                .eq('user_id', userId)
                                .maybeSingle();
                            
                            const creditsBalance = parseFloat(creditsData?.credits || 0);
                            
                            unifiedBalance = fiatBalance + onchainBalanceFromDB + creditsBalance;
                            
                            console.log('[credits-system] ✅ Balance calculado manualmente:', {
                                fiat: fiatBalance,
                                onchain: onchainBalanceFromDB,
                                credits: creditsBalance,
                                total: unifiedBalance,
                                userId: userId
                            });
                        }
                        
                        if (unifiedBalance !== null && unifiedBalance !== undefined) {
                            rawCredits = unifiedBalance;
                            console.log('[credits-system] ✅✅✅ Saldo unificado obtenido:', rawCredits);
                        } else {
                            console.warn('[credits-system] ⚠️ No se pudo obtener balance unificado, usando backend como fallback');
                            usarBackend = true;
                        }
                    } catch (supabaseError) {
                        console.error('[credits-system] ❌ Error consultando balance unificado:', supabaseError);
                        console.warn('[credits-system] ⚠️ Usando backend como fallback');
                        usarBackend = true;
                    }
                } else {
                    console.warn('[credits-system] ⚠️ No se pudo consultar balance unificado:', {
                        tieneSupabase: typeof supabaseClient !== 'undefined',
                        tieneUserId: !!userId,
                        userId: userId
                    });
                    usarBackend = true;
                }
                
                // Solo usar backend si Supabase falló
                if (usarBackend) {
                    rawCredits = data.credits || 0;
                    
                    // Convertir a número si es string
                    if (typeof rawCredits === 'string') {
                        rawCredits = parseFloat(rawCredits) || 0;
                    }
                    
                    // Validar que sea un número válido
                    if (isNaN(rawCredits) || !isFinite(rawCredits)) {
                        console.error('[credits-system] ❌ Valor de créditos inválido del backend:', rawCredits);
                        rawCredits = 0;
                    }
                } else {
                    // Ya tenemos el valor de Supabase, solo validar formato
                    if (typeof rawCredits === 'string') {
                        rawCredits = parseFloat(rawCredits) || 0;
                    }
                    
                    if (isNaN(rawCredits) || !isFinite(rawCredits)) {
                        console.error('[credits-system] ❌ Valor de créditos inválido de Supabase:', rawCredits);
                        rawCredits = 0;
                    }
                }
                
                // SIN LIMITACIONES: Mostrar el balance completo sin restricciones
                // El usuario puede tener cualquier cantidad de créditos válida
                // Solo validar que sea un número válido y no negativo
                
                // Asegurar que no sea negativo
                rawCredits = Math.max(0, rawCredits);
                
                // CRÍTICO: Log final antes de establecer el valor
                console.log('[credits-system] 🔴🔴🔴 VALOR FINAL A ESTABLECER:', {
                    rawCredits: rawCredits,
                    onchainBalance: onchainBalance,
                    excedeOnchain: onchainBalance > 0 && rawCredits > onchainBalance,
                    fuente: usarBackend ? 'BACKEND' : 'SUPABASE'
                });
                
                this.currentCredits = rawCredits;
                // NUEVO: 1 crédito = 1 USDC fijo siempre
                this.currentUsdcValue = this.currentCredits; // 1:1 fijo
                this.currentRate = null; // Ya no se usa rate variable
                this.currentMtrPrice = null; // Ya no relevante para créditos

                // Store userId for later use
                if (data.userId) {
                    this.currentUserId = data.userId;
                } else if (userIdFromWallet) {
                    this.currentUserId = userIdFromWallet;
                } else if (userId) {
                    this.currentUserId = userId;
                }

                console.log('[credits-system] ✅✅✅ Saldos cargados y actualizados:', {
                    credits: this.currentCredits,
                    usdcValue: this.currentUsdcValue,
                    userId: this.currentUserId,
                    onchainBalance: onchainBalance,
                    fuente: usarBackend ? 'BACKEND' : 'SUPABASE',
                    isWalletBrowser,
                    willUpdateDisplay: true
                });

                // CRÍTICO: Solo actualizar UI si tenemos un valor válido cargado
                // NO mostrar valores intermedios o por defecto que puedan confundir
                if (this.currentCredits >= 0 && this.currentCredits !== undefined) {
                    // Update UI - Asegurar que se actualice después de cargar
                    this.updateCreditsDisplay();
                    // OPTIMIZACIÓN: GameEngine se actualiza automáticamente en updateCreditsDisplay
                } else {
                    console.warn('[credits-system] ⚠️ No actualizando display - valor aún no cargado completamente');
                }

            } catch (error) {
                console.error('[credits-system] ❌❌❌ ERROR loading balance:', error);
                console.error('[credits-system] ❌ Error message:', error.message);
                console.error('[credits-system] ❌ Error stack:', error.stack);
                console.error('[credits-system] ❌ Wallet address:', walletAddress);
                console.error('[credits-system] ❌ Backend URL:', this.backendUrl);
                
                // CRÍTICO: En caso de error, NO establecer valores por defecto pequeños
                // Solo establecer 0 si realmente no hay balance, pero NO mostrar valores intermedios
                // Si ya tenemos un valor previo válido, mantenerlo hasta que se cargue el nuevo
                if (this.currentCredits === undefined || this.currentCredits === null) {
                    this.currentCredits = 0;
                    this.currentUsdcValue = 0;
                    this.updateCreditsDisplay();
                } else {
                    console.log('[credits-system] ⚠️ Manteniendo valor previo debido a error:', this.currentCredits);
                }
                
                // CRÍTICO: NO resetear el saldo a 0 si hay un error - mantener el saldo anterior
                // Solo loggear el error pero preservar el estado actual
                const previousCredits = this.currentCredits || 0;
                console.warn('[credits-system] ⚠️ Error cargando balance, manteniendo saldo anterior:', previousCredits);
                
                // NO llamar a updateCreditsDisplay() aquí porque borraría el saldo visible
                // El saldo anterior se mantiene y la UI no se actualiza con valores incorrectos
            }
        },

        /**
         * Update credits display in UI (con debounce para evitar múltiples actualizaciones)
         */
        updateCreditsDisplay() {
            // Debounce: cancelar actualización pendiente si hay una nueva
            if (this.updateDisplayDebounceTimer) {
                clearTimeout(this.updateDisplayDebounceTimer);
            }
            
            // Ejecutar actualización después de un pequeño delay para agrupar múltiples llamadas
            this.updateDisplayDebounceTimer = setTimeout(() => {
                this._doUpdateCreditsDisplay();
            }, 100); // 100ms de debounce
        },
        
        /**
         * Actualización real del display (método interno)
         */
        _doUpdateCreditsDisplay() {
            // Logs reducidos: solo en desarrollo o cuando hay problemas
            const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const shouldLog = isDevelopment && this.currentCredits > 0;
            
            // Update combined display FIRST (this contains the child elements) - DESKTOP
            // ESPECIFICACIÓN REFINADA: Mostrar créditos estables como "MTR créditos jugables" (alias gráfico)
            // Internamente son créditos estables 1:1 USDC, pero visualmente se muestran como "MTR créditos"
            const combinedDisplay = document.getElementById('creditsCombinedDisplay');
            if (combinedDisplay) {
                // Actualizar el contenido completo del combined display
                // Mostrar como "MTR créditos jugables" con clarificación de que son estables 1:1 USDC
                // Formatear con separadores de miles para números grandes (transparencia completa)
                const formattedCredits = this.currentCredits >= 1000
                    ? this.currentCredits.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : this.currentCredits.toFixed(2);
                const formattedUsdc = this.currentUsdcValue >= 1000
                    ? this.currentUsdcValue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : this.currentUsdcValue.toFixed(2);
                
                combinedDisplay.innerHTML = `
                    <span id="creditsDisplay" class="text-cyan-400 font-bold">${formattedCredits} MTR créditos</span>
                    <span id="usdcValueDisplay" class="text-gray-400 text-sm">= $${formattedUsdc} USDC estables</span>
                    <span class="text-xs text-green-400 ml-1 cursor-help" title="Estas fichas valen siempre $1 cada una. No fluctúan como el token MTR nativo. 1 MTR crédito jugable = $1 USDC estable (1:1 fijo – sin volatilidad)">✓</span>
                `;
                
                // Asegurar que el elemento esté visible si hay créditos
                if (this.currentCredits > 0) {
                    combinedDisplay.classList.remove('hidden');
                    combinedDisplay.classList.add('sm:inline');
                    if (shouldLog) {
                        console.log('[updateCreditsDisplay] ✅ Combined display actualizado y visible');
                    }
                } else {
                    if (shouldLog) {
                        console.warn('[updateCreditsDisplay] ⚠️ Créditos > 0 pero no se están mostrando');
                    }
                }
                
                // Ahora actualizar los elementos individuales si existen (pueden estar en otros lugares)
                const creditsBadge = document.getElementById('creditsDisplay');
                if (creditsBadge && creditsBadge !== combinedDisplay.querySelector('#creditsDisplay')) {
                    const badgeFormatted = this.currentCredits >= 1000
                        ? this.currentCredits.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : this.currentCredits.toFixed(2);
                    creditsBadge.textContent = `${badgeFormatted} MTR créditos`;
                }

                const usdcDisplay = document.getElementById('usdcValueDisplay');
                if (usdcDisplay && usdcDisplay !== combinedDisplay.querySelector('#usdcValueDisplay')) {
                    const usdcFormatted = this.currentUsdcValue >= 1000
                        ? this.currentUsdcValue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : this.currentUsdcValue.toFixed(2);
                    usdcDisplay.textContent = `= $${usdcFormatted} USDC estables`;
                }
            } else {
                // Fallback: intentar actualizar elementos individuales si existen
                const creditsBadge = document.getElementById('creditsDisplay');
                if (creditsBadge) {
                    const badgeFormatted = this.currentCredits >= 1000
                        ? this.currentCredits.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : this.currentCredits.toFixed(2);
                    creditsBadge.textContent = `${badgeFormatted} MTR créditos`;
                }

                const usdcDisplay = document.getElementById('usdcValueDisplay');
                if (usdcDisplay) {
                    const usdcFormatted = this.currentUsdcValue >= 1000
                        ? this.currentUsdcValue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : this.currentUsdcValue.toFixed(2);
                    usdcDisplay.textContent = `= $${usdcFormatted} USDC estables`;
                }
            }
            
            // Update mobile display (compacto) - usar formato con separadores para números grandes
            const mobileDisplay = document.getElementById('creditsCombinedDisplayMobile');
            if (mobileDisplay) {
                const creditsMobile = document.getElementById('creditsDisplayMobile');
                const usdcMobile = document.getElementById('usdcValueDisplayMobile');
                if (creditsMobile) {
                    const mobileFormatted = this.currentCredits >= 1000
                        ? this.currentCredits.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : this.currentCredits.toFixed(2);
                    creditsMobile.textContent = mobileFormatted;
                    if (shouldLog) {
                        console.log('[updateCreditsDisplay] ✅ Mobile display actualizado:', mobileFormatted);
                    }
                }
                if (usdcMobile) {
                    const usdcMobileFormatted = this.currentUsdcValue >= 1000
                        ? this.currentUsdcValue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : this.currentUsdcValue.toFixed(2);
                    usdcMobile.textContent = `$${usdcMobileFormatted}`;
                }
                // Mostrar si hay créditos o wallet conectada
                if (this.currentCredits > 0 || window.connectedAddress) {
                    mobileDisplay.classList.remove('hidden');
                }
            }
            
            // CRÍTICO: También actualizar el elemento "Fichas jugables" en la sección de apuesta
            const playableCreditsEl = document.getElementById('userBalance');
            if (playableCreditsEl) {
                const playableFormatted = this.currentCredits >= 1000
                    ? this.currentCredits.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : this.currentCredits.toFixed(2);
                playableCreditsEl.textContent = playableFormatted;
                // Asegurar que el elemento tenga el estilo correcto
                playableCreditsEl.style.color = '';
                playableCreditsEl.style.fontWeight = '';
                playableCreditsEl.title = 'MTR créditos jugables: Fichas estables que valen siempre $1 cada una';
                if (shouldLog) {
                    console.log('[updateCreditsDisplay] ✅ userBalance (Fichas jugables) actualizado:', playableFormatted);
                }
            } else {
                if (shouldLog) {
                    console.warn('[updateCreditsDisplay] ⚠️ Elemento userBalance NO encontrado');
                }
            }
            
            // También actualizar appBalanceDisplay si existe (pero solo si el usuario quiere ver ambos)
            const appBalanceDisplay = document.getElementById('appBalanceDisplay');
            if (appBalanceDisplay && !appBalanceDisplay.classList.contains('hidden')) {
                const appFormatted = this.currentCredits >= 1000
                    ? this.currentCredits.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : this.currentCredits.toFixed(2);
                appBalanceDisplay.textContent = `Fichas jugables: ${appFormatted} MTR créditos`;
                appBalanceDisplay.style.color = '';
                appBalanceDisplay.title = 'MTR créditos jugables: Fichas estables que valen siempre $1 cada una';
            }
            
            // CRÍTICO: Forzar actualización de GameEngine también para mantener sincronización
            // Pero solo si GameEngine está disponible y CreditsSystem tiene créditos cargados
            // OPTIMIZACIÓN: Reducir frecuencia de actualización de GameEngine
            if (typeof window.GameEngine !== 'undefined' && typeof window.GameEngine.updateBalanceDisplay === 'function') {
                // Solo actualizar GameEngine si hay créditos y no se ha actualizado recientemente
                if (this.currentCredits > 0 && !this._lastGameEngineUpdate || (Date.now() - this._lastGameEngineUpdate > 1000)) {
                    this._lastGameEngineUpdate = Date.now();
                    if (shouldLog) {
                        console.log('[updateCreditsDisplay] 🔄 Actualizando GameEngine...');
                    }
                    window.GameEngine.updateBalanceDisplay();
                }
            }
            
            // CRÍTICO: Actualizar perfil del usuario actual si está visible
            // Esto asegura que el perfil siempre muestre el balance más reciente
            if (typeof window.loadPlayerProfile === 'function' && typeof supabaseClient !== 'undefined') {
                supabaseClient.auth.getSession().then(({ data: { session } }) => {
                    if (session && session.user) {
                        // Verificar si el perfil modal está visible y es del usuario actual
                        const profileModal = document.getElementById('profileModal');
                        const isProfileVisible = profileModal && !profileModal.classList.contains('hidden');
                        
                        if (isProfileVisible) {
                            // Actualizar perfil inmediatamente cuando el balance cambia
                            window.loadPlayerProfile(session.user);
                        }
                    }
                }).catch(() => {
                    // Silenciar errores de sesión
                });
            }

            // Update bet eligibility
            this.updateBetEligibility();
        },

        /**
         * Update bet eligibility based on credits
         */
        updateBetEligibility() {
            const minBet = typeof MIN_BET_AMOUNT !== 'undefined' ? MIN_BET_AMOUNT : (typeof GameEngine !== 'undefined' ? GameEngine.minBet : 1); // Minimum bet in credits (1)
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
            
            // CRÍTICO: También iniciar actualización periódica del perfil del usuario actual
            // Esto asegura que el perfil se actualice incluso si no está visible cuando cambia el balance
            if (this.profileUpdateTimer) {
                clearInterval(this.profileUpdateTimer);
            }
            
            // Actualizar perfil cada 15 segundos si el usuario actual tiene sesión
            this.profileUpdateTimer = setInterval(() => {
                if (typeof supabaseClient !== 'undefined') {
                    supabaseClient.auth.getSession().then(({ data: { session } }) => {
                        if (session && session.user && typeof window.loadPlayerProfile === 'function') {
                            // Solo actualizar si el perfil modal está visible
                            const profileModal = document.getElementById('profileModal');
                            if (profileModal && !profileModal.classList.contains('hidden')) {
                                window.loadPlayerProfile(session.user);
                            }
                        }
                    }).catch(() => {
                        // Silenciar errores
                    });
                }
            }, 15000); // 15 segundos para perfil (más frecuente que el balance general)
        },

        /**
         * Stop periodic updates
         */
        stopPeriodicUpdates() {
            if (this.updateTimer) {
                clearInterval(this.updateTimer);
                this.updateTimer = null;
            }
            if (this.profileUpdateTimer) {
                clearInterval(this.profileUpdateTimer);
                this.profileUpdateTimer = null;
            }
        },

        /**
         * Claim credits (convert to USDC)
         */
        async claimCredits(credits, walletAddress) {
            try {
                // Validaciones básicas sin limitaciones artificiales
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
         * Load fiat balance for email-only users (no wallet)
         * @param {string} userId - Supabase user ID
         */
        async loadFiatBalance(userId) {
            console.log('[credits-system] 🔄 Cargando saldo fiat para usuario:', userId);
            
            try {
                // Intentar obtener desde Supabase directamente
                if (typeof supabaseClient !== 'undefined') {
                    const { data: userData, error } = await supabaseClient
                        .from('users')
                        .select('saldo_fiat, saldo_onchain')
                        .eq('id', userId)
                        .maybeSingle();
                    
                    if (!error && userData) {
                        const fiatBalance = parseFloat(userData.saldo_fiat || 0);
                        const onchainBalance = parseFloat(userData.saldo_onchain || 0);
                        const totalBalance = fiatBalance + onchainBalance;
                        
                        this.currentCredits = totalBalance;
                        this.currentUsdcValue = totalBalance; // 1:1 con USDC
                        this.currentUserId = userId;
                        
                        console.log('[credits-system] ✅ Saldo fiat cargado:', {
                            fiat: fiatBalance,
                            onchain: onchainBalance,
                            total: totalBalance
                        });
                        
                        this.updateCreditsDisplay();
                        return totalBalance;
                    }
                }
                
                // Fallback: Intentar desde backend API
                const backendUrl = `${this.backendUrl}/api/user/balance/${userId}`;
                const response = await fetch(backendUrl, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const totalBalance = parseFloat(data.total_balance || 0);
                    
                    this.currentCredits = totalBalance;
                    this.currentUsdcValue = totalBalance;
                    this.currentUserId = userId;
                    
                    console.log('[credits-system] ✅ Saldo cargado desde backend:', totalBalance);
                    this.updateCreditsDisplay();
                    return totalBalance;
                }
                
                // Si todo falla, retornar 0
                this.currentCredits = 0;
                this.currentUsdcValue = 0;
                this.updateCreditsDisplay();
                return 0;
                
            } catch (error) {
                console.error('[credits-system] ❌ Error cargando saldo fiat:', error);
                this.currentCredits = 0;
                this.currentUsdcValue = 0;
                this.updateCreditsDisplay();
                return 0;
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
