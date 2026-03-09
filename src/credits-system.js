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
            
            // Load initial balance
            await this.loadBalance(walletAddress);
            
            // Start periodic updates
            this.startPeriodicUpdates(walletAddress);
        },

        /**
         * Load user credits balance
         */
        async loadBalance(walletAddress) {
            try {
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
            
            // Update combined display FIRST (this contains the child elements)
            const combinedDisplay = document.getElementById('creditsCombinedDisplay');
            if (combinedDisplay) {
                // Actualizar el contenido completo del combined display
                combinedDisplay.innerHTML = `
                    <span id="creditsDisplay" class="text-cyan-400 font-bold">${this.currentCredits.toFixed(2)} créditos</span>
                    <span id="usdcValueDisplay" class="text-gray-400 text-sm">= $${this.currentUsdcValue.toFixed(2)} USDC</span>
                    <span class="text-xs text-green-400 ml-1" title="Créditos estables: 1 crédito = 1 USDC fijo">✓</span>
                `;
                
                // Asegurar que el elemento esté visible si hay créditos
                if (this.currentCredits > 0) {
                    combinedDisplay.classList.remove('hidden');
                    combinedDisplay.classList.add('sm:inline');
                }
                
                // Ahora actualizar los elementos individuales si existen (pueden estar en otros lugares)
                const creditsBadge = document.getElementById('creditsDisplay');
                if (creditsBadge && creditsBadge !== combinedDisplay.querySelector('#creditsDisplay')) {
                    creditsBadge.textContent = `${this.currentCredits.toFixed(2)} créditos`;
                }

                const usdcDisplay = document.getElementById('usdcValueDisplay');
                if (usdcDisplay && usdcDisplay !== combinedDisplay.querySelector('#usdcValueDisplay')) {
                    usdcDisplay.textContent = `= $${this.currentUsdcValue.toFixed(2)} USDC`;
                }
            } else {
                // Fallback: intentar actualizar elementos individuales si existen
                const creditsBadge = document.getElementById('creditsDisplay');
                if (creditsBadge) {
                    creditsBadge.textContent = `${this.currentCredits.toFixed(2)} créditos`;
                }

                const usdcDisplay = document.getElementById('usdcValueDisplay');
                if (usdcDisplay) {
                    usdcDisplay.textContent = `= $${this.currentUsdcValue.toFixed(2)} USDC`;
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

                // Find user ID
                const userId = await this.getUserId(walletAddress);
                if (!userId) {
                    throw new Error('Usuario no encontrado');
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
         */
        async getUserId(walletAddress) {
            try {
                // Try to get from Supabase client if available
                if (window.supabaseClient) {
                    const { data } = await window.supabaseClient
                        .from('users')
                        .select('id')
                        .eq('wallet_address', walletAddress.toLowerCase())
                        .single();
                    
                    return data?.id;
                }

                // Fallback: get from backend
                const response = await fetch(`${this.backendUrl}/api/user/credits/${walletAddress}`);
                if (response.ok) {
                    const data = await response.json();
                    return data.userId || null;
                }

                return null;
            } catch (error) {
                console.error('[credits-system] Error getting user ID:', error);
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
        }
    };

    // Export to window
    window.CreditsSystem = CreditsSystem;

    console.log('[credits-system] Module loaded');
})();
