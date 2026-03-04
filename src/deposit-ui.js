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
         */
        startDepositCheck() {
            const walletAddress = window.connectedAddress || localStorage.getItem('mtr_wallet');
            if (!walletAddress) return;

            // Check for deposits every 30 seconds
            setInterval(async () => {
                await this.checkRecentDeposits(walletAddress);
            }, 30000);

            // Initial check
            this.checkRecentDeposits(walletAddress);
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
