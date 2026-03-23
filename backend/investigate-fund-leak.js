/**
 * Script de Investigación: Fuga de Fondos del Vault
 * 
 * Este script ejecuta queries SQL para identificar:
 * 1. Claims con wallet incorrecta
 * 2. Transacciones del vault a direcciones desconocidas
 * 3. Alertas de seguridad
 * 4. Claims grandes recientes
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY no está configurada');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Colores para la consola
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function logSection(title) {
    console.log(`\n${colors.cyan}${'='.repeat(80)}${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
}

function logResult(data, title) {
    if (!data || data.length === 0) {
        console.log(`${colors.green}✅ ${title}: No se encontraron resultados${colors.reset}`);
        return;
    }
    
    console.log(`${colors.yellow}⚠️  ${title}: ${data.length} resultado(s) encontrado(s)${colors.reset}\n`);
    console.log(JSON.stringify(data, null, 2));
}

async function investigateFundLeak() {
    console.log(`${colors.bright}${colors.magenta}`);
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    🔍 INVESTIGACIÓN DE FUGA DE FONDOS 🔍                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log(`${colors.reset}`);

    try {
        // QUERY 1: Claims con wallet incorrecta
        logSection('QUERY 1: Claims con Wallet Incorrecta');
        const { data: claimsMismatch, error: error1 } = await supabase
            .from('claims')
            .select(`
                id,
                user_id,
                recipient_wallet,
                usdc_amount,
                status,
                tx_hash,
                created_at,
                users!inner(wallet_address)
            `)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error1) {
            console.error(`${colors.red}❌ Error en Query 1:${colors.reset}`, error1);
        } else {
            // Filtrar en memoria porque Supabase no permite comparar en la query directamente
            const filteredClaims = claimsMismatch?.filter(claim => 
                claim.users && 
                claim.users.wallet_address &&
                claim.recipient_wallet &&
                claim.recipient_wallet.toLowerCase() !== claim.users.wallet_address.toLowerCase()
            ) || [];

            if (filteredClaims.length > 0) {
                const formattedClaims = filteredClaims.map(claim => ({
                    id: claim.id,
                    user_id: claim.user_id,
                    user_wallet: claim.users?.wallet_address,
                    claimed_wallet: claim.recipient_wallet,
                    usdc_amount: claim.usdc_amount,
                    status: claim.status,
                    tx_hash: claim.tx_hash,
                    created_at: claim.created_at,
                    mismatch: true
                }));

                logResult(formattedClaims, 'Claims con wallet incorrecta');
                
                // Calcular total robado
                const totalStolen = formattedClaims
                    .filter(c => c.status === 'completed' || c.status === 'success')
                    .reduce((sum, c) => sum + parseFloat(c.usdc_amount || 0), 0);
                
                console.log(`\n${colors.red}${colors.bright}💰 TOTAL POTENCIALMENTE ROBADO: ${totalStolen.toFixed(2)} USD nominal${colors.reset}\n`);
            } else {
                console.log(`${colors.green}✅ No se encontraron claims con wallet incorrecta${colors.reset}`);
            }
        }

        // QUERY 2: Transacciones del vault a direcciones desconocidas
        logSection('QUERY 2: Transacciones del Vault a Direcciones Desconocidas');
        const { data: vaultTransactions, error: error2 } = await supabase
            .from('vault_transactions')
            .select(`
                id,
                transaction_type,
                wallet_address,
                amount_usdc,
                tx_hash,
                reason,
                status,
                created_at,
                ip_address,
                user_agent,
                user_id
            `)
            .eq('transaction_type', 'withdrawal')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error2) {
            console.error(`${colors.red}❌ Error en Query 2:${colors.reset}`, error2);
        } else {
            // Verificar qué direcciones no pertenecen a usuarios
            const suspiciousTransactions = [];
            
            for (const tx of (vaultTransactions || [])) {
                if (!tx.user_id && tx.wallet_address) {
                    // Verificar si la dirección pertenece a algún usuario
                    const { data: user } = await supabase
                        .from('users')
                        .select('id, wallet_address')
                        .eq('wallet_address', tx.wallet_address.toLowerCase())
                        .single();
                    
                    if (!user) {
                        suspiciousTransactions.push(tx);
                    }
                }
            }

            if (suspiciousTransactions.length > 0) {
                logResult(suspiciousTransactions, 'Transacciones sospechosas del vault');
                
                // Calcular total
                const totalSuspicious = suspiciousTransactions
                    .filter(tx => tx.status === 'completed')
                    .reduce((sum, tx) => sum + parseFloat(tx.amount_usdc || 0), 0);
                
                console.log(`\n${colors.red}${colors.bright}💰 TOTAL EN TRANSACCIONES SOSPECHOSAS: ${totalSuspicious.toFixed(2)} USDC${colors.reset}\n`);
                
                // Agrupar por dirección
                const byAddress = {};
                suspiciousTransactions.forEach(tx => {
                    const addr = tx.wallet_address.toLowerCase();
                    if (!byAddress[addr]) {
                        byAddress[addr] = {
                            address: addr,
                            count: 0,
                            total: 0,
                            transactions: []
                        };
                    }
                    byAddress[addr].count++;
                    byAddress[addr].total += parseFloat(tx.amount_usdc || 0);
                    byAddress[addr].transactions.push(tx);
                });
                
                console.log(`${colors.yellow}📊 RESUMEN POR DIRECCIÓN:${colors.reset}`);
                Object.values(byAddress).forEach(addr => {
                    console.log(`  ${colors.red}${addr.address}${colors.reset}: ${addr.count} transacciones, ${addr.total.toFixed(2)} USD nominal total`);
                });
            } else {
                console.log(`${colors.green}✅ No se encontraron transacciones sospechosas${colors.reset}`);
            }
        }

        // QUERY 3: Alertas de seguridad
        logSection('QUERY 3: Alertas de Seguridad');
        const { data: securityAlerts, error: error3 } = await supabase
            .from('security_alerts')
            .select(`
                id,
                alert_type,
                severity,
                details,
                user_id,
                ip_address,
                user_agent,
                resolved,
                created_at
            `)
            .eq('alert_type', 'WALLET_MISMATCH')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error3) {
            console.error(`${colors.red}❌ Error en Query 3:${colors.reset}`, error3);
            console.log(`${colors.yellow}⚠️  La tabla security_alerts puede no existir aún${colors.reset}`);
        } else {
            logResult(securityAlerts, 'Alertas de wallet mismatch');
        }

        // QUERY 4: Claims grandes recientes
        logSection('QUERY 4: Claims Grandes Recientes');
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data: largeClaims, error: error4 } = await supabase
            .from('claims')
            .select(`
                id,
                user_id,
                recipient_wallet,
                usdc_amount,
                status,
                tx_hash,
                created_at,
                users!inner(wallet_address)
            `)
            .gte('usdc_amount', 100)
            .gte('created_at', thirtyDaysAgo.toISOString())
            .order('usdc_amount', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(50);

        if (error4) {
            console.error(`${colors.red}❌ Error en Query 4:${colors.reset}`, error4);
        } else {
            if (largeClaims && largeClaims.length > 0) {
                const formattedLargeClaims = largeClaims.map(claim => ({
                    id: claim.id,
                    user_id: claim.user_id,
                    user_wallet: claim.users?.wallet_address,
                    recipient_wallet: claim.recipient_wallet,
                    usdc_amount: claim.usdc_amount,
                    status: claim.status,
                    tx_hash: claim.tx_hash,
                    created_at: claim.created_at,
                    wallet_match: claim.users?.wallet_address?.toLowerCase() === claim.recipient_wallet?.toLowerCase()
                }));

                logResult(formattedLargeClaims, 'Claims grandes recientes');
                
                // Separar por coincidencia de wallet
                const matching = formattedLargeClaims.filter(c => c.wallet_match);
                const mismatching = formattedLargeClaims.filter(c => !c.wallet_match);
                
                console.log(`\n${colors.green}✅ Claims con wallet correcta: ${matching.length}${colors.reset}`);
                console.log(`${colors.red}⚠️  Claims con wallet incorrecta: ${mismatching.length}${colors.reset}`);
                
                if (mismatching.length > 0) {
                    const totalMismatch = mismatching
                        .filter(c => c.status === 'completed' || c.status === 'success')
                        .reduce((sum, c) => sum + parseFloat(c.usdc_amount || 0), 0);
                    console.log(`${colors.red}${colors.bright}💰 TOTAL EN CLAIMS CON WALLET INCORRECTA: ${totalMismatch.toFixed(2)} USD nominal${colors.reset}\n`);
                }
            } else {
                console.log(`${colors.green}✅ No se encontraron claims grandes recientes${colors.reset}`);
            }
        }

        // RESUMEN FINAL
        logSection('RESUMEN DE INVESTIGACIÓN');
        console.log(`${colors.bright}✅ Investigación completada${colors.reset}`);
        console.log(`\n${colors.yellow}📋 PRÓXIMOS PASOS:${colors.reset}`);
        console.log(`1. Revisa las transacciones sospechosas identificadas`);
        console.log(`2. Verifica las direcciones en Basescan: https://basescan.org/address/[DIRECCION]`);
        console.log(`3. Revisa los logs del servidor en Render para más detalles`);
        console.log(`4. Si encuentras transacciones sospechosas, reporta las direcciones para bloqueo\n`);

    } catch (error) {
        console.error(`${colors.red}❌ Error crítico en la investigación:${colors.reset}`, error);
        process.exit(1);
    }
}

// Ejecutar investigación
investigateFundLeak()
    .then(() => {
        console.log(`${colors.green}✅ Script completado${colors.reset}\n`);
        process.exit(0);
    })
    .catch(error => {
        console.error(`${colors.red}❌ Error fatal:${colors.reset}`, error);
        process.exit(1);
    });
