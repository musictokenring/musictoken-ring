/**
 * Wallet-Credits Integration
 * Automatically syncs wallet connection with credits system
 * Shows credits balance and USDC equivalent
 */

(function() {
    'use strict';

    // Wait for wallet connection
    function initCreditsOnWalletConnect() {
        // Monitor wallet connection
        const checkWallet = setInterval(() => {
            const walletAddress = window.connectedAddress || localStorage.getItem('mtr_wallet');
            
            if (walletAddress && window.CreditsSystem) {
                clearInterval(checkWallet);
                console.log('[wallet-credits] Wallet connected, initializing credits system');
                window.CreditsSystem.init(walletAddress);
            }
        }, 1000);

        // Stop checking after 30 seconds
        setTimeout(() => clearInterval(checkWallet), 30000);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCreditsOnWalletConnect);
    } else {
        initCreditsOnWalletConnect();
    }

    // Also listen for wallet connection events
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts && accounts.length > 0 && window.CreditsSystem) {
                window.CreditsSystem.init(accounts[0]);
            }
        });
    }

    console.log('[wallet-credits] Integration module loaded');
})();
