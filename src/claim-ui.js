/**
 * Claim UI Component
 * Shows claim button and handles credit-to-USDC conversion
 */

(function() {
    'use strict';

    const ClaimUI = {
        /**
         * Initialize claim UI
         */
        init() {
            this.createClaimSection();
        },

        /**
         * Create claim section
         */
        createClaimSection() {
            // Find cashout section and replace with claim section
            const cashoutSection = document.querySelector('section:has(#cashoutAmount)');
            
            if (cashoutSection) {
                cashoutSection.innerHTML = `
                    <div class="max-w-2xl mx-auto p-6 sm:p-8 rounded-2xl border border-fuchsia-500/15 bg-gradient-to-br from-gray-900/80 to-purple-950/30 neon-border-magenta">
                        <h3 class="text-xl font-bold text-fuchsia-400 neon-text-magenta mb-2">💸 Reclamar Premios</h3>
                        <p class="text-gray-400 text-sm mb-6">Convierte tus créditos ganados a USDC. Los fondos se envían automáticamente a tu wallet.</p>
                        
                        <div class="mb-4 p-4 rounded-lg bg-black/40 border border-white/10">
                            <div class="text-sm text-gray-400 mb-2">Créditos disponibles:</div>
                            <div id="availableCreditsDisplay" class="text-2xl font-bold text-fuchsia-400">0 créditos</div>
                            <div id="availableUsdcDisplay" class="text-sm text-gray-400 mt-1">≈ $0 USDC</div>
                        </div>

                        <div class="flex flex-col sm:flex-row gap-3 mb-4">
                            <input id="claimCreditsAmount" type="number" min="100" placeholder="Mínimo 100 créditos"
                                   class="flex-1 px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/20 transition">
                            <button type="button" onclick="ClaimUI.processClaim()" 
                                    class="px-6 py-3 rounded-lg text-sm font-bold bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white hover:opacity-90 transition-all shadow-lg shadow-fuchsia-500/20 cursor-pointer whitespace-nowrap">
                                💸 Reclamar USDC
                            </button>
                        </div>

                        <div id="claimStatus" class="hidden p-4 rounded-lg bg-green-500/10 border border-green-500/20 mb-4">
                            <div class="text-sm text-green-400" id="claimStatusText"></div>
                        </div>

                        <div class="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                            <div class="text-xs text-green-400 space-y-1">
                                <div><strong>✓ Créditos Estables:</strong> 1 crédito = 1 USDC fijo</div>
                                <div><strong>✓ Sin Volatilidad:</strong> Siempre cobrás en USDC lo que ganaste</div>
                                <div><strong>✓ Fee de Retiro:</strong> 5% (va al vault de liquidez)</div>
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
                usdcEl.textContent = `≈ $${usdcValue.toFixed(2)} USDC`;
            }
        },

        /**
         * Process claim
         */
        async processClaim() {
            try {
                const input = document.getElementById('claimCreditsAmount');
                const credits = parseFloat(input?.value || 0);
                const walletAddress = window.connectedAddress || localStorage.getItem('mtr_wallet');

                if (!walletAddress) {
                    if (typeof showToast === 'function') {
                        showToast('Conecta tu wallet primero', 'error');
                    }
                    return;
                }

                if (!credits || credits < 100) {
                    if (typeof showToast === 'function') {
                        showToast('Mínimo 100 créditos para reclamar', 'error');
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
                    this.showClaimStatus(`✅ ${result.usdcAmount} USDC enviados! Tx: ${result.txHash.slice(0, 10)}...`, 'success');
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
