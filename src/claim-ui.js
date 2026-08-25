/**
 * Claim UI Component
 * Reclamo de créditos → liquidación en wallet (USD / stablecoin según backend)
 */

(function() {
    'use strict';

    const ClaimUI = {
        /**
         * Initialize claim UI
         */
        async init() {
            this.createClaimSection();
            this.loadVaultBalance();
            // Update vault balance every 30 seconds
            setInterval(() => this.loadVaultBalance(), 30000);
            
            // 🔒 SEGURIDAD: Verificar autenticación y mostrar/ocultar formulario
            await this.checkAuthAndUpdateUI();
            
            // Verificar autenticación periódicamente
            setInterval(() => this.checkAuthAndUpdateUI(), 10000);
        },

        /**
         * Check authentication and update UI accordingly
         * Ahora también verifica wallet vinculada para navegadores internos
         */
        async checkAuthAndUpdateUI() {
            const claimInput = document.getElementById('claimCreditsAmount');
            const claimButton = document.querySelector('button[onclick="ClaimUI.processClaim()"]');
            const authWarning = document.getElementById('claimAuthWarning');
            
            if (!claimInput || !claimButton) return;
            
            let isAuthenticated = false;
            let hasLinkedWallet = false;
            
            // 1. Verificar sesión Supabase
            if (typeof supabaseClient !== 'undefined') {
                try {
                    const { data: { session } } = await supabaseClient.auth.getSession();
                    isAuthenticated = !!session;
                } catch (error) {
                    console.error('[claim-ui] Error checking auth:', error);
                    isAuthenticated = false;
                }
            }
            
            // 2. Verificar wallet vinculada (CRÍTICO para navegadores internos)
            const connectedAddress = window.connectedAddress || localStorage.getItem('mtr_wallet');
            if (connectedAddress && !isAuthenticated) {
                try {
                    const backendUrl = window.CONFIG?.BACKEND_API || window.CreditsSystem?.backendUrl || 'https://musictoken-ring.onrender.com';
                    const walletResponse = await fetch(`${backendUrl}/api/user/wallet/${connectedAddress}`);
                    if (walletResponse.ok) {
                        const walletData = await walletResponse.json();
                        if (walletData.linked && walletData.userId) {
                            hasLinkedWallet = true;
                            console.log('[claim-ui] ✅ Wallet vinculada, permitiendo reclamar');
                        }
                    }
                } catch (walletError) {
                    console.warn('[claim-ui] Error verificando wallet link:', walletError);
                }
            }
            
            if (!isAuthenticated && !hasLinkedWallet) {
                // Deshabilitar formulario si no está autenticado ni tiene wallet vinculada
                claimInput.disabled = true;
                claimInput.placeholder = 'Inicia sesión para reclamar créditos';
                if (claimButton) {
                    claimButton.disabled = true;
                    claimButton.classList.add('opacity-50', 'cursor-not-allowed');
                    claimButton.classList.remove('hover:opacity-90', 'cursor-pointer');
                }
                if (authWarning) {
                    authWarning.classList.remove('hidden');
                }
            } else {
                // Habilitar formulario si está autenticado o tiene wallet vinculada
                claimInput.disabled = false;
                claimInput.placeholder = 'Mínimo 5 créditos (~$5)';
                if (claimButton) {
                    claimButton.disabled = false;
                    claimButton.classList.remove('opacity-50', 'cursor-not-allowed');
                    claimButton.classList.add('hover:opacity-90', 'cursor-pointer');
                }
                if (authWarning) {
                    authWarning.classList.add('hidden');
                }
            }
        },

        /**
         * Create claim section
         */
        createClaimSection() {
            // Find cashout section and replace with claim section
            const cashoutSection = document.querySelector('section:has(#cashoutAmount)');
            
            if (cashoutSection) {
                cashoutSection.innerHTML = `
                    <div class="max-w-2xl mx-auto p-6 sm:p-8 rounded-2xl border border-fuchsia-500/30 bg-gradient-to-br from-gray-900/80 to-purple-950/30 neon-border-magenta">
                        <h3 class="text-xl font-bold text-fuchsia-400 neon-text-magenta mb-2 flex items-center gap-2">${window.MTRIcons ? window.MTRIcons.inline('cash', {color:'magenta', glow:false, style:'margin:0'}) : ''}Reclamar Premios</h3>
                        <p class="text-gray-400 text-sm mb-6">Elegí cómo retirar tus créditos ganados: en dólares/cripto a tu wallet vía <strong class="text-gray-300">NOWPayments</strong>, o en pesos colombianos vía <strong class="text-gray-300">Mercado Pago</strong>.</p>

                        <div id="claimAuthWarning" class="hidden p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
                            <div class="text-sm text-yellow-400 flex items-center gap-2">
                                ${window.MTRIcons ? window.MTRIcons.inline('warning', {color:'yellow', glow:false, style:'margin:0'}) : ''}Debes iniciar sesión para reclamar créditos. <a href="#" onclick="window.location.reload()" class="underline">Iniciar sesión</a>
                            </div>
                        </div>

                        <div class="mb-4 p-4 rounded-lg bg-black/40 border border-white/10">
                            <div class="text-sm text-gray-400 mb-2">Créditos disponibles:</div>
                            <div id="availableCreditsDisplay" class="text-2xl font-bold text-fuchsia-400">0 créditos</div>
                            <div id="availableUsdcDisplay" class="text-sm text-gray-400 mt-1">≈ $0 USD nominal</div>
                        </div>

                        <!-- Opción 1: USD / cripto vía NOWPayments -->
                        <div class="mb-4 p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5">
                            <p class="text-xs font-bold uppercase tracking-wide text-cyan-300 mb-3 flex items-center gap-1.5">${window.MTRIcons ? window.MTRIcons.inline('coin', {color:'cyan', glow:false, style:'margin:0'}) : ''}Retirar en USD / cripto · NOWPayments</p>
                            <div class="flex flex-col sm:flex-row gap-3">
                                <input id="claimCreditsAmount" type="number" min="5" placeholder="Mínimo 5 créditos (~$5)"
                                       class="flex-1 px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition">
                                <button type="button" onclick="ClaimUI.processClaim()"
                                        class="px-6 py-3 rounded-lg text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:opacity-90 transition-all shadow-lg shadow-cyan-500/30 cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5">
                                    ${window.MTRIcons ? window.MTRIcons.svg('cash', {size:16}) : ''} Reclamar fondos
                                </button>
                            </div>
                        </div>

                        <!-- Opción 2: pesos colombianos vía Mercado Pago -->
                        <div class="mb-4 p-4 rounded-xl border border-yellow-500/40 bg-yellow-500/5">
                            <p class="text-xs font-bold uppercase tracking-wide text-yellow-300 mb-3">🇨🇴 Retirar en pesos (COP) · Mercado Pago</p>
                            <button type="button" onclick="window.openWithdrawalCopModal && window.openWithdrawalCopModal()"
                                    class="w-full px-4 py-3.5 rounded-xl text-sm font-bold bg-gradient-to-r from-yellow-400 to-amber-500 text-gray-900 hover:opacity-90 transition-all shadow-lg shadow-yellow-500/30 cursor-pointer flex items-center justify-center gap-2">
                                <span>Retirar en pesos</span>
                                <span class="flex items-center gap-1 text-[10px] font-semibold normal-case bg-black/15 px-2 py-0.5 rounded-full">Nequi · Bancolombia · Bre-B</span>
                            </button>
                        </div>

                        <div id="claimStatus" class="hidden p-4 rounded-lg bg-green-500/10 border border-green-500/20 mb-4">
                            <div class="text-sm text-green-400" id="claimStatusText"></div>
                        </div>

                        <div class="p-3 rounded-lg bg-green-500/10 border border-green-500/20 mb-4">
                            <div class="text-xs text-green-400 space-y-1">
                                <div class="flex items-start gap-1.5">${window.MTRIcons ? window.MTRIcons.inline('check', {color:'green', glow:false, size:14, style:'margin-top:1px'}) : ''}<span><strong>Créditos estables:</strong> 1 crédito ≈ 1 USD nominal</span></div>
                                <div class="flex items-start gap-1.5">${window.MTRIcons ? window.MTRIcons.inline('check', {color:'green', glow:false, size:14, style:'margin-top:1px'}) : ''}<span><strong>Sin volatilidad del MTR on-chain:</strong> el valor jugable es estable</span></div>
                                <div class="flex items-start gap-1.5">${window.MTRIcons ? window.MTRIcons.inline('check', {color:'green', glow:false, size:14, style:'margin-top:1px'}) : ''}<span><strong>Fee de Retiro:</strong> 5% (va al vault de liquidez)</span></div>
                            </div>
                        </div>

                        <div id="vaultBalanceDisplay" class="hidden p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 mb-4">
                            <div class="text-xs text-cyan-400">
                                <div class="font-bold mb-1 flex items-center gap-1.5">${window.MTRIcons ? window.MTRIcons.inline('wallet', {color:'cyan', glow:false, size:14, style:'margin:0'}) : ''}Vault de Liquidez:</div>
                                <div id="vaultBalanceLine">Balance disponible: <span id="vaultBalanceAmount" class="font-bold">-</span> USD (vault)</div>
                                <a id="vaultBaseScanLink" href="#" target="_blank" class="text-xs underline mt-1 inline-block">Ver en BaseScan</a>
                            </div>
                        </div>
                    </div>
                `;
            }
        },

        /**
         * Update available credits display
         */
        updateDisplay() {
            if (!window.CreditsSystem) return;

            const credits = window.CreditsSystem.currentCredits || 0;
            const usdcValue = window.CreditsSystem.currentUsdcValue || 0;

            const creditsEl = document.getElementById('availableCreditsDisplay');
            const usdcEl = document.getElementById('availableUsdcDisplay');

            if (creditsEl) {
                creditsEl.textContent = `${credits.toFixed(2)} créditos`;
            }

            if (usdcEl) {
                // NUEVO: Mostrar como igual (1:1 fijo)
                usdcEl.textContent = `= $${usdcValue.toFixed(2)} USD nominal`;
            }
        },

        /**
         * Process claim
         */
        async processClaim() {
            try {
                // 🔒 SEGURIDAD: Verificar autenticación o wallet vinculada antes de procesar claim
                let isAuthenticated = false;
                let hasLinkedWallet = false;
                
                // 1. Verificar sesión Supabase
                if (typeof supabaseClient !== 'undefined') {
                    try {
                        const { data: { session } } = await supabaseClient.auth.getSession();
                        isAuthenticated = !!session;
                    } catch (authError) {
                        console.error('[claim-ui] Error verificando autenticación:', authError);
                    }
                }
                
                // 2. Verificar wallet vinculada si no hay sesión (para navegadores internos)
                if (!isAuthenticated) {
                    const connectedAddress = window.connectedAddress || localStorage.getItem('mtr_wallet');
                    if (connectedAddress) {
                        try {
                            const backendUrl = window.CONFIG?.BACKEND_API || window.CreditsSystem?.backendUrl || 'https://musictoken-ring.onrender.com';
                            const walletResponse = await fetch(`${backendUrl}/api/user/wallet/${connectedAddress}`);
                            if (walletResponse.ok) {
                                const walletData = await walletResponse.json();
                                if (walletData.linked && walletData.userId) {
                                    hasLinkedWallet = true;
                                    console.log('[claim-ui] ✅ Wallet vinculada, procesando claim');
                                }
                            }
                        } catch (walletError) {
                            console.warn('[claim-ui] Error verificando wallet link:', walletError);
                        }
                    }
                }
                
                // 3. Bloquear si no hay autenticación ni wallet vinculada
                if (!isAuthenticated && !hasLinkedWallet) {
                    if (typeof showToast === 'function') {
                        showToast('Debes iniciar sesión o vincular tu wallet para reclamar créditos', 'error');
                    }
                    console.warn('[claim-ui] Intento de claim sin autenticación ni wallet vinculada bloqueado');
                    return;
                }

                const input = document.getElementById('claimCreditsAmount');
                const credits = parseFloat(input?.value || 0);
                const walletAddress = window.connectedAddress || localStorage.getItem('mtr_wallet');

                if (!walletAddress) {
                    if (typeof showToast === 'function') {
                        showToast('Conecta tu wallet primero', 'error');
                    }
                    return;
                }

                const minClaim = 5; // Mínimo para reclamar (mismo que apuesta mínima)
                if (!credits || credits < minClaim) {
                    if (typeof showToast === 'function') {
                        showToast(`Mínimo ${minClaim} créditos para reclamar`, 'error');
                    }
                    return;
                }

                if (!window.CreditsSystem) {
                    if (typeof showToast === 'function') {
                        showToast('Sistema de créditos no disponible', 'error');
                    }
                    return;
                }

                const result = await window.CreditsSystem.claimCredits(credits, walletAddress);

                if (result) {
                    this.showClaimStatus(`✅ ${result.usdcAmount} USD enviados a tu wallet. Tx: ${result.txHash.slice(0, 10)}...`, 'success');
                    input.value = '';
                    this.updateDisplay();
                }

            } catch (error) {
                console.error('[claim-ui] Error processing claim:', error);
                if (typeof showToast === 'function') {
                    showToast(`Error: ${error.message}`, 'error');
                }
            }
        },

        /**
         * Show claim status
         */
        showClaimStatus(message, type) {
            const statusEl = document.getElementById('claimStatus');
            const statusTextEl = document.getElementById('claimStatusText');

            if (statusEl && statusTextEl) {
                statusTextEl.textContent = message;
                statusEl.className = `p-4 rounded-lg border mb-4 ${type === 'success' ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`;
                statusTextEl.className = `text-sm ${type === 'success' ? 'text-green-400' : 'text-red-400'}`;
                statusEl.classList.remove('hidden');

                setTimeout(() => {
                    statusEl.classList.add('hidden');
                }, 10000);
            }
        },

        /**
         * Load vault balance
         */
        async loadVaultBalance() {
            try {
                const backendUrl = window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com';
                const response = await fetch(`${backendUrl}/api/vault/balance`);

                if (response.ok) {
                    const data = await response.json();
                    const balance = data.balance || 0;
                    const vaultAddress = data.vaultAddress;
                    const baseScanUrl = data.baseScanUrl;

                    const vaultDisplay = document.getElementById('vaultBalanceDisplay');
                    const vaultAmount = document.getElementById('vaultBalanceAmount');
                    const vaultLine = document.getElementById('vaultBalanceLine');
                    const vaultLink = document.getElementById('vaultBaseScanLink');

                    if (vaultDisplay && vaultAmount) {
                        // El número solo — un contador recién activado en $0 no
                        // necesita explicación especial, y menos sonar como
                        // "estamos en pruebas" en una plataforma en producción real.
                        if (vaultLine) {
                            vaultLine.innerHTML = 'Balance disponible: <span id="vaultBalanceAmount" class="font-bold">' + balance.toFixed(2) + '</span> USD (vault)';
                        }
                        vaultDisplay.classList.remove('hidden');

                        if (vaultLink && baseScanUrl) {
                            vaultLink.href = baseScanUrl;
                        } else if (vaultLink && vaultAddress) {
                            vaultLink.href = `https://basescan.org/address/${vaultAddress}`;
                        }
                    }
                }
            } catch (error) {
                console.error('[claim-ui] Error loading vault balance:', error);
            }
        }
    };

    // Export to window
    window.ClaimUI = ClaimUI;

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ClaimUI.init();
            
            // Update display periodically
            setInterval(() => ClaimUI.updateDisplay(), 5000);
        });
    } else {
        ClaimUI.init();
        setInterval(() => ClaimUI.updateDisplay(), 5000);
    }

    console.log('[claim-ui] Module loaded');
})();
