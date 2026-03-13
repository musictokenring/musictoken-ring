/**
 * Ramp Network Integration
 * On-ramp fiat-to-crypto widget para comprar USDC en Base con tarjeta, PSE, Apple Pay, Google Pay
 * 
 * Documentación: https://docs.rampnetwork.com/
 * 
 * Flujo completo automatizado:
 * 1. Usuario compra USDC con Ramp → USDC llega a su wallet
 * 2. Se muestra modal con botón "Depositar USDC a Plataforma"
 * 3. Usuario hace clic → Se abre wallet con transacción pre-configurada
 * 4. Usuario confirma → USDC se envía a plataforma automáticamente
 * 5. DepositListener detecta → Créditos se acreditan automáticamente (<1 minuto)
 */

(function() {
    'use strict';

    const RampIntegration = {
        // API Key - Se actualizará cuando Ramp entregue el staging key
        stagingApiKey: 'STAGING_API_KEY_AQUI', // Reemplazar cuando Ramp lo entregue
        productionApiKey: null, // Se configurará después de due diligence
        
        // Configuración por defecto
        config: {
            hostAppName: 'Music Token Ring',
            hostLogoUrl: 'https://musictokenring.xyz/logo.png', // TODO: Actualizar con logo real
            swapAsset: 'BASE_USDC', // USDC en Base network
            swapNetwork: 'BASE',
            fiatCurrency: 'COP', // Por defecto Colombia, puede cambiarse a USD
            variant: 'auto', // 'auto', 'hosted', 'embedded-desktop', 'embedded-mobile'
        },
        
        rampInstance: null,
        isInitialized: false,

        /**
         * Initialize Ramp SDK
         */
        async init() {
            if (this.isInitialized) {
                console.log('[ramp] Ya inicializado');
                return;
            }

            try {
                // Verificar si el SDK está disponible (cargado via script tag o npm)
                if (typeof RampInstantSDK !== 'undefined') {
                    console.log('[ramp] SDK disponible (script tag)');
                    this.isInitialized = true;
                    return;
                }

                // Intentar cargar el SDK desde CDN si no está disponible
                await this.loadSDK();
                this.isInitialized = true;
                console.log('[ramp] SDK cargado e inicializado');
            } catch (error) {
                // No crítico: Ramp es solo para on-ramp (comprar USDC con tarjeta)
                // El sistema funciona perfectamente sin esto
                console.warn('[ramp] SDK no disponible (no crítico - solo afecta compra con tarjeta):', error.message);
                // No marcar como inicializado para que pueda intentar de nuevo más tarde
            }
        },

        /**
         * Load Ramp SDK from CDN
         */
        async loadSDK() {
            return new Promise((resolve, reject) => {
                // Verificar si ya está cargado
                if (typeof RampInstantSDK !== 'undefined') {
                    resolve();
                    return;
                }

                // Cargar script desde CDN
                const script = document.createElement('script');
                script.src = 'https://ramp.network/static/widget.js';
                script.async = true;
                script.onload = () => {
                    if (typeof RampInstantSDK !== 'undefined') {
                        resolve();
                    } else {
                        reject(new Error('RampInstantSDK no disponible después de cargar script'));
                    }
                };
                script.onerror = () => reject(new Error('Error cargando Ramp SDK'));
                document.head.appendChild(script);
            });
        },

        /**
         * Get current API key (staging or production)
         */
        getApiKey() {
            // Por ahora usar staging, cambiar a production cuando esté disponible
            const isProduction = window.location.hostname === 'musictokenring.xyz' && 
                                 !window.location.hostname.includes('localhost');
            
            if (isProduction && this.productionApiKey) {
                return this.productionApiKey;
            }
            
            return this.stagingApiKey;
        },

        /**
         * Get connected wallet address
         */
        getWalletAddress() {
            const walletAddress = window.connectedAddress || 
                                 localStorage.getItem('mtr_wallet') ||
                                 null;
            
            if (!walletAddress) {
                console.warn('[ramp] No hay wallet conectada');
                return null;
            }
            
            return walletAddress;
        },

        /**
         * Create and show Ramp widget
         * @param {Object} options - Opciones de configuración
         */
        async showWidget(options = {}) {
            try {
                // Verificar wallet conectada
                const walletAddress = this.getWalletAddress();
                if (!walletAddress) {
                    if (typeof showToast === 'function') {
                        showToast('Conecta tu wallet primero para comprar USDC', 'error');
                    }
                    return;
                }

                // Verificar API key
                const apiKey = this.getApiKey();
                if (!apiKey || apiKey === 'STAGING_API_KEY_AQUI') {
                    console.warn('[ramp] API key no configurada aún');
                    if (typeof showToast === 'function') {
                        showToast('Ramp Network aún no está configurado. Próximamente disponible.', 'info');
                    }
                    return;
                }

                // Asegurar que SDK está cargado
                if (!this.isInitialized) {
                    await this.init();
                }

                // Configuración del widget
                const widgetConfig = {
                    hostAppName: this.config.hostAppName,
                    hostLogoUrl: this.config.hostLogoUrl,
                    hostApiKey: apiKey,
                    swapAsset: options.swapAsset || this.config.swapAsset,
                    swapNetwork: options.swapNetwork || this.config.swapNetwork,
                    userAddress: walletAddress,
                    fiatCurrency: options.fiatCurrency || this.config.fiatCurrency,
                    fiatValue: options.fiatValue || '10', // Valor sugerido por defecto
                    variant: options.variant || this.config.variant,
                    ...options.extraParams // Parámetros adicionales si se necesitan
                };

                console.log('[ramp] Configurando widget con:', {
                    ...widgetConfig,
                    hostApiKey: '***' // No loggear API key completo
                });

                // Crear instancia del widget
                if (typeof RampInstantSDK !== 'undefined') {
                    this.rampInstance = new RampInstantSDK(widgetConfig);

                    // Event listeners
                    this.rampInstance
                        .on('*', (event) => {
                            console.log('[ramp] Event:', event.type, event);
                            this.handleRampEvent(event);
                        })
                        .on('WIDGET_CLOSE', () => {
                            console.log('[ramp] Widget cerrado');
                            this.rampInstance = null;
                        })
                        .on('PURCHASE_CREATED', (event) => {
                            console.log('[ramp] Compra creada:', event);
                            this.handlePurchaseCreated(event);
                        })
                        .on('PURCHASE_SUCCESSFUL', (event) => {
                            console.log('[ramp] Compra exitosa:', event);
                            this.handlePurchaseCompleted(event);
                        })
                        .on('WIDGET_CONFIG_DONE', () => {
                            console.log('[ramp] Widget configurado');
                        });

                    // Mostrar widget
                    this.rampInstance.show();
                    console.log('[ramp] Widget mostrado');
                } else {
                    throw new Error('RampInstantSDK no disponible');
                }
            } catch (error) {
                console.error('[ramp] Error mostrando widget:', error);
                if (typeof showToast === 'function') {
                    showToast('Error al abrir Ramp Network. Intenta recargar la página.', 'error');
                }
            }
        },

        /**
         * Handle Ramp events
         */
        handleRampEvent(event) {
            switch (event.type) {
                case 'PURCHASE_CREATED':
                    this.handlePurchaseCreated(event);
                    break;
                case 'WIDGET_CLOSE':
                    console.log('[ramp] Widget cerrado por usuario');
                    break;
                default:
                    console.log('[ramp] Evento no manejado:', event.type);
            }
        },

        /**
         * Handle purchase created event
         */
        handlePurchaseCreated(event) {
            console.log('[ramp] Compra iniciada:', event);
            
            if (typeof showToast === 'function') {
                showToast('Compra iniciada en Ramp Network. Completa el proceso en el widget.', 'info');
            }

        },

        /**
         * Handle purchase completed event (cuando Ramp completa la compra)
         */
        handlePurchaseCompleted(event) {
            console.log('[ramp] Compra completada:', event);
            
            // Mostrar instrucciones para depositar USDC a la plataforma
            setTimeout(() => {
                this.showDepositInstructions();
            }, 2000); // Esperar 2 segundos para que el widget se cierre
        },

        /**
         * Show instructions after Ramp purchase completes
         * USDC llega a la wallet del usuario, necesita enviarlo a la plataforma
         */
        showDepositInstructions() {
            const walletAddress = this.getWalletAddress();
            if (!walletAddress) return;

            // Crear modal o sección con instrucciones
            const instructionsHTML = `
                <div id="rampDepositInstructions" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div class="max-w-md w-full bg-gray-900 rounded-2xl border border-purple-500/30 p-6">
                        <div class="flex justify-between items-start mb-4">
                            <h3 class="text-xl font-bold text-white">✅ USDC Recibido</h3>
                            <button onclick="document.getElementById('rampDepositInstructions').remove()" 
                                    class="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <p class="text-gray-300 mb-4">
                            Tu compra de USDC se completó. Los USDC están en tu wallet.
                        </p>
                        <p class="text-gray-400 text-sm mb-6">
                            Para acreditar créditos en la plataforma, envía los USDC a la dirección de la plataforma.
                            Los créditos se acreditarán automáticamente en menos de 1 minuto.
                        </p>
                        <div class="space-y-3">
                            <button onclick="RampIntegration.depositUsdcToPlatform()" 
                                    class="w-full px-6 py-3 rounded-lg text-sm font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 transition-all cursor-pointer">
                                💳 Depositar USDC a la Plataforma
                            </button>
                            <button onclick="document.getElementById('rampDepositInstructions').remove()" 
                                    class="w-full px-6 py-3 rounded-lg text-sm font-semibold bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition cursor-pointer">
                                Lo haré después
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Agregar al DOM si no existe
            let existing = document.getElementById('rampDepositInstructions');
            if (existing) {
                existing.remove();
            }

            document.body.insertAdjacentHTML('beforeend', instructionsHTML);
        },

        /**
         * Deposit USDC to platform wallet
         * Abre wallet con transacción pre-configurada usando viem
         */
        async depositUsdcToPlatform(amount = null) {
            const walletAddress = this.getWalletAddress();
            if (!walletAddress) {
                if (typeof showToast === 'function') {
                    showToast('Conecta tu wallet primero', 'error');
                }
                return;
            }

            const platformWallet = '0x75376BC58830f27415402875D26B73A6BE8E2253';
            const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

            try {
                // Verificar si viem y wallet están disponibles
                if (typeof window.ethereum === 'undefined') {
                    if (typeof showToast === 'function') {
                        showToast('MetaMask o wallet compatible no encontrada', 'error');
                    }
                    return;
                }

                // Cerrar modal de instrucciones
                const instructions = document.getElementById('rampDepositInstructions');
                if (instructions) {
                    instructions.remove();
                }

                if (typeof showToast === 'function') {
                    showToast('Preparando transacción USDC...', 'info');
                }

                // Importar funciones necesarias de viem dinámicamente
                const { createWalletClient, createPublicClient, custom, parseUnits, formatUnits } = await import('https://esm.sh/viem@2');
                const { base } = await import('https://esm.sh/viem@2/chains');

                // Crear clients
                const publicClient = createPublicClient({
                    chain: base,
                    transport: custom(window.ethereum)
                });

                const walletClient = createWalletClient({
                    chain: base,
                    transport: custom(window.ethereum)
                });

                // Obtener balance de USDC del usuario
                const usdcBalance = await publicClient.readContract({
                    address: usdcAddress,
                    abi: [{
                        type: 'function',
                        name: 'balanceOf',
                        stateMutability: 'view',
                        inputs: [{ name: 'account', type: 'address' }],
                        outputs: [{ name: '', type: 'uint256' }]
                    }],
                    functionName: 'balanceOf',
                    args: [walletAddress]
                });

                const balanceFormatted = parseFloat(formatUnits(usdcBalance, 6)); // USDC tiene 6 decimales

                if (balanceFormatted <= 0) {
                    if (typeof showToast === 'function') {
                        showToast('No tienes USDC en tu wallet para depositar', 'error');
                    }
                    return;
                }

                // Determinar cantidad a depositar
                let depositAmount = amount;
                if (!depositAmount || depositAmount <= 0) {
                    depositAmount = balanceFormatted; // Depositar todo el balance
                }

                if (depositAmount > balanceFormatted) {
                    if (typeof showToast === 'function') {
                        showToast(`Solo tienes ${balanceFormatted.toFixed(2)} USDC disponible`, 'error');
                    }
                    return;
                }

                // Convertir a unidades (6 decimales para USDC)
                const depositAmountWei = parseUnits(depositAmount.toFixed(6), 6);

                // ABI para transfer de ERC20
                const erc20Abi = [{
                    type: 'function',
                    name: 'transfer',
                    stateMutability: 'nonpayable',
                    inputs: [
                        { name: 'to', type: 'address' },
                        { name: 'amount', type: 'uint256' }
                    ],
                    outputs: [{ name: '', type: 'bool' }]
                }];

                // Crear y enviar transacción
                if (typeof showToast === 'function') {
                    showToast('Abre tu wallet para confirmar el depósito de USDC...', 'info');
                }

                const hash = await walletClient.writeContract({
                    address: usdcAddress,
                    abi: erc20Abi,
                    functionName: 'transfer',
                    args: [platformWallet, depositAmountWei],
                    account: walletAddress
                });

                console.log('[ramp] Transacción USDC enviada:', hash);

                if (typeof showToast === 'function') {
                    showToast(`Transacción enviada. Esperando confirmación...`, 'info');
                }

                // Esperar confirmación
                const receipt = await publicClient.waitForTransactionReceipt({ hash });

                if (receipt.status === 'success') {
                    console.log('[ramp] Transacción confirmada:', receipt);
                    
                    if (typeof showToast === 'function') {
                        showToast(`✅ ${depositAmount.toFixed(2)} USDC depositados. Los créditos se acreditarán automáticamente en menos de 1 minuto.`, 'success');
                    }

                    // Mostrar link a BaseScan
                    const baseScanLink = `https://basescan.org/tx/${hash}`;
                    console.log('[ramp] Ver transacción:', baseScanLink);

                    // Opcional: recargar balance después de unos segundos
                    setTimeout(() => {
                        if (window.CreditsSystem && typeof window.CreditsSystem.loadBalance === 'function') {
                            window.CreditsSystem.loadBalance(walletAddress);
                        }
                    }, 5000);

                } else {
                    throw new Error('Transacción falló');
                }

            } catch (error) {
                console.error('[ramp] Error en depósito automático:', error);
                
                // Si falla el método automático, usar método manual
                if (error.message && error.message.includes('User rejected')) {
                    if (typeof showToast === 'function') {
                        showToast('Transacción cancelada por el usuario', 'warning');
                    }
                } else {
                    console.warn('[ramp] Fallando a método manual');
                    this.depositUsdcManual();
                }
            }
        },

        /**
         * Método manual de depósito (fallback)
         * Copia dirección y muestra instrucciones
         */
        depositUsdcManual() {
            const platformWallet = '0x75376BC58830f27415402875D26B73A6BE8E2253';
            
            // Mostrar dirección de plataforma para copiar
            const addressInput = document.getElementById('platformWalletAddress');
            if (addressInput) {
                addressInput.select();
                document.execCommand('copy');
                if (typeof showToast === 'function') {
                    showToast(`Dirección copiada: ${platformWallet.slice(0, 10)}... Envía USDC desde tu wallet.`, 'info');
                }
            } else {
                // Si no existe el input, crear uno temporal
                const tempInput = document.createElement('input');
                tempInput.value = platformWallet;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);
                
                if (typeof showToast === 'function') {
                    showToast(`Dirección copiada: ${platformWallet.slice(0, 10)}... Envía USDC desde tu wallet.`, 'info');
                }
            }
        },

        /**
         * Show widget with preset amounts
         */
        async buyWithPreset(amount) {
            await this.showWidget({
                fiatValue: String(amount),
                fiatCurrency: 'USD' // Usar USD para montos presets
            });
        },

        /**
         * Show widget for Colombia (COP)
         */
        async buyForColombia(amountCOP = null) {
            await this.showWidget({
                fiatCurrency: 'COP',
                fiatValue: amountCOP ? String(amountCOP) : '50000' // ~$12 USD aprox
            });
        }
    };

    // Exportar a window
    window.RampIntegration = RampIntegration;

    // Auto-inicializar cuando DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            RampIntegration.init();
        });
    } else {
        RampIntegration.init();
    }

    console.log('[ramp-integration] Módulo cargado');
})();
