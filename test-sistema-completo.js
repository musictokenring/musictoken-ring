/**
 * Test Completo del Sistema - MusicToken Ring
 * Verifica que todos los componentes estén funcionando correctamente
 * 
 * Ejecutar en consola del navegador en: https://musictokenring.xyz
 */

(async function testSistemaCompleto() {
    console.log('🧪 ==========================================');
    console.log('🧪 TEST COMPLETO DEL SISTEMA');
    console.log('🧪 ==========================================\n');

    const resultados = {
        backend: {},
        frontend: {},
        configuracion: {},
        errores: []
    };

    // ==========================================
    // 1. TEST BACKEND - Health Check
    // ==========================================
    console.log('1️⃣ Probando Backend...');
    try {
        const backendUrl = window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com';
        const healthResponse = await fetch(`${backendUrl}/api/health`);
        
        if (healthResponse.ok) {
            const healthData = await healthResponse.json();
            resultados.backend.health = {
                estado: '✅ OK',
                servicios: healthData.services || {},
                timestamp: healthData.timestamp
            };
            console.log('   ✅ Backend respondiendo correctamente');
            console.log('   📊 Servicios:', healthData.services);
        } else {
            throw new Error(`HTTP ${healthResponse.status}`);
        }
    } catch (error) {
        resultados.backend.health = {
            estado: '❌ ERROR',
            error: error.message
        };
        resultados.errores.push(`Backend health: ${error.message}`);
        console.error('   ❌ Error conectando al backend:', error.message);
    }

    // ==========================================
    // 2. TEST VAULT BALANCE
    // ==========================================
    console.log('\n2️⃣ Probando Vault Balance...');
    try {
        const backendUrl = window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com';
        const vaultResponse = await fetch(`${backendUrl}/api/vault/balance`);
        
        if (vaultResponse.ok) {
            const vaultData = await vaultResponse.json();
            resultados.backend.vault = {
                estado: '✅ OK',
                balance: vaultData.balance || 0,
                balance_usdc: vaultData.balance_usdc || 0
            };
            console.log('   ✅ Vault balance cargado:', vaultData.balance_usdc || 0, 'USDC');
        } else {
            throw new Error(`HTTP ${vaultResponse.status}`);
        }
    } catch (error) {
        resultados.backend.vault = {
            estado: '❌ ERROR',
            error: error.message
        };
        resultados.errores.push(`Vault balance: ${error.message}`);
        console.error('   ❌ Error cargando vault balance:', error.message);
    }

    // ==========================================
    // 3. TEST CONFIGURACIÓN - Mínimo de Apuesta
    // ==========================================
    console.log('\n3️⃣ Verificando Configuración de Mínimo de Apuesta...');
    try {
        const minBet = typeof MIN_BET_AMOUNT !== 'undefined' ? MIN_BET_AMOUNT : 
                      (typeof GameEngine !== 'undefined' ? GameEngine.minBet : null);
        
        resultados.configuracion.minBet = {
            valor: minBet,
            esperado: 5,
            estado: minBet === 5 ? '✅ CORRECTO' : '⚠️ INCORRECTO'
        };
        
        if (minBet === 5) {
            console.log('   ✅ Mínimo de apuesta configurado correctamente: 5 créditos');
        } else {
            console.warn('   ⚠️ Mínimo de apuesta:', minBet, '(esperado: 5)');
        }

        // Verificar en UI
        const minBetEl = document.getElementById('minBet');
        if (minBetEl) {
            const uiMinBet = parseInt(minBetEl.textContent) || null;
            resultados.configuracion.minBetUI = {
                valor: uiMinBet,
                esperado: 5,
                estado: uiMinBet === 5 ? '✅ CORRECTO' : '⚠️ INCORRECTO'
            };
            console.log('   📱 UI muestra mínimo:', uiMinBet, 'créditos');
        }

        // Verificar input
        const betInput = document.getElementById('betAmount');
        if (betInput) {
            const inputMin = parseInt(betInput.getAttribute('min')) || null;
            resultados.configuracion.betInputMin = {
                valor: inputMin,
                esperado: 5,
                estado: inputMin === 5 ? '✅ CORRECTO' : '⚠️ INCORRECTO'
            };
            console.log('   📝 Input tiene min:', inputMin);
        }
    } catch (error) {
        resultados.configuracion.minBet = {
            estado: '❌ ERROR',
            error: error.message
        };
        resultados.errores.push(`Config minBet: ${error.message}`);
        console.error('   ❌ Error verificando configuración:', error.message);
    }

    // ==========================================
    // 4. TEST RAMP INTEGRATION
    // ==========================================
    console.log('\n4️⃣ Verificando Integración de Ramp Network...');
    try {
        if (typeof RampIntegration !== 'undefined') {
            resultados.frontend.ramp = {
                estado: '✅ DISPONIBLE',
                apiKey: RampIntegration.getApiKey ? 
                       (RampIntegration.getApiKey() === 'STAGING_API_KEY_AQUI' ? '⚠️ NO CONFIGURADO' : '✅ CONFIGURADO') :
                       '❓ DESCONOCIDO',
                funciones: {
                    showWidget: typeof RampIntegration.showWidget === 'function',
                    depositUsdcToPlatform: typeof RampIntegration.depositUsdcToPlatform === 'function',
                    buyWithPreset: typeof RampIntegration.buyWithPreset === 'function'
                }
            };
            console.log('   ✅ RampIntegration disponible');
            console.log('   🔑 API Key:', resultados.frontend.ramp.apiKey);
        } else {
            resultados.frontend.ramp = {
                estado: '❌ NO DISPONIBLE',
                error: 'RampIntegration no está definido'
            };
            resultados.errores.push('RampIntegration no disponible');
            console.error('   ❌ RampIntegration no está disponible');
        }
    } catch (error) {
        resultados.frontend.ramp = {
            estado: '❌ ERROR',
            error: error.message
        };
        resultados.errores.push(`Ramp: ${error.message}`);
    }

    // ==========================================
    // 5. TEST GAME ENGINE
    // ==========================================
    console.log('\n5️⃣ Verificando Game Engine...');
    try {
        if (typeof GameEngine !== 'undefined') {
            resultados.frontend.gameEngine = {
                estado: '✅ DISPONIBLE',
                inicializado: GameEngine.initialized || false,
                minBet: GameEngine.minBet || null,
                modos: {
                    quick: typeof GameEngine.joinQuickMatch === 'function',
                    social: typeof GameEngine.createSocialChallenge === 'function',
                    private: typeof GameEngine.createPrivateRoom === 'function',
                    practice: typeof GameEngine.startPracticeMatch === 'function'
                }
            };
            console.log('   ✅ GameEngine disponible');
            console.log('   🎮 Inicializado:', GameEngine.initialized);
            console.log('   💰 MinBet:', GameEngine.minBet);
        } else {
            resultados.frontend.gameEngine = {
                estado: '❌ NO DISPONIBLE'
            };
            resultados.errores.push('GameEngine no disponible');
            console.error('   ❌ GameEngine no está disponible');
        }
    } catch (error) {
        resultados.frontend.gameEngine = {
            estado: '❌ ERROR',
            error: error.message
        };
        resultados.errores.push(`GameEngine: ${error.message}`);
    }

    // ==========================================
    // 6. TEST CREDITS SYSTEM
    // ==========================================
    console.log('\n6️⃣ Verificando Sistema de Créditos...');
    try {
        if (typeof window.CreditsSystem !== 'undefined') {
            resultados.frontend.credits = {
                estado: '✅ DISPONIBLE',
                creditosActuales: window.CreditsSystem.currentCredits || 0,
                funciones: {
                    init: typeof window.CreditsSystem.init === 'function',
                    loadBalance: typeof window.CreditsSystem.loadBalance === 'function',
                    updateBetEligibility: typeof window.CreditsSystem.updateBetEligibility === 'function'
                }
            };
            console.log('   ✅ CreditsSystem disponible');
            console.log('   💳 Créditos actuales:', window.CreditsSystem.currentCredits || 0);
        } else {
            resultados.frontend.credits = {
                estado: '❌ NO DISPONIBLE'
            };
            resultados.errores.push('CreditsSystem no disponible');
            console.error('   ❌ CreditsSystem no está disponible');
        }
    } catch (error) {
        resultados.frontend.credits = {
            estado: '❌ ERROR',
            error: error.message
        };
        resultados.errores.push(`CreditsSystem: ${error.message}`);
    }

    // ==========================================
    // 7. TEST WALLET CONNECTION
    // ==========================================
    console.log('\n7️⃣ Verificando Conexión de Wallet...');
    try {
        const walletAddress = window.connectedAddress || localStorage.getItem('mtr_wallet');
        const onChainBalance = window.__mtrOnChainBalance || 0;
        
        resultados.frontend.wallet = {
            conectada: !!walletAddress,
            direccion: walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : null,
            balanceOnChain: onChainBalance,
            estado: walletAddress ? '✅ CONECTADA' : '⚠️ NO CONECTADA'
        };
        
        if (walletAddress) {
            console.log('   ✅ Wallet conectada:', resultados.frontend.wallet.direccion);
            console.log('   💰 Balance on-chain:', onChainBalance, 'MTR');
            
            // Probar obtener créditos del usuario
            try {
                const backendUrl = window.CONFIG?.BACKEND_API || 'https://musictoken-ring.onrender.com';
                const creditsResponse = await fetch(`${backendUrl}/api/user/credits/${walletAddress}`);
                if (creditsResponse.ok) {
                    const creditsData = await creditsResponse.json();
                    resultados.backend.userCredits = {
                        estado: '✅ OK',
                        creditos: creditsData.credits || 0,
                        usdcValue: creditsData.usdcValue || 0
                    };
                    console.log('   💳 Créditos del usuario:', creditsData.credits || 0);
                }
            } catch (error) {
                console.warn('   ⚠️ No se pudieron obtener créditos del backend:', error.message);
            }
        } else {
            console.log('   ⚠️ Wallet no conectada');
        }
    } catch (error) {
        resultados.frontend.wallet = {
            estado: '❌ ERROR',
            error: error.message
        };
        resultados.errores.push(`Wallet: ${error.message}`);
    }

    // ==========================================
    // 8. TEST UI ELEMENTS
    // ==========================================
    console.log('\n8️⃣ Verificando Elementos de UI...');
    try {
        const elementos = {
            betAmount: document.getElementById('betAmount'),
            minBet: document.getElementById('minBet'),
            appBalanceDisplay: document.getElementById('appBalanceDisplay'),
            depositSection: document.getElementById('depositSection'),
            rampSection: document.getElementById('rampOnRampSection'),
            claimSection: document.getElementById('claimSection')
        };

        resultados.frontend.ui = {};
        for (const [nombre, elemento] of Object.entries(elementos)) {
            resultados.frontend.ui[nombre] = {
                existe: !!elemento,
                estado: elemento ? '✅ PRESENTE' : '❌ AUSENTE'
            };
            if (elemento) {
                console.log(`   ✅ ${nombre}: presente`);
            } else {
                console.warn(`   ⚠️ ${nombre}: ausente`);
            }
        }
    } catch (error) {
        resultados.frontend.ui = {
            estado: '❌ ERROR',
            error: error.message
        };
        resultados.errores.push(`UI: ${error.message}`);
    }

    // ==========================================
    // 9. TEST BOTONES DE APUESTA RÁPIDA
    // ==========================================
    console.log('\n9️⃣ Verificando Botones de Apuesta Rápida...');
    try {
        const betButtons = document.querySelectorAll('#betAmountButtons button');
        const montosEsperados = [5, 50, 500, 5000];
        
        resultados.frontend.betButtons = {
            cantidad: betButtons.length,
            montos: []
        };

        betButtons.forEach((btn, index) => {
            const onclick = btn.getAttribute('onclick');
            const dataAmount = btn.getAttribute('data-amount');
            const monto = dataAmount ? parseInt(dataAmount) : null;
            
            resultados.frontend.betButtons.montos.push({
                monto: monto,
                esperado: montosEsperados[index] || null,
                estado: monto === montosEsperados[index] ? '✅ CORRECTO' : '⚠️ INCORRECTO'
            });
            
            if (monto === montosEsperados[index]) {
                console.log(`   ✅ Botón ${index + 1}: ${monto} créditos`);
            } else {
                console.warn(`   ⚠️ Botón ${index + 1}: ${monto} (esperado: ${montosEsperados[index]})`);
            }
        });
    } catch (error) {
        resultados.frontend.betButtons = {
            estado: '❌ ERROR',
            error: error.message
        };
        resultados.errores.push(`Bet buttons: ${error.message}`);
    }

    // ==========================================
    // RESUMEN FINAL
    // ==========================================
    console.log('\n📊 ==========================================');
    console.log('📊 RESUMEN DEL TEST');
    console.log('📊 ==========================================\n');

    console.log('✅ COMPONENTES FUNCIONANDO:');
    if (resultados.backend.health?.estado === '✅ OK') console.log('   ✅ Backend');
    if (resultados.backend.vault?.estado === '✅ OK') console.log('   ✅ Vault Balance');
    if (resultados.configuracion.minBet?.estado === '✅ CORRECTO') console.log('   ✅ Configuración MinBet');
    if (resultados.frontend.ramp?.estado === '✅ DISPONIBLE') console.log('   ✅ Ramp Integration');
    if (resultados.frontend.gameEngine?.estado === '✅ DISPONIBLE') console.log('   ✅ Game Engine');
    if (resultados.frontend.credits?.estado === '✅ DISPONIBLE') console.log('   ✅ Credits System');

    if (resultados.errores.length > 0) {
        console.log('\n❌ ERRORES ENCONTRADOS:');
        resultados.errores.forEach((error, index) => {
            console.log(`   ${index + 1}. ${error}`);
        });
    } else {
        console.log('\n🎉 ¡No se encontraron errores!');
    }

    console.log('\n📋 RESULTADOS COMPLETOS:');
    console.log(JSON.stringify(resultados, null, 2));

    // Retornar resultados para uso programático
    window.testResultados = resultados;
    return resultados;
})();
