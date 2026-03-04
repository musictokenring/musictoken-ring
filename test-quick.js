/**
 * Script de Pruebas Rápido
 * Ejecuta este script en la consola del navegador (F12) para probar todas las funciones
 * 
 * Cómo usar:
 * 1. Abre https://www.musictokenring.xyz
 * 2. Presiona F12 para abrir la consola
 * 3. Copia y pega todo este código
 * 4. Presiona Enter
 */

(async function testAllFunctions() {
    console.log('🧪 Iniciando pruebas de MusicToken Ring...\n');
    
    const backendUrl = window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com';
    const walletAddress = window.connectedAddress || localStorage.getItem('mtr_wallet');
    
    const results = {
        passed: [],
        failed: [],
        warnings: []
    };
    
    // Función helper para pruebas
    async function test(name, testFn) {
        try {
            console.log(`\n📋 Probando: ${name}...`);
            const result = await testFn();
            if (result === true || (result && result.success !== false)) {
                console.log(`✅ ${name}: PASÓ`);
                results.passed.push(name);
                return true;
            } else {
                console.log(`⚠️ ${name}: ADVERTENCIA - ${result.message || 'Resultado inesperado'}`);
                results.warnings.push(name);
                return false;
            }
        } catch (error) {
            console.error(`❌ ${name}: FALLÓ - ${error.message}`);
            results.failed.push(name);
            return false;
        }
    }
    
    // 1. Test: Backend Health Check
    await test('Backend Health Check', async () => {
        const response = await fetch(`${backendUrl}/api/health`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.status === 'ok' && data.services;
    });
    
    // 2. Test: Vault Balance
    await test('Vault Balance', async () => {
        const response = await fetch(`${backendUrl}/api/vault/balance`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return typeof data.balance === 'number';
    });
    
    // 3. Test: User Credits (si hay wallet conectada)
    if (walletAddress) {
        await test('User Credits', async () => {
            const response = await fetch(`${backendUrl}/api/user/credits/${walletAddress}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return typeof data.credits === 'number';
        });
    } else {
        console.log('\n⚠️ Wallet no conectada - saltando prueba de créditos');
        results.warnings.push('User Credits (wallet no conectada)');
    }
    
    // 4. Test: CORS funciona
    await test('CORS Configuration', async () => {
        const response = await fetch(`${backendUrl}/api/health`, {
            method: 'GET',
            headers: { 'Origin': window.location.origin }
        });
        return response.ok;
    });
    
    // 5. Test: Frontend Config
    await test('Frontend Config', () => {
        return window.CONFIG && window.CONFIG.BACKEND_API === backendUrl;
    });
    
    // 6. Test: Wallet Connection (si está disponible)
    if (typeof window.ethereum !== 'undefined') {
        await test('MetaMask Disponible', () => {
            return window.ethereum.isMetaMask === true;
        });
    } else {
        console.log('\n⚠️ MetaMask no detectado');
        results.warnings.push('MetaMask (no instalado)');
    }
    
    // 7. Test: Vault Display en UI
    await test('Vault Display en UI', () => {
        const vaultBalanceEl = document.getElementById('publicVaultBalance');
        return vaultBalanceEl !== null;
    });
    
    // 8. Test: Credits System disponible
    await test('Credits System', () => {
        return typeof window.CreditsSystem !== 'undefined';
    });
    
    // Resumen final
    console.log('\n\n' + '='.repeat(50));
    console.log('📊 RESUMEN DE PRUEBAS');
    console.log('='.repeat(50));
    console.log(`✅ Pasaron: ${results.passed.length}`);
    console.log(`❌ Fallaron: ${results.failed.length}`);
    console.log(`⚠️ Advertencias: ${results.warnings.length}`);
    
    if (results.passed.length > 0) {
        console.log('\n✅ Pruebas que pasaron:');
        results.passed.forEach(p => console.log(`   - ${p}`));
    }
    
    if (results.failed.length > 0) {
        console.log('\n❌ Pruebas que fallaron:');
        results.failed.forEach(f => console.log(`   - ${f}`));
    }
    
    if (results.warnings.length > 0) {
        console.log('\n⚠️ Advertencias:');
        results.warnings.forEach(w => console.log(`   - ${w}`));
    }
    
    console.log('\n' + '='.repeat(50));
    
    if (results.failed.length === 0) {
        console.log('🎉 ¡Todas las pruebas críticas pasaron!');
    } else {
        console.log('⚠️ Algunas pruebas fallaron. Revisa los errores arriba.');
    }
    
    return results;
})();
