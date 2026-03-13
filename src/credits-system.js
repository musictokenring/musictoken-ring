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
            console.log('[credits-system] 🔄🔄🔄 INICIANDO loadBalance:', {
                walletAddress: walletAddress,
                backendUrl: this.backendUrl,
                timestamp: new Date().toISOString()
            });
            
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

                // CRÍTICO: Para wallet de tesorería durante testing, usar endpoint especial si es necesario
                const TREASURY_WALLET = '0x75376BC58830f27415402875D26B73A6BE8E2253';
                const isTreasuryWallet = walletAddress && walletAddress.toLowerCase() === TREASURY_WALLET.toLowerCase();
                
                if (isTreasuryWallet) {
                    console.log('[credits-system] ⚠️ Wallet de tesorería detectada - cargando créditos para testing');
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
                
                // CRÍTICO: Consultar Supabase PRIMERO (fuente de verdad)
                if (typeof supabaseClient !== 'undefined' && userId) {
                    try {
                        console.log('[credits-system] 🔄🔴 CONSULTANDO SUPABASE PRIMERO (fuente de verdad)...', {
                            userId: userId,
                            onchainBalance: onchainBalance
                        });
                        const { data: supabaseCredits, error: supabaseError } = await supabaseClient
                            .from('user_credits')
                            .select('credits')
                            .eq('user_id', userId)
                            .maybeSingle();
                        
                        console.log('[credits-system] 🔍 Resultado de Supabase:', {
                            supabaseCredits: supabaseCredits,
                            supabaseError: supabaseError,
                            credits: supabaseCredits?.credits
                        });
                        
                        if (!supabaseError && supabaseCredits) {
                            const supabaseValue = supabaseCredits.credits || 0;
                            
                            // CRÍTICO: Los créditos pueden ser diferentes al on-chain porque se ganan/perden en batallas
                            // Solo validar contra valores ABSOLUTOS sospechosos (más de 10 millones)
                            rawCredits = supabaseValue;
                            console.log('[credits-system] ✅✅✅ Saldo obtenido desde Supabase (fuente de verdad):', rawCredits);
                        } else {
                            console.warn('[credits-system] ⚠️ Error consultando Supabase, usando backend como fallback:', supabaseError);
                            usarBackend = true;
                        }
                    } catch (supabaseError) {
                        console.error('[credits-system] ❌ Error consultando Supabase:', supabaseError);
                        console.warn('[credits-system] ⚠️ Usando backend como fallback');
                        usarBackend = true;
                    }
                } else {
                    console.warn('[credits-system] ⚠️ No se pudo consultar Supabase:', {
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
                
                // PROTECCIÓN CRÍTICA: Validar contra valores ABSOLUTOS sospechosos
                // Los créditos pueden ser diferentes al on-chain porque se ganan/perden en batallas
                // IMPORTANTE: Los créditos NO están limitados por el on-chain - pueden ser mayores o menores
                
                // PROTECCIÓN: Limitar créditos a un máximo razonable (10 millones)
                // Si un usuario tiene más de 10 millones, es sospechoso (posible bug)
                const MAX_REASONABLE_CREDITS = 10000000; // 10 millones máximo
                let valorSospechoso = false;
                
                // CRÍTICO: Validar solo contra valores ABSOLUTOS sospechosos
                // NO validar contra on-chain porque los créditos se ganan/perden en batallas
                if (rawCredits > MAX_REASONABLE_CREDITS) {
                    valorSospechoso = true;
                    console.error('[credits-system] ⚠️⚠️⚠️ VALOR SOSPECHOSO DEL BACKEND RECHAZADO:', {
                        valorRecibido: rawCredits,
                        maximoRazonable: MAX_REASONABLE_CREDITS,
                        valorAnterior: this.currentCredits || 0,
                        accion: 'OBLIGATORIO: Consultar Supabase directamente, NUNCA usar valor anterior sospechoso'
                    });
                    
                    // CRÍTICO: SIEMPRE consultar Supabase cuando hay valor sospechoso
                    // NUNCA usar el valor anterior si también es sospechoso
                    rawCredits = 0; // Establecer 0 por defecto
                    
                    try {
                        if (typeof supabaseClient !== 'undefined') {
                            // Intentar obtener userId si no lo tenemos
                            let userId = this.currentUserId;
                            if (!userId && walletAddress) {
                                userId = await this.getUserId(walletAddress);
                            }
                            
                            if (userId) {
                                console.log('[credits-system] 🔄 Obteniendo saldo REAL desde Supabase (obligatorio)...');
                                const { data: supabaseCredits, error: supabaseError } = await supabaseClient
                                    .from('user_credits')
                                    .select('credits')
                                    .eq('user_id', userId)
                                    .maybeSingle();
                                
                                if (!supabaseError && supabaseCredits) {
                                    const supabaseValue = supabaseCredits.credits || 0;
                                    const finalOnchainCheck = Number(window.__mtrOnChainBalance || 0);
                                    
                                    // CRÍTICO: Validar que Supabase tenga un valor razonable Y que NO exceda on-chain
                                    if (supabaseValue <= MAX_REASONABLE_CREDITS) {
                                        // CRÍTICO: Validar también contra on-chain - NUNCA exceder on-chain
                                        if (finalOnchainCheck > 0 && supabaseValue > finalOnchainCheck) {
                                            console.error('[credits-system] ❌❌❌ Supabase excede saldo on-chain - RECHAZADO:', {
                                                supabaseValue: supabaseValue,
                                                onchainBalance: finalOnchainCheck,
                                                diferencia: supabaseValue - finalOnchainCheck
                                            });
                                            // Usar saldo on-chain como máximo (NO multiplicar)
                                            rawCredits = finalOnchainCheck;
                                            console.log('[credits-system] ⚠️ Usando saldo on-chain como máximo permitido:', rawCredits);
                                        } else {
                                            rawCredits = supabaseValue;
                                            console.log('[credits-system] ✅✅✅ Saldo REAL obtenido desde Supabase:', rawCredits);
                                        }
                                    } else {
                                        console.error('[credits-system] ❌❌❌ Supabase también tiene valor sospechoso:', supabaseValue);
                                        // Si Supabase está mal pero tenemos on-chain, usar on-chain como máximo
                                        if (finalOnchainCheck > 0) {
                                            rawCredits = finalOnchainCheck; // Usar on-chain directamente, NO multiplicar
                                            console.log('[credits-system] ⚠️ Usando saldo on-chain como máximo permitido:', rawCredits);
                                        } else {
                                            rawCredits = 0; // Forzar 0 si todo está mal
                                        }
                                    }
                                } else {
                                    console.warn('[credits-system] ⚠️ Error consultando Supabase:', supabaseError);
                                    rawCredits = 0;
                                }
                            } else {
                                console.warn('[credits-system] ⚠️ No se pudo obtener userId para consultar Supabase');
                                rawCredits = 0;
                            }
                        } else {
                            console.warn('[credits-system] ⚠️ Supabase no disponible');
                            rawCredits = 0;
                        }
                    } catch (supabaseFallbackError) {
                        console.error('[credits-system] ❌ Error al obtener saldo desde Supabase:', supabaseFallbackError);
                        rawCredits = 0; // Siempre usar 0 si hay error
                    }
                    
                    // NO recargar automáticamente porque podría entrar en loop infinito
                    // El usuario puede recargar manualmente si es necesario
                }
                
                // Asegurar que no sea negativo
                rawCredits = Math.max(0, rawCredits);
                
                // VALIDACIÓN FINAL: Solo validar contra valores absolutos sospechosos
                // Los créditos pueden ser diferentes al on-chain (se ganan/perden en batallas)
                if (rawCredits > MAX_REASONABLE_CREDITS) {
                    console.error('[credits-system] ❌❌❌ VALIDACIÓN FINAL FALLIDA: Valor aún sospechoso después de todas las validaciones:', rawCredits);
                    
                    // CRÍTICO: Si el valor excede el máximo razonable, usar el saldo on-chain como límite máximo
                    const onchainBalance = Number(window.__mtrOnChainBalance || 0);
                    if (onchainBalance > 0 && onchainBalance <= MAX_REASONABLE_CREDITS) {
                        console.warn('[credits-system] ⚠️ Usando saldo on-chain como límite máximo:', onchainBalance);
                        rawCredits = onchainBalance; // Usar on-chain como máximo
                    } else {
                        // Si el valor es sospechosamente alto, consultar Supabase una vez más
                        if (typeof supabaseClient !== 'undefined' && userId) {
                            try {
                                const { data: supabaseCredits } = await supabaseClient
                                    .from('user_credits')
                                    .select('credits')
                                    .eq('user_id', userId)
                                    .maybeSingle();
                                
                                if (supabaseCredits && supabaseCredits.credits <= MAX_REASONABLE_CREDITS) {
                                    rawCredits = supabaseCredits.credits;
                                    console.log('[credits-system] ✅ Valor corregido desde Supabase:', rawCredits);
                                } else {
                                    // Si Supabase también está mal, usar on-chain o 0
                                    rawCredits = onchainBalance > 0 ? onchainBalance : 0;
                                    console.warn('[credits-system] ⚠️ Supabase también tiene valor sospechoso, usando on-chain o 0:', rawCredits);
                                }
                            } catch (e) {
                                rawCredits = onchainBalance > 0 ? onchainBalance : 0;
                            }
                        } else {
                            rawCredits = onchainBalance > 0 ? onchainBalance : 0; // Usar on-chain o 0
                        }
                    }
                }
                
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

                // Update UI - Asegurar que se actualice después de cargar
                this.updateCreditsDisplay();
                
                // Forzar actualización adicional después de un pequeño delay para asegurar que el DOM esté listo
                setTimeout(() => {
                    console.log('[credits-system] 🔄 Actualizando display (delay 100ms)...');
                    this.updateCreditsDisplay();
                }, 100);
                
                // Forzar actualización adicional después de más tiempo para asegurar que el backend haya procesado
                setTimeout(() => {
                    console.log('[credits-system] 🔄 Actualizando display (delay 500ms)...');
                    this.updateCreditsDisplay();
                }, 500);
                
                // También actualizar GameEngine si está disponible
                if (typeof window.GameEngine !== 'undefined' && typeof window.GameEngine.updateBalanceDisplay === 'function') {
                    setTimeout(() => {
                        console.log('[credits-system] 🔄 Actualizando GameEngine display...');
                        window.GameEngine.updateBalanceDisplay();
                    }, 200);
                }

            } catch (error) {
                console.error('[credits-system] ❌❌❌ ERROR loading balance:', error);
                console.error('[credits-system] ❌ Error message:', error.message);
                console.error('[credits-system] ❌ Error stack:', error.stack);
                console.error('[credits-system] ❌ Wallet address:', walletAddress);
                console.error('[credits-system] ❌ Backend URL:', this.backendUrl);
                
                // CRÍTICO: NO resetear el saldo a 0 si hay un error - mantener el saldo anterior
                // Solo loggear el error pero preservar el estado actual
                const previousCredits = this.currentCredits || 0;
                console.warn('[credits-system] ⚠️ Error cargando balance, manteniendo saldo anterior:', previousCredits);
                
                // NO llamar a updateCreditsDisplay() aquí porque borraría el saldo visible
                // El saldo anterior se mantiene y la UI no se actualiza con valores incorrectos
            }
        },

        /**
         * Update credits display in UI
         */
        updateCreditsDisplay() {
            // Logs para debugging cuando hay créditos pero no se muestran
            const shouldLog = this.currentCredits > 0;
            
            if (shouldLog) {
                console.log('[updateCreditsDisplay] 🔄 Actualizando display con créditos:', this.currentCredits);
            }
            
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
                if (creditsMobile) {
                    creditsMobile.textContent = this.currentCredits.toFixed(2);
                    if (shouldLog) {
                        console.log('[updateCreditsDisplay] ✅ Mobile display actualizado:', this.currentCredits.toFixed(2));
                    }
                }
                if (usdcMobile) usdcMobile.textContent = `$${this.currentUsdcValue.toFixed(2)}`;
                // Mostrar si hay créditos o wallet conectada
                if (this.currentCredits > 0 || window.connectedAddress) {
                    mobileDisplay.classList.remove('hidden');
                }
            }
            
            // CRÍTICO: También actualizar el elemento "Fichas jugables" en la sección de apuesta
            const playableCreditsEl = document.getElementById('userBalance');
            if (playableCreditsEl) {
                playableCreditsEl.textContent = this.currentCredits.toFixed(2);
                // Asegurar que el elemento tenga el estilo correcto
                playableCreditsEl.style.color = '';
                playableCreditsEl.style.fontWeight = '';
                playableCreditsEl.title = 'MTR créditos jugables: Fichas estables que valen siempre $1 cada una';
                if (shouldLog) {
                    console.log('[updateCreditsDisplay] ✅ userBalance (Fichas jugables) actualizado:', this.currentCredits.toFixed(2));
                }
            } else {
                if (shouldLog) {
                    console.warn('[updateCreditsDisplay] ⚠️ Elemento userBalance NO encontrado');
                }
            }
            
            // También actualizar appBalanceDisplay si existe (pero solo si el usuario quiere ver ambos)
            const appBalanceDisplay = document.getElementById('appBalanceDisplay');
            if (appBalanceDisplay && !appBalanceDisplay.classList.contains('hidden')) {
                appBalanceDisplay.textContent = `Fichas jugables: ${this.currentCredits.toFixed(2)} MTR créditos`;
                appBalanceDisplay.style.color = '';
                appBalanceDisplay.title = 'MTR créditos jugables: Fichas estables que valen siempre $1 cada una';
            }
            
            // CRÍTICO: Forzar actualización de GameEngine también para mantener sincronización
            // Pero solo si GameEngine está disponible y CreditsSystem tiene créditos cargados
            if (typeof window.GameEngine !== 'undefined' && typeof window.GameEngine.updateBalanceDisplay === 'function') {
                // Usar setTimeout para evitar loops infinitos
                setTimeout(() => {
                    if (this.currentCredits > 0) {
                        console.log('[updateCreditsDisplay] 🔄 Forzando actualización de GameEngine para sincronizar...');
                        window.GameEngine.updateBalanceDisplay();
                    }
                }, 50);
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
                // CRÍTICO: Validar contra valores absolutos sospechosos ANTES de permitir reclamar
                // Los créditos pueden ser diferentes al on-chain porque se ganan/perden en batallas
                const MAX_REASONABLE_CREDITS = 10000000; // 10 millones máximo
                
                if (this.currentCredits > MAX_REASONABLE_CREDITS) {
                    console.error('[claimCredits] ⚠️⚠️⚠️ BLOQUEADO: Créditos sospechosamente altos:', {
                        creditsDisponibles: this.currentCredits,
                        maximoRazonable: MAX_REASONABLE_CREDITS,
                        accion: 'RECLAMACIÓN BLOQUEADA - Valor sospechoso detectado'
                    });
                    
                    if (typeof showToast === 'function') {
                        showToast('Error: Saldo inválido detectado. Por favor, recarga la página y contacta soporte si el problema persiste.', 'error');
                    }
                    return null;
                }
                
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
                
                // CRÍTICO: Validar también el monto a reclamar contra valores absolutos sospechosos
                if (credits > MAX_REASONABLE_CREDITS) {
                    console.error('[claimCredits] ⚠️⚠️⚠️ BLOQUEADO: Monto a reclamar sospechosamente alto:', {
                        creditsAReclamar: credits,
                        maximoRazonable: MAX_REASONABLE_CREDITS
                    });
                    
                    if (typeof showToast === 'function') {
                        showToast('Error: El monto a reclamar es inválido. Por favor, verifica tu saldo.', 'error');
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
