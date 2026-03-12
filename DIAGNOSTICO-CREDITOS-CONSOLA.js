// ==========================================
// SCRIPT DE DIAGNÓSTICO DE CRÉDITOS
// Pegar este código en la consola del navegador para diagnosticar problemas
// ==========================================

(function() {
    console.log('========================================');
    console.log('🔍 DIAGNÓSTICO DE CRÉDITOS');
    console.log('========================================');
    
    // 1. Verificar CreditsSystem
    console.log('\n1. CREDITSSYSTEM:');
    if (window.CreditsSystem) {
        console.log('  ✅ CreditsSystem disponible');
        console.log('  - currentCredits:', window.CreditsSystem.currentCredits);
        console.log('  - currentUsdcValue:', window.CreditsSystem.currentUsdcValue);
        console.log('  - currentUserId:', window.CreditsSystem.currentUserId);
        console.log('  - backendUrl:', window.CreditsSystem.backendUrl);
    } else {
        console.log('  ❌ CreditsSystem NO disponible');
    }
    
    // 2. Verificar GameEngine
    console.log('\n2. GAMEENGINE:');
    if (window.GameEngine) {
        console.log('  ✅ GameEngine disponible');
        console.log('  - userBalance:', window.GameEngine.userBalance);
        console.log('  - currentUserId:', window.GameEngine.currentUserId);
    } else {
        console.log('  ❌ GameEngine NO disponible');
    }
    
    // 3. Verificar elementos del DOM
    console.log('\n3. ELEMENTOS DEL DOM:');
    const userBalanceEl = document.getElementById('userBalance');
    const appBalanceDisplayEl = document.getElementById('appBalanceDisplay');
    const creditsDisplayEl = document.getElementById('creditsDisplay');
    const creditsCombinedDisplayEl = document.getElementById('creditsCombinedDisplay');
    
    console.log('  - userBalance:', userBalanceEl ? userBalanceEl.textContent : 'NO encontrado');
    console.log('  - appBalanceDisplay:', appBalanceDisplayEl ? appBalanceDisplayEl.textContent : 'NO encontrado');
    console.log('  - creditsDisplay:', creditsDisplayEl ? creditsDisplayEl.textContent : 'NO encontrado');
    console.log('  - creditsCombinedDisplay:', creditsCombinedDisplayEl ? creditsCombinedDisplayEl.innerHTML.substring(0, 100) : 'NO encontrado');
    
    // 4. Verificar wallet conectada
    console.log('\n4. WALLET:');
    const connectedWallet = window.connectedAddress || localStorage.getItem('mtr_wallet') || window.__mtrConnectedWallet;
    console.log('  - connectedAddress:', window.connectedAddress);
    console.log('  - localStorage mtr_wallet:', localStorage.getItem('mtr_wallet'));
    console.log('  - __mtrConnectedWallet:', window.__mtrConnectedWallet);
    console.log('  - Wallet final:', connectedWallet);
    
    // 5. Verificar balance on-chain
    console.log('\n5. BALANCE ON-CHAIN:');
    console.log('  - __mtrOnChainBalance:', window.__mtrOnChainBalance);
    
    // 6. Verificar sesión Supabase
    console.log('\n6. SESIÓN SUPABASE:');
    if (window.supabaseClient) {
        window.supabaseClient.auth.getSession().then(({ data: { session }, error }) => {
            if (session) {
                console.log('  ✅ Sesión activa:', session.user.email);
                console.log('  - User ID:', session.user.id);
            } else {
                console.log('  ⚠️ No hay sesión activa');
            }
            if (error) {
                console.log('  ❌ Error:', error);
            }
        });
    } else {
        console.log('  ❌ supabaseClient NO disponible');
    }
    
    // 7. Intentar recargar créditos
    console.log('\n7. RECARGAR CRÉDITOS:');
    if (connectedWallet && window.CreditsSystem && typeof window.CreditsSystem.loadBalance === 'function') {
        console.log('  🔄 Recargando créditos para wallet:', connectedWallet);
        window.CreditsSystem.loadBalance(connectedWallet).then(() => {
            console.log('  ✅ Créditos recargados');
            console.log('  - Nuevo currentCredits:', window.CreditsSystem.currentCredits);
            console.log('  - Nuevo currentUsdcValue:', window.CreditsSystem.currentUsdcValue);
            
            // Actualizar display
            if (typeof window.CreditsSystem.updateCreditsDisplay === 'function') {
                window.CreditsSystem.updateCreditsDisplay();
                console.log('  ✅ Display actualizado');
            }
            
            if (typeof window.GameEngine !== 'undefined' && typeof window.GameEngine.updateBalanceDisplay === 'function') {
                window.GameEngine.updateBalanceDisplay();
                console.log('  ✅ GameEngine display actualizado');
            }
        }).catch(err => {
            console.error('  ❌ Error al recargar:', err);
        });
    } else {
        console.log('  ⚠️ No se puede recargar - faltan requisitos');
    }
    
    console.log('\n========================================');
    console.log('✅ DIAGNÓSTICO COMPLETADO');
    console.log('========================================');
})();
