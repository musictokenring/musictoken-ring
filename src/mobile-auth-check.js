/**
 * Mobile Authentication Check
 * Verifica estado de autenticación y oculta/muestra botón "Iniciar Sesión" en móvil
 * Mejorado para navegadores internos de wallets
 */

(function() {
    'use strict';

    /**
     * Detectar si estamos en navegador interno de wallet
     */
    function isWalletBrowser() {
        if (typeof window.isWalletBrowser === 'function') {
            return window.isWalletBrowser();
        }
        var userAgent = navigator.userAgent.toLowerCase();
        return userAgent.includes('metamask') || 
               userAgent.includes('mmsb') ||
               userAgent.includes('trust') ||
               userAgent.includes('trustwallet') ||
               userAgent.includes('binance') ||
               userAgent.includes('coinbase') ||
               (window.ethereum && window.ethereum.isMetaMask && window.location.protocol === 'https:');
    }

    /**
     * Verificar autenticación y actualizar UI del botón "Iniciar Sesión"
     */
    async function checkAuthAndUpdateUI() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (!isMobile) return; // Solo en móvil

        const authButton = document.getElementById('authButton');
        const authButtonBtn = document.getElementById('authButtonBtn');
        if (!authButton) return;

        try {
            let isAuthenticated = false;
            let hasLinkedWallet = false;
            const inWalletBrowser = isWalletBrowser();
            const connectedAddress = window.connectedAddress;

            console.log('[mobile-auth] 🔍 Verificando autenticación...', {
                inWalletBrowser,
                connectedAddress: connectedAddress ? connectedAddress.slice(0, 10) + '...' : null
            });

            // 1. Verificar sesión Supabase
            if (typeof supabaseClient !== 'undefined') {
                try {
                    const { data: { session } } = await supabaseClient.auth.getSession();
                    if (session && session.user) {
                        isAuthenticated = true;
                        console.log('[mobile-auth] ✅ Usuario autenticado con Supabase');
                    }
                } catch (sessionError) {
                    console.warn('[mobile-auth] Error verificando sesión Supabase:', sessionError);
                }
            }

            // 2. Verificar wallet vinculada (CRÍTICO para navegadores internos)
            if (connectedAddress) {
                try {
                    const backendUrl = window.CreditsSystem?.backendUrl || 'https://musictoken-ring.onrender.com';
                    const walletResponse = await fetch(`${backendUrl}/api/user/wallet/${connectedAddress}`);
                    
                    if (walletResponse.ok) {
                        const walletData = await walletResponse.json();
                        if (walletData.linked && walletData.userId) {
                            hasLinkedWallet = true;
                            console.log('[mobile-auth] ✅ Wallet vinculada a usuario:', walletData.userId);
                            
                            // Si estamos en navegador interno y wallet está vinculada, cargar saldos
                            if (inWalletBrowser && window.CreditsSystem && typeof window.CreditsSystem.loadBalance === 'function') {
                                console.log('[mobile-auth] [WALLET-BROWSER] Cargando saldos usando wallet link...');
                                await window.CreditsSystem.loadBalance(connectedAddress);
                            }
                        } else {
                            console.log('[mobile-auth] ⚠️ Wallet NO vinculada:', walletData);
                        }
                    } else {
                        console.warn('[mobile-auth] Error en respuesta wallet link:', walletResponse.status);
                    }
                } catch (walletError) {
                    console.error('[mobile-auth] Error verificando wallet link:', walletError);
                }
            }

            // 3. Ocultar botón "Iniciar Sesión" si está autenticado o tiene wallet vinculada
            if (isAuthenticated || hasLinkedWallet) {
                authButton.style.display = 'none';
                console.log('[mobile-auth] 🔒 Botón "Iniciar Sesión" ocultado', {
                    isAuthenticated,
                    hasLinkedWallet,
                    inWalletBrowser
                });
            } else {
                // Solo mostrar en navegador externo, no en navegador interno sin wallet vinculada
                if (!inWalletBrowser) {
                    authButton.style.display = 'inline-flex';
                    console.log('[mobile-auth] 🔓 Botón "Iniciar Sesión" visible (navegador externo, no autenticado)');
                } else {
                    // En navegador interno sin wallet vinculada, ocultar también (mostrar solo transacciones)
                    authButton.style.display = 'none';
                    console.log('[mobile-auth] 🔒 Botón "Iniciar Sesión" ocultado (navegador interno, wallet no vinculada)');
                }
            }

        } catch (error) {
            console.error('[mobile-auth] Error verificando autenticación:', error);
            // En caso de error, mostrar el botón solo en navegador externo
            if (authButton && !isWalletBrowser()) {
                authButton.style.display = 'inline-flex';
            } else if (authButton) {
                authButton.style.display = 'none';
            }
        }
    }

    // Ejecutar al cargar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(checkAuthAndUpdateUI, 1000); // Esperar a que se carguen otros scripts
        });
    } else {
        setTimeout(checkAuthAndUpdateUI, 1000);
    }

    // Ejecutar periódicamente (cada 5 segundos) para detectar cambios
    setInterval(checkAuthAndUpdateUI, 5000);

    // Ejecutar cuando se conecta wallet
    if (window.addEventListener) {
        window.addEventListener('walletConnected', checkAuthAndUpdateUI);
        window.addEventListener('walletDisconnected', checkAuthAndUpdateUI);
    }

    // Exponer función globalmente
    window.checkAuthAndUpdateUI = checkAuthAndUpdateUI;

})();
