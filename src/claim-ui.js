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

            this.loadHistory();
            setInterval(() => this.loadHistory(), 30000);
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
                        <p class="text-gray-400 text-sm mb-6">Elegí cómo retirar tus créditos: en <strong class="text-gray-300">cripto</strong> (USDC o USDT, desde cualquier país) o en <strong class="text-gray-300">pesos colombianos</strong> por Mercado Pago.</p>

                        <div id="claimAuthWarning" class="hidden p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
                            <div class="text-sm text-yellow-400 flex items-center gap-2">
                                ${window.MTRIcons ? window.MTRIcons.inline('warning', {color:'yellow', glow:false, style:'margin:0'}) : ''}Debes iniciar sesión para reclamar créditos. <a href="#" onclick="event.preventDefault(); if (typeof window.openAuthModal === 'function') window.openAuthModal();" class="underline">Iniciar sesión</a>
                            </div>
                        </div>

                        <div class="mb-4 p-4 rounded-lg bg-black/40 border border-white/10">
                            <div class="text-sm text-gray-400 mb-2">Créditos disponibles:</div>
                            <div id="availableCreditsDisplay" class="text-2xl font-bold text-fuchsia-400">0 créditos</div>
                            <div id="availableUsdcDisplay" class="text-sm text-gray-400 mt-1">≈ $0 USD nominal</div>
                        </div>

                        <!-- Opción 1: cripto a una dirección pegada (sin conectar wallet).
                             Backend: /api/withdrawals/crypto/request -- reserva
                             atómica del saldo; primera vez a una dirección o
                             montos altos los confirma el operador. -->
                        <div class="mb-4 p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5">
                            <p class="text-xs font-bold uppercase tracking-wide text-cyan-300 mb-3 flex items-center gap-1.5">${window.MTRIcons ? window.MTRIcons.inline('coin', {color:'cyan', glow:false, style:'margin:0'}) : ''}Retirar en cripto · USDC o USDT</p>
                            <label class="block text-[11px] font-semibold text-gray-400 mb-1" for="cwNetwork">Red</label>
                            <select id="cwNetwork" onchange="ClaimUI.updateQuote()" class="w-full mb-3 px-3 py-3 rounded-lg bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-cyan-500/50">
                                <option value="base_usdc">USDC en Base (recomendado, comisión de red mínima)</option>
                                <option value="tron_usdt">USDT en TRON (TRC-20)</option>
                            </select>
                            <label class="block text-[11px] font-semibold text-gray-400 mb-1" for="cwAddress">Dirección de destino</label>
                            <input id="cwAddress" type="text" autocomplete="off" spellcheck="false" oninput="ClaimUI.updateQuote()" placeholder="0x… (Base)"
                                   class="w-full mb-3 px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 text-sm font-mono focus:outline-none focus:border-cyan-500/50">
                            <label class="block text-[11px] font-semibold text-gray-400 mb-1" for="claimCreditsAmount">Créditos a retirar</label>
                            <div class="flex flex-col sm:flex-row gap-3">
                                <input id="claimCreditsAmount" type="number" min="5" step="0.01" inputmode="decimal" oninput="ClaimUI.updateQuote()" placeholder="Mínimo 5"
                                       class="flex-1 px-4 py-3 rounded-lg bg-black/40 border border-white/10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition">
                                <button type="button" id="cwSubmitBtn" onclick="ClaimUI.processClaim()"
                                        class="px-6 py-3 rounded-lg text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:opacity-90 transition-all shadow-lg shadow-cyan-500/30 cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5">
                                    ${window.MTRIcons ? window.MTRIcons.svg('send', {size:16}) : ''} Retirar
                                </button>
                            </div>
                            <p id="cwQuote" class="text-xs text-gray-400 mt-2"></p>
                            <p class="text-[11px] text-gray-500 mt-2">No hace falta conectar ninguna wallet: pegá la dirección de tu wallet o de tu cuenta en un exchange (Binance, etc.) <strong class="text-gray-400">en la misma red que elegiste</strong>. La primera vez a una dirección nueva la confirma nuestro equipo antes de enviar.</p>
                            <div id="cwHistory" class="mt-3"></div>
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

        backendUrl() {
            return window.CONFIG?.BACKEND_API || window.CreditsSystem?.backendUrl || 'https://musictoken-ring.onrender.com';
        },

        async sessionToken() {
            try {
                const client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
                const { data: { session } } = await client.auth.getSession();
                return session?.access_token || null;
            } catch (e) {
                return null;
            }
        },

        addressLooksValid(network, address) {
            return network === 'tron_usdt'
                ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)
                : /^0x[a-fA-F0-9]{40}$/.test(address);
        },

        netAmount(amount) {
            const fee = Math.floor(amount * 0.05 * 100) / 100;
            return { fee, net: Math.floor((amount - fee) * 100) / 100 };
        },

        /** Valida en vivo red/dirección/monto y muestra cuánto llega neto. */
        updateQuote() {
            const network = document.getElementById('cwNetwork')?.value || 'base_usdc';
            const addrEl = document.getElementById('cwAddress');
            const quoteEl = document.getElementById('cwQuote');
            if (addrEl) addrEl.placeholder = network === 'tron_usdt' ? 'T… (TRON)' : '0x… (Base)';
            if (!quoteEl) return;
            const address = (addrEl?.value || '').trim();
            const amount = parseFloat(document.getElementById('claimCreditsAmount')?.value || 0);
            if (address && !this.addressLooksValid(network, address)) {
                quoteEl.innerHTML = '<span class="text-red-400">' + (network === 'tron_usdt'
                    ? 'Esa dirección no es de TRON (empieza con T y tiene 34 caracteres).'
                    : 'Esa dirección no es de Base (empieza con 0x y tiene 42 caracteres).') + '</span>';
                return;
            }
            if (!(amount > 0)) { quoteEl.textContent = ''; return; }
            const { fee, net } = this.netAmount(amount);
            const coin = network === 'tron_usdt' ? 'USDT' : 'USDC';
            quoteEl.innerHTML = amount < 5
                ? '<span class="text-yellow-400">El mínimo es 5 créditos.</span>'
                : 'Recibís <strong class="text-white">' + net.toFixed(2) + ' ' + coin + '</strong> (comisión 5%: ' + fee.toFixed(2) + ')';
        },

        /**
         * Retiro cripto: sesión obligatoria, dirección pegada (sin conectar
         * wallet) y confirmación explícita. El backend reserva el saldo de
         * forma atómica (/api/withdrawals/crypto/request).
         */
        async processClaim() {
            const btn = document.getElementById('cwSubmitBtn');
            try {
                const token = await this.sessionToken();
                if (!token) {
                    if (typeof showToast === 'function') showToast('Iniciá sesión para retirar', 'error');
                    if (typeof window.openAuthModal === 'function') window.openAuthModal();
                    return;
                }
                const network = document.getElementById('cwNetwork')?.value || 'base_usdc';
                const address = (document.getElementById('cwAddress')?.value || '').trim();
                const amount = parseFloat(document.getElementById('claimCreditsAmount')?.value || 0);
                if (!this.addressLooksValid(network, address)) {
                    this.updateQuote();
                    if (typeof showToast === 'function') showToast('Revisá la dirección de destino', 'error');
                    return;
                }
                if (!(amount >= 5)) {
                    if (typeof showToast === 'function') showToast('El mínimo de retiro es 5 créditos', 'error');
                    return;
                }

                const { net } = this.netAmount(amount);
                const coin = network === 'tron_usdt' ? 'USDT (red TRON)' : 'USDC (red Base)';
                const ok = window.confirm(
                    'Confirmá tu retiro\n\n' +
                    'Recibís: ' + net.toFixed(2) + ' ' + coin + '\n' +
                    'A: ' + address + '\n\n' +
                    'Revisá que la dirección sea de esa red: un envío a una red equivocada no se puede recuperar.'
                );
                if (!ok) return;

                if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
                const resp = await fetch(this.backendUrl() + '/api/withdrawals/crypto/request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ amount, network, address })
                });
                const data = await resp.json().catch(() => ({}));
                if (!resp.ok || !data.ok) throw new Error(data.error || ('HTTP ' + resp.status));

                const r = data.request || {};
                const msg = r.status === 'paid'
                    ? 'Retiro enviado: ' + Number(r.payout_amount).toFixed(2) + ' ' + (network === 'tron_usdt' ? 'USDT' : 'USDC') + '.'
                    : 'Retiro recibido. Lo revisamos y lo enviamos a la brevedad; el saldo ya quedó reservado.';
                this.showClaimStatus(msg, 'success');
                if (typeof showToast === 'function') showToast(msg, 'success');
                document.getElementById('claimCreditsAmount').value = '';
                this.updateQuote();
                if (window.CreditsSystem && typeof window.CreditsSystem.loadBalance === 'function') {
                    Promise.resolve(window.CreditsSystem.loadBalance(null)).catch(() => {});
                }
                this.loadHistory();
            } catch (error) {
                console.error('[claim-ui] Error en retiro cripto:', error);
                this.showClaimStatus('No se pudo crear el retiro: ' + error.message, 'error');
                if (typeof showToast === 'function') showToast('Error: ' + error.message, 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.style.opacity = ''; }
            }
        },

        /** Últimos retiros cripto del usuario, con su estado y la transacción. */
        async loadHistory() {
            const box = document.getElementById('cwHistory');
            if (!box) return;
            const token = await this.sessionToken();
            if (!token) { box.innerHTML = ''; return; }
            try {
                const resp = await fetch(this.backendUrl() + '/api/withdrawals/crypto/mine', { headers: { 'Authorization': 'Bearer ' + token } });
                const data = await resp.json().catch(() => ({}));
                const rows = (data && data.requests) || [];
                if (!rows.length) { box.innerHTML = ''; return; }
                const label = {
                    pending_review: ['En revisión', 'text-yellow-300'],
                    processing: ['Enviando', 'text-cyan-300'],
                    paid: ['Pagado', 'text-green-400'],
                    failed: ['Falló · saldo devuelto', 'text-red-400'],
                    rejected: ['Rechazado · saldo devuelto', 'text-red-400']
                };
                const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
                box.innerHTML = '<p class="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">Tus retiros cripto</p>' + rows.slice(0, 5).map((r) => {
                    const st = label[r.status] || [esc(r.status), 'text-gray-400'];
                    const coin = r.network === 'tron_usdt' ? 'USDT' : 'USDC';
                    const link = r.tx_hash
                        ? ' · <a class="underline text-cyan-400" target="_blank" rel="noopener" href="' + (r.network === 'tron_usdt' ? 'https://tronscan.org/#/transaction/' : 'https://basescan.org/tx/') + encodeURIComponent(r.tx_hash) + '">ver tx</a>'
                        : '';
                    const addr = esc(r.address);
                    return '<div class="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-white/5">' +
                        '<span class="text-gray-300">' + Number(r.payout_amount).toFixed(2) + ' ' + coin + ' <span class="text-gray-500 font-mono">' + addr.slice(0, 6) + '…' + addr.slice(-4) + '</span></span>' +
                        '<span class="' + st[1] + ' whitespace-nowrap">' + st[0] + link + '</span></div>';
                }).join('');
            } catch (e) {
                box.innerHTML = '';
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
