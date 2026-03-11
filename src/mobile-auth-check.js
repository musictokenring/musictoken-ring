/**
 * Mobile Authentication Check
 * Verifica estado de autenticación y oculta/muestra botón "Iniciar Sesión" en móvil
 */

(function() {
    'use strict';

    /**
     * Verificar autenticación y actualizar UI del botón "Iniciar Sesión"
     */
    async function checkAuthAndUpdateUI() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (!isMobile) return; // Solo en móvil

        const authButton = document.getElementById('authButton');
        const authButtonBtn = document.getElementById('authButtonBtn');
        if (!authButton || !authButtonBtn) return;

        try {
            let isAuthenticated = false;
            let hasLinkedWallet = false;

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

            // 2. Verificar wallet vinculada (si hay wallet conectada)
            const connectedAddress = window.connectedAddress;
            if (connectedAddress && window.CreditsSystem) {
                try {
                    const walletResponse = await fetch(`${window.CreditsSystem.backendUrl}/api/user/wallet/${connectedAddress}`);
                    if (walletResponse.ok) {
                        const walletData = await walletResponse.json();
                        if (walletData.linked && walletData.userId) {
                            hasLinkedWallet = true;
                            console.log('[mobile-auth] ✅ Wallet vinculada a usuario');
                        }
                    }
                } catch (walletError) {
                    console.warn('[mobile-auth] Error verificando wallet link:', walletError);
                }
            }

            // 3. Ocultar botón "Iniciar Sesión" si está autenticado o tiene wallet vinculada
            if (isAuthenticated || hasLinkedWallet) {
                authButton.style.display = 'none';
                console.log('[mobile-auth] 🔒 Botón "Iniciar Sesión" ocultado (usuario autenticado o wallet vinculada)');
            } else {
                authButton.style.display = 'inline-flex';
                console.log('[mobile-auth] 🔓 Botón "Iniciar Sesión" visible (usuario no autenticado)');
            }

        } catch (error) {
            console.error('[mobile-auth] Error verificando autenticación:', error);
            // En caso de error, mostrar el botón por seguridad
            if (authButton) authButton.style.display = 'inline-flex';
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
