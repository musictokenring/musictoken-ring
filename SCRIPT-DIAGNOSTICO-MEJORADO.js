// ============================================
// SCRIPT DE DIAGNÓSTICO COMPLETO
// Ejecuta esto en la consola del navegador
// ============================================

(function() {
    console.log('========================================');
    console.log('🔍 DIAGNÓSTICO COMPLETO DEL SISTEMA');
    console.log('========================================\n');
    
    // 1. VERIFICAR FUNCIONES CRÍTICAS
    console.log('📋 1. VERIFICACIÓN DE FUNCIONES:');
    console.log('   selectSongForBattle:', typeof window.selectSongForBattle);
    console.log('   createSocialChallenge:', typeof createSocialChallenge);
    console.log('   window.createSocialChallenge:', typeof window.createSocialChallenge);
    console.log('   stopAllPreviews:', typeof stopAllPreviews);
    console.log('   window.stopAllPreviews:', typeof window.stopAllPreviews);
    console.log('   GameEngine:', typeof GameEngine);
    console.log('   updateBetEligibility:', typeof updateBetEligibility);
    console.log('');
    
    // 2. VERIFICAR BOTÓN CREATE SOCIAL CHALLENGE
    console.log('📋 2. ESTADO DEL BOTÓN "Crear Desafío":');
    var btn = document.getElementById('createSocialBtn');
    if (btn) {
        console.log('   ✅ Botón existe');
        console.log('   Title:', btn.title || '(vacío)');
        console.log('   Disabled:', btn.disabled);
        console.log('   Classes:', btn.className);
        console.log('   Text:', btn.textContent || btn.innerText);
        
        // Verificar listeners
        var hasOnclick = !!btn.onclick;
        console.log('   Tiene onclick:', hasOnclick);
        
        // Intentar contar listeners (no siempre posible)
        try {
            var listeners = getEventListeners ? getEventListeners(btn) : null;
            if (listeners) {
                console.log('   Listeners detectados:', Object.keys(listeners).length);
            }
        } catch(e) {
            console.log('   Listeners: No se pueden detectar (normal)');
        }
    } else {
        console.log('   ❌ Botón NO existe en el DOM');
    }
    console.log('');
    
    // 3. VERIFICAR CANCIÓN SELECCIONADA
    console.log('📋 3. ESTADO DE CANCIÓN SELECCIONADA:');
    console.log('   selectedSong:', typeof selectedSong !== 'undefined' ? (selectedSong ? selectedSong.name : 'null') : 'undefined');
    console.log('   window.selectedSong:', typeof window.selectedSong !== 'undefined' ? (window.selectedSong ? window.selectedSong.name : 'null') : 'undefined');
    var card = document.getElementById('selectedSongCard');
    if (card) {
        console.log('   ✅ Card existe');
        console.log('   Card HTML:', card.innerHTML.substring(0, 100) + '...');
        var banner = card.querySelector('[class*="green"], [id="selectedSongBanner"]');
        console.log('   Banner verde existe:', !!banner);
    } else {
        console.log('   ❌ Card NO existe');
    }
    console.log('');
    
    // 4. VERIFICAR MODO ACTUAL
    console.log('📋 4. MODO ACTUAL:');
    console.log('   window.currentMode:', window.currentMode);
    console.log('   currentMode (local):', typeof currentMode !== 'undefined' ? currentMode : 'undefined');
    console.log('');
    
    // 5. VERIFICAR CRÉDITOS Y BALANCE
    console.log('📋 5. CRÉDITOS Y BALANCE:');
    console.log('   CreditsSystem:', typeof window.CreditsSystem !== 'undefined' ? 'existe' : 'no existe');
    if (window.CreditsSystem) {
        console.log('   currentCredits:', window.CreditsSystem.currentCredits);
    }
    console.log('   betAmount value:', document.getElementById('betAmount')?.value || 'N/A');
    console.log('');
    
    // 6. CAPTURAR ERRORES RECIENTES
    console.log('📋 6. ERRORES EN LA CONSOLA:');
    console.log('   ⚠️ Por favor, expande los 2 errores en rojo y copia:');
    console.log('   1. El mensaje completo del error');
    console.log('   2. La línea de código donde ocurre');
    console.log('   3. El stack trace completo');
    console.log('');
    
    // 7. VERIFICAR ELEMENTOS CRÍTICOS DEL DOM
    console.log('📋 7. ELEMENTOS CRÍTICOS DEL DOM:');
    console.log('   actionButtons:', !!document.getElementById('actionButtons'));
    console.log('   betAmount input:', !!document.getElementById('betAmount'));
    console.log('   selectedSongCard:', !!document.getElementById('selectedSongCard'));
    console.log('   createSocialBtn:', !!document.getElementById('createSocialBtn'));
    console.log('');
    
    // 8. VERIFICAR AUDIOS ACTIVOS
    console.log('📋 8. AUDIOS ACTIVOS:');
    var audios = document.querySelectorAll('audio');
    console.log('   Total audios:', audios.length);
    var playing = 0;
    audios.forEach(function(audio) {
        if (!audio.paused) playing++;
    });
    console.log('   Audios reproduciéndose:', playing);
    console.log('');
    
    // 9. SUGERENCIA DE ACCIÓN
    console.log('========================================');
    console.log('✅ DIAGNÓSTICO COMPLETADO');
    console.log('========================================');
    console.log('');
    console.log('📝 PRÓXIMOS PASOS:');
    console.log('   1. Expande los 2 errores en rojo');
    console.log('   2. Copia el mensaje completo de cada error');
    console.log('   3. Comparte esa información');
    console.log('');
    console.log('💡 Si alguna función muestra "undefined",');
    console.log('   eso indica que no está cargada correctamente.');
    console.log('');
    
    // Retornar resumen para fácil acceso
    return {
        selectSongForBattle: typeof window.selectSongForBattle,
        createSocialChallenge: typeof createSocialChallenge,
        windowCreateSocialChallenge: typeof window.createSocialChallenge,
        stopAllPreviews: typeof stopAllPreviews,
        GameEngine: typeof GameEngine,
        buttonExists: !!btn,
        buttonDisabled: btn ? btn.disabled : null,
        buttonTitle: btn ? btn.title : null,
        selectedSong: typeof selectedSong !== 'undefined' ? !!selectedSong : null,
        currentMode: window.currentMode
    };
})();
