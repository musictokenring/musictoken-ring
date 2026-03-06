/**
 * Deposit UI Component
 * Shows platform wallet address and deposit instructions
 * Automatically detects deposits via backend listener
 */

(function() {
    'use strict';

    const DepositUI = {
        platformWallet: window.CONFIG?.PLATFORM_WALLET_ADDRESS || '0x75376BC58830f27415402875D26B73A6BE8E2253',
        mtrTokenAddress: window.CONFIG?.MTR_TOKEN_ADDRESS || '0x99cd1eb32846c9027ed9cb8710066fa08791c33b',
        usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base USDC

        /**
         * Initialize deposit UI
         */
        init() {
            this.createDepositSection();
            this.startDepositCheck();
        },

        /**
         * Create deposit section in UI
         */
        createDepositSection() {
            // Find or create deposit section
            let depositSection = document.getElementById('depositSection');
            
            if (!depositSection) {
                // Create deposit section
                depositSection = document.createElement('section');
                depositSection.id = 'depositSection';
                depositSection.className = 'mb-16';
                
                // Insert after wallet section or at end of main
                const main = document.querySelector('main');
                if (main) {
                    main.appendChild(depositSection);
                }
            }

            depositSection.innerHTML = `
                <div class="max-w-2xl mx-auto p-6 sm:p-8 rounded-2xl border border-cyan-500/15 bg-gray-900/50">
                    <h3 class="text-2xl font-bold text-white mb-4">💰 Depositar Créditos</h3>
                    <p class="text-gray-400 mb-6">Envía MTR o USDC a la dirección de la plataforma. Los créditos se acreditarán automáticamente.</p>
                    
                    <!-- Ramp Network On-Ramp -->
                    <div id="rampOnRampSection" class="mb-6 p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
                        <div class="flex items-start justify-between mb-3">
                            <div>
                                <h4 class="text-lg font-bold text-white mb-1">💳 Comprar USDC con Tarjeta o PSE</h4>
                                <p class="text-sm text-gray-400">Compra USDC directamente con tarjeta de crédito, PSE, Apple Pay o Google Pay. Sin salir del sitio.</p>
                            </div>
                            <span class="text-2xl">🚀</span>
                        </div>
                        
                        <div class="flex flex-wrap gap-2 mb-3">
                            <button onclick="RampIntegration.buyWithPreset(10)" 
                                    class="px-4 py-2 rounded-lg text-sm font-semibold bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 transition cursor-pointer">
                                $10 USD
                            </button>
                            <button onclick="RampIntegration.buyWithPreset(20)" 
                                    class="px-4 py-2 rounded-lg text-sm font-semibold bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 transition cursor-pointer">
                                $20 USD
                            </button>
                            <button onclick="RampIntegration.buyWithPreset(50)" 
                                    class="px-4 py-2 rounded-lg text-sm font-semibold bg-purple-500/20 border border-purple-500/30 text-purple-300 hover:bg-purple-500/30 transition cursor-pointer">
                                $50 USD
                            </button>
                            <button onclick="RampIntegration.buyForColombia()" 
                                    class="px-4 py-2 rounded-lg text-sm font-semibold bg-pink-500/20 border border-pink-500/30 text-pink-300 hover:bg-pink-500/30 transition cursor-pointer">
                                🇨🇴 Colombia (COP)
                            </button>
                        </div>
                        
                        <button id="rampBuyButton" onclick="RampIntegration.showWidget()" 
                                class="w-full px-6 py-3 rounded-lg text-sm font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 transition-all shadow-lg shadow-purple-500/20 cursor-pointer">
                            💳 Comprar USDC con Ramp Network
                        </button>
                        
                        <p class="text-xs text-gray-500 mt-3">
                            ⚠️ Requiere wallet conectada. Los USDC se enviarán directamente a tu wallet en Base.
                        </p>
                    </div>
                    
                    <!-- Verificar Depósito No Procesado -->
                    <div id="verifyDepositSection" class="mb-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                        <h4 class="text-lg font-bold text-yellow-400 mb-2">⚠️ ¿Tu depósito no se acreditó?</h4>
                        <p class="text-sm text-gray-400 mb-3">Si enviaste USDC pero no aparece en tu balance, verifica aquí:</p>
                        <div class="flex flex-col sm:flex-row gap-2">
                            <input type="text" id="verifyTxHash" placeholder="Hash de transacción (0x...)" 
                                class="flex-1 px-4 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm font-mono placeholder-gray-500">
                            <button onclick="DepositUI.verifyDeposit()" 
                                class="px-4 py-2 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/30 transition cursor-pointer whitespace-nowrap">
                                Verificar
                            </button>
                        </div>
                        <div id="verifyDepositResult" class="mt-3 hidden"></div>
                    </div>

                    <div class="space-y-4">
                        <div>
                            <label class="text-sm text-gray-400 mb-2 block">Dirección de la Plataforma:</label>
                            <div class="flex items-center gap-2">
                                <input type="text" id="platformWalletAddress" readonly 
                                    value="${this.platformWallet}" 
                                    class="flex-1 px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white text-sm font-mono">
                                <button onclick="copyPlatformWallet()" 
                                    class="px-4 py-3 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25 transition cursor-pointer">
                                    Copiar
                                </button>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div class="p-4 rounded-lg bg-black/40 border border-white/10">
                                <div class="text-sm text-gray-400 mb-1">Token MTR</div>
                                <div class="text-xs font-mono text-cyan-400 break-all">${this.mtrTokenAddress}</div>
                                <div class="text-xs text-gray-500 mt-2">Se convierte a créditos estables usando precio USDC actual</div>
                                <div class="text-xs text-green-400 mt-1">✓ 1 crédito = 1 USDC fijo</div>
                            </div>
                            <div class="p-4 rounded-lg bg-black/40 border border-white/10">
                                <div class="text-sm text-gray-400 mb-1">Token USDC</div>
                                <div class="text-xs font-mono text-cyan-400 break-all">${this.usdcAddress}</div>
                                <div class="text-xs text-gray-500 mt-2">1 USDC = 1 crédito (directo)</div>
                                <div class="text-xs text-green-400 mt-1">✓ Sin conversión variable</div>
                            </div>
                        </div>

                        <div class="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                            <div class="flex items-start gap-2">
                                <span class="text-cyan-400">ℹ️</span>
                                <div class="text-sm text-gray-300">
                                    <strong>Depósito Automático:</strong> Una vez que envíes MTR o USDC a la dirección de la plataforma, 
                                    los créditos se acreditarán automáticamente en tu cuenta en menos de 1 minuto. 
                                    No se requiere acción manual.
                                </div>
                            </div>
                        </div>

                        <div id="depositStatus" class="hidden p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                            <div class="text-sm text-green-400">
                                ✅ <strong>Depósito detectado:</strong> <span id="depositAmount"></span> 
                                → <span id="depositCredits"></span> créditos acreditados
                            </div>
                        </div>
                    </div>
                </div>
            `;
        },

        /**
         * Start checking for new deposits
         * Mejorado: también intenta sincronizar depósitos no detectados
         */
        startDepositCheck() {
            const walletAddress = window.connectedAddress || localStorage.getItem('mtr_wallet');
            if (!walletAddress) return;

            // Check for deposits every 30 seconds
            setInterval(async () => {
                await this.checkRecentDeposits(walletAddress);
            }, 30000);

            // Trigger backend sync every 2 minutes (para detectar depósitos perdidos)
            setInterval(async () => {
                await this.triggerBackendSync();
            }, 2 * 60 * 1000);

            // Initial check
            this.checkRecentDeposits(walletAddress);
            
            // Initial sync after 10 seconds
            setTimeout(() => {
                this.triggerBackendSync();
            }, 10000);
        },

        /**
         * Trigger backend deposit sync
         */
        async triggerBackendSync() {
            try {
                const walletAddress = window.connectedAddress || localStorage.getItem('mtr_wallet');
                if (!walletAddress) return;

                const backendUrl = window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com';
                
                // Llamar al endpoint de auto-sync específico para el usuario
                const response = await fetch(`${backendUrl}/api/deposits/auto-sync/${walletAddress}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (response.ok) {
                    const data = await response.json();
                    // Si hay depósitos recientes, recargar balance
                    if (data.recentDeposits && data.recentDeposits.length > 0) {
                        const newestDeposit = data.recentDeposits[0];
                        const depositTime = new Date(newestDeposit.created_at);
                        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
                        
                        if (depositTime > twoMinutesAgo) {
                            // Nuevo depósito detectado, recargar balance
                            if (window.CreditsSystem) {
                                await window.CreditsSystem.loadBalance(walletAddress);
                            }
                        }
                    }
                }
            } catch (error) {
                // Silently fail - no es crítico
                console.debug('[deposit-ui] Error triggering sync:', error);
            }
        },

        /**
         * Check for recent deposits
         */
        async checkRecentDeposits(walletAddress) {
            try {
                const backendUrl = window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com';
                const response = await fetch(`${backendUrl}/api/deposits/${walletAddress}`);
                
                if (response.ok) {
                    const data = await response.json();
                    const deposits = data.deposits || [];
                    
                    // Check for new deposits (last 2 minutes)
                    const recentDeposits = deposits.filter(dep => {
                        const depositTime = new Date(dep.created_at);
                        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
                        return depositTime > twoMinutesAgo && dep.status === 'processed';
                    });

                    if (recentDeposits.length > 0) {
                        this.showDepositNotification(recentDeposits[0]);
                        
                        // Reload credits balance
                        if (window.CreditsSystem) {
                            await window.CreditsSystem.loadBalance(walletAddress);
                        }
                    }
                }
            } catch (error) {
                console.error('[deposit-ui] Error checking deposits:', error);
            }
        },

        /**
         * Show deposit notification
         */
        showDepositNotification(deposit) {
            const statusEl = document.getElementById('depositStatus');
            const amountEl = document.getElementById('depositAmount');
            const creditsEl = document.getElementById('depositCredits');
            
            if (statusEl && amountEl && creditsEl) {
                amountEl.textContent = `${deposit.amount} ${deposit.token}`;
                creditsEl.textContent = `${deposit.credits_awarded}`;
                statusEl.classList.remove('hidden');
                
                // Hide after 10 seconds
                setTimeout(() => {
                    statusEl.classList.add('hidden');
                }, 10000);
            }
        },

        /**
         * Verify deposit by hash (helper function)
         */
        async verifyDepositByHash(txHash) {
            const txHashInput = document.getElementById('verifyTxHash');
            if (txHashInput) {
                txHashInput.value = txHash;
            }
            await this.verifyDeposit();
        },

        /**
         * Verify and process a deposit that wasn't credited
         */
        async verifyDeposit() {
            const txHashInput = document.getElementById('verifyTxHash');
            const resultDiv = document.getElementById('verifyDepositResult');
            
            if (!txHashInput || !resultDiv) return;

            let txHash = txHashInput.value.trim();
            
            // Limpiar el hash: remover espacios, saltos de línea, y barras diagonales comunes
            txHash = txHash.replace(/\s+/g, ''); // Remover espacios
            txHash = txHash.replace(/\//g, ''); // Remover barras diagonales
            txHash = txHash.replace(/\n/g, ''); // Remover saltos de línea
            txHash = txHash.replace(/-/g, ''); // Remover guiones (por si acaso)
            
            // Validar formato básico
            if (!txHash || !txHash.startsWith('0x')) {
                resultDiv.className = 'mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm';
                resultDiv.innerHTML = '❌ <strong>Hash inválido</strong><br>El hash debe comenzar con "0x"';
                resultDiv.classList.remove('hidden');
                return;
            }
            
            // Validar longitud (debe ser 66 caracteres: 0x + 64 hex)
            if (txHash.length !== 66) {
                resultDiv.className = 'mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm';
                resultDiv.innerHTML = `❌ <strong>Hash inválido</strong><br>El hash debe tener 66 caracteres (tiene ${txHash.length}).<br>Verifica que copiaste el hash completo sin espacios ni caracteres especiales.`;
                resultDiv.classList.remove('hidden');
                return;
            }
            
            // Validar que solo contenga caracteres hexadecimales
            if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
                resultDiv.className = 'mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm';
                resultDiv.innerHTML = '❌ <strong>Hash inválido</strong><br>El hash contiene caracteres no válidos. Solo debe contener números y letras de la A a la F.';
                resultDiv.classList.remove('hidden');
                return;
            }
            
            // Actualizar el input con el hash limpio
            txHashInput.value = txHash;

            // Get wallet address - Múltiples fuentes para asegurar detección
            let walletAddress = null;
            
            // Intentar desde window.connectedAddress (si está expuesta globalmente)
            if (typeof window !== 'undefined' && window.connectedAddress) {
                walletAddress = window.connectedAddress;
            }
            
            // Si no, intentar desde localStorage
            if (!walletAddress) {
                walletAddress = localStorage.getItem('mtr_wallet');
            }
            
            // Si no, intentar leer del DOM (elemento walletAddress)
            if (!walletAddress) {
                const walletEl = document.getElementById('walletAddress');
                if (walletEl && walletEl.textContent) {
                    // Extraer dirección completa si está truncada (ej: "0x1234...5678")
                    const walletText = walletEl.textContent.trim();
                    // Si está en formato truncado, necesitamos la dirección completa
                    // Buscar en el scope global donde se almacena
                }
            }
            
            // Si aún no tenemos la dirección, buscar en el scope del script principal
            // (connectedAddress puede estar en el scope de index.html)
            if (!walletAddress && typeof connectedAddress !== 'undefined') {
                walletAddress = connectedAddress;
            }
            
            if (!walletAddress) {
                resultDiv.className = 'mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm';
                resultDiv.innerHTML = '❌ No se pudo detectar la wallet conectada. Por favor reconecta tu wallet.';
                resultDiv.classList.remove('hidden');
                return;
            }
            
            // Normalizar dirección (lowercase, sin espacios)
            walletAddress = walletAddress.toLowerCase().trim();
            
            console.log('[deposit-ui] Wallet detectada para verificación:', walletAddress);

            resultDiv.className = 'mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm';
            resultDiv.innerHTML = '🔍 Verificando transacción...';
            resultDiv.classList.remove('hidden');

            try {
                const backendUrl = window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com';
                
                console.log('[deposit-ui] Verificando transacción:', txHash);
                console.log('[deposit-ui] Backend URL:', backendUrl);
                console.log('[deposit-ui] Wallet address:', walletAddress);
                
                // Diagnose transaction - incluir wallet address como query param para búsqueda alternativa
                const diagnoseUrl = `${backendUrl}/api/deposits/diagnose/${txHash}?walletAddress=${encodeURIComponent(walletAddress)}`;
                const diagnoseResponse = await fetch(diagnoseUrl, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                console.log('[deposit-ui] Response status:', diagnoseResponse.status);
                console.log('[deposit-ui] Response ok:', diagnoseResponse.ok);
                
                if (!diagnoseResponse.ok) {
                    // Intentar obtener detalles del error del backend
                    let errorMessage = 'Error al verificar transacción';
                    let errorDetails = null;
                    
                    try {
                        const errorData = await diagnoseResponse.json();
                        console.log('[deposit-ui] Error data from backend:', errorData);
                        errorMessage = errorData.message || errorData.error || errorMessage;
                        errorDetails = errorData.details;
                    } catch (e) {
                        console.error('[deposit-ui] Error parsing error response:', e);
                        // Si no se puede parsear el JSON, usar el status text
                        errorMessage = `Error ${diagnoseResponse.status}: ${diagnoseResponse.statusText || 'Error al conectar con el servidor'}`;
                    }
                    
                    const error = new Error(errorMessage);
                    error.status = diagnoseResponse.status;
                    error.details = errorDetails;
                    throw error;
                }

                const diagnoseData = await diagnoseResponse.json();

                if (diagnoseData.processed) {
                    // Already processed
                    resultDiv.className = 'mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm';
                    resultDiv.innerHTML = `
                        ✅ <strong>Depósito ya procesado</strong><br>
                        Hash: ${diagnoseData.deposit.tx_hash}<br>
                        Créditos otorgados: ${diagnoseData.deposit.credits_awarded}<br>
                        Monto: ${diagnoseData.deposit.amount} ${diagnoseData.deposit.token}<br>
                        Fecha: ${new Date(diagnoseData.deposit.processed_at).toLocaleString('es-CO')}
                    `;
                } else if (diagnoseData.hashNotFound && diagnoseData.recentDeposits && diagnoseData.recentDeposits.length > 0) {
                    // Hash no encontrado pero hay depósitos recientes
                    resultDiv.className = 'mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm';
                    let html = `
                        ⚠️ <strong>Hash no encontrado</strong><br>
                        El hash proporcionado no se encontró, pero se encontraron ${diagnoseData.recentDeposits.length} depósito(s) reciente(s) para tu wallet:<br><br>
                    `;
                    
                    diagnoseData.recentDeposits.forEach((dep, idx) => {
                        html += `
                            <div class="mt-2 p-2 bg-black/20 rounded text-xs">
                                <strong>Depósito ${idx + 1}:</strong><br>
                                Hash: <code class="text-cyan-400">${dep.tx_hash}</code><br>
                                Monto: ${dep.amount} ${dep.token}<br>
                                Créditos: ${dep.credits_awarded}<br>
                                Estado: ${dep.status === 'processed' ? '✅ Procesado' : '⏳ Pendiente'}<br>
                                Fecha: ${new Date(dep.created_at).toLocaleString('es-CO')}<br>
                                <button onclick="DepositUI.verifyDepositByHash('${dep.tx_hash}')" 
                                    class="mt-1 px-3 py-1 rounded bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/30 transition cursor-pointer text-xs">
                                    Verificar este depósito
                                </button>
                            </div>
                        `;
                    });
                    
                    resultDiv.innerHTML = html;
                } else {
                    // Not processed - show details and offer to process
                    if (diagnoseData.transfer.from.toLowerCase() !== walletAddress.toLowerCase()) {
                        resultDiv.className = 'mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm';
                        resultDiv.innerHTML = `
                            ❌ <strong>Wallet no coincide</strong><br>
                            Tu wallet: ${walletAddress}<br>
                            Wallet de la transacción: ${diagnoseData.transfer.from}
                        `;
                    } else {
                        resultDiv.className = 'mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm';
                        resultDiv.innerHTML = `
                            ⚠️ <strong>Depósito NO procesado</strong><br>
                            Monto: ${diagnoseData.transfer.amount} USDC<br>
                            Créditos a otorgar: ${diagnoseData.transfer.credits}<br>
                            Fee: ${diagnoseData.transfer.fee} USDC<br><br>
                            <button onclick="DepositUI.processDeposit('${txHash}', '${walletAddress}')" 
                                class="mt-2 px-4 py-2 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/30 transition cursor-pointer">
                                🔧 Procesar Depósito Ahora
                            </button>
                        `;
                    }
                }

            } catch (error) {
                console.error('[deposit-ui] Error verifying deposit:', error);
                console.error('[deposit-ui] Error details:', {
                    message: error.message,
                    stack: error.stack,
                    txHash: txHash,
                    walletAddress: walletAddress,
                    backendUrl: window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com'
                });
                
                resultDiv.className = 'mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm';
                
                // Mensaje de error más detallado
                let errorMsg = error.message || 'Error desconocido al verificar transacción';
                
                // Mensajes específicos según el tipo de error
                if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                    errorMsg = '❌ <strong>Error de conexión</strong><br>No se pudo conectar con el servidor. Verifica tu conexión a internet.';
                } else if (error.message.includes('404')) {
                    errorMsg = '❌ <strong>Endpoint no encontrado</strong><br>El servidor no responde. Intenta más tarde.';
                } else if (error.message.includes('500') || error.status === 500) {
                    errorMsg = '❌ <strong>Error del servidor</strong><br>El servidor encontró un problema al procesar la transacción.<br><br>';
                    errorMsg += '<small class="text-gray-400">Posibles causas:</small><br>';
                    errorMsg += '<small class="text-gray-400">• La transacción no existe en la red Base</small><br>';
                    errorMsg += '<small class="text-gray-400">• Problemas temporales con el RPC de Base</small><br>';
                    errorMsg += '<small class="text-gray-400">• El hash de transacción pertenece a otra red</small><br><br>';
                    errorMsg += '<small class="text-yellow-400">Verifica que el hash sea correcto y pertenezca a la red Base.</small>';
                    
                    if (error.details && process.env.NODE_ENV === 'development') {
                        errorMsg += '<br><br><small class="text-gray-500">Detalles técnicos: ' + JSON.stringify(error.details) + '</small>';
                    }
                } else if (error.message.includes('Transaction failed')) {
                    errorMsg = '❌ <strong>Transacción fallida</strong><br>Esta transacción no fue exitosa en la blockchain.';
                } else if (error.message.includes('not found') || error.message.includes('Invalid transaction')) {
                    errorMsg = '❌ <strong>Transacción no encontrada</strong><br>Verifica que el hash de transacción sea correcto y pertenezca a la red Base.';
                } else {
                    errorMsg = `❌ <strong>Error:</strong> ${errorMsg}`;
                }
                
                resultDiv.innerHTML = errorMsg;
                resultDiv.classList.remove('hidden');
            }
        },

        /**
         * Process a deposit manually
         */
        async processDeposit(txHash, walletAddress) {
            const resultDiv = document.getElementById('verifyDepositResult');
            
            if (resultDiv) {
                resultDiv.className = 'mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm';
                resultDiv.innerHTML = '⏳ Procesando depósito...';
            }

            if (typeof showToast === 'function') {
                showToast('Procesando depósito...', 'info');
            }

            try {
                const backendUrl = window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com';
                
                const response = await fetch(`${backendUrl}/api/deposits/process`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ txHash, walletAddress })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Error al procesar depósito');
                }

                const result = await response.json();

                if (resultDiv) {
                    resultDiv.className = 'mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm';
                    resultDiv.innerHTML = `
                        ✅ <strong>Depósito procesado exitosamente</strong><br>
                        Créditos acreditados: ${result.deposit.credits_awarded}<br>
                        Recarga la página para ver tu balance actualizado
                    `;
                }

                if (typeof showToast === 'function') {
                    showToast(`✅ ${result.deposit.credits_awarded} créditos acreditados!`, 'success');
                }

                // Reload balance
                if (typeof CreditsSystem !== 'undefined' && walletAddress) {
                    setTimeout(() => {
                        CreditsSystem.loadBalance(walletAddress);
                    }, 2000);
                }

            } catch (error) {
                console.error('[deposit-ui] Error processing deposit:', error);
                
                if (resultDiv) {
                    resultDiv.className = 'mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm';
                    resultDiv.innerHTML = `❌ Error: ${error.message}`;
                }

                if (typeof showToast === 'function') {
                    showToast(`Error: ${error.message}`, 'error');
                }
            }
        }
    };

    // Copy platform wallet function
    window.copyPlatformWallet = function() {
        const input = document.getElementById('platformWalletAddress');
        if (input) {
            input.select();
            document.execCommand('copy');
            if (typeof showToast === 'function') {
                showToast('Dirección copiada al portapapeles', 'success');
            }
        }
    };

    // Export to window
    window.DepositUI = DepositUI;

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => DepositUI.init());
    } else {
        DepositUI.init();
    }

    console.log('[deposit-ui] Module loaded');
})();
