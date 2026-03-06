/**
 * Script de Verificación del Servidor
 * Verifica que el servidor esté funcionando correctamente
 */

const https = require('https');
const http = require('http');

const SERVER_URL = process.env.SERVER_URL || 'https://musictoken-ring.onrender.com';
const LOCAL_URL = 'http://localhost:3001';

// Endpoints a verificar
const ENDPOINTS = [
    { path: '/api/health', method: 'GET', description: 'Health Check' },
    { path: '/api/user/credits/test', method: 'GET', description: 'User Credits Endpoint' },
    { path: '/api/deposits/diagnose/test', method: 'GET', description: 'Deposit Diagnose Endpoint' }
];

const results = {
    passed: [],
    failed: [],
    warnings: []
};

/**
 * Hacer request HTTP/HTTPS
 */
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const isHttps = url.startsWith('https');
        const client = isHttps ? https : http;
        
        const req = client.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data: data
                });
            });
        });

        req.on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

/**
 * Verificar endpoint
 */
async function checkEndpoint(baseUrl, endpoint) {
    const url = `${baseUrl}${endpoint.path}`;
    
    try {
        const response = await makeRequest(url, {
            method: endpoint.method,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Considerar exitoso si el status code es 2xx o 4xx (endpoint existe)
        // 5xx indica error del servidor
        const isSuccess = response.statusCode >= 200 && response.statusCode < 500;
        
        return {
            endpoint: endpoint.description,
            url,
            status: isSuccess ? '✅' : '❌',
            statusCode: response.statusCode,
            success: isSuccess
        };
    } catch (error) {
        return {
            endpoint: endpoint.description,
            url,
            status: '❌',
            error: error.message,
            success: false
        };
    }
}

/**
 * Verificar servidor
 */
async function verifyServer() {
    console.log('\n🔍 Verificando estado del servidor...\n');
    console.log(`📡 Servidor de producción: ${SERVER_URL}`);
    console.log(`📡 Servidor local: ${LOCAL_URL}\n`);

    const checks = [];

    // Verificar servidor de producción
    console.log('🌐 Verificando servidor de producción...');
    for (const endpoint of ENDPOINTS) {
        const result = await checkEndpoint(SERVER_URL, endpoint);
        checks.push({ ...result, server: 'production' });
        
        if (result.success) {
            results.passed.push(`${endpoint.description} (producción)`);
        } else {
            results.failed.push(`${endpoint.description} (producción)`);
        }
        
        console.log(`  ${result.status} ${endpoint.description}: ${result.statusCode || 'Error'} ${result.error || ''}`);
    }

    // Verificar servidor local (si está disponible)
    console.log('\n💻 Verificando servidor local...');
    try {
        for (const endpoint of ENDPOINTS) {
            const result = await checkEndpoint(LOCAL_URL, endpoint);
            checks.push({ ...result, server: 'local' });
            
            if (result.success) {
                results.passed.push(`${endpoint.description} (local)`);
            } else {
                results.warnings.push(`${endpoint.description} (local) - ${result.error || 'No disponible'}`);
            }
            
            console.log(`  ${result.status} ${endpoint.description}: ${result.statusCode || 'Error'} ${result.error || ''}`);
        }
    } catch (error) {
        console.log(`  ⚠️  Servidor local no disponible: ${error.message}`);
        results.warnings.push('Servidor local no disponible');
    }

    return checks;
}

/**
 * Generar reporte
 */
function generateReport(checks) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 REPORTE DE VERIFICACIÓN DEL SERVIDOR');
    console.log('='.repeat(80) + '\n');

    // Agrupar por servidor
    const byServer = {
        production: checks.filter(c => c.server === 'production'),
        local: checks.filter(c => c.server === 'local')
    };

    console.log('🌐 PRODUCCIÓN:');
    console.log('-'.repeat(80));
    byServer.production.forEach(check => {
        console.log(`  ${check.status} ${check.endpoint}`);
        console.log(`     URL: ${check.url}`);
        console.log(`     Status: ${check.statusCode || 'N/A'}`);
        if (check.error) {
            console.log(`     Error: ${check.error}`);
        }
    });

    if (byServer.local.length > 0) {
        console.log('\n💻 LOCAL:');
        console.log('-'.repeat(80));
        byServer.local.forEach(check => {
            console.log(`  ${check.status} ${check.endpoint}`);
            console.log(`     URL: ${check.url}`);
            console.log(`     Status: ${check.statusCode || 'N/A'}`);
            if (check.error) {
                console.log(`     Error: ${check.error}`);
            }
        });
    }

    // Resumen
    console.log('\n' + '='.repeat(80));
    console.log('📈 RESUMEN');
    console.log('='.repeat(80));
    console.log(`✅ Verificaciones exitosas: ${results.passed.length}`);
    console.log(`❌ Verificaciones fallidas: ${results.failed.length}`);
    console.log(`⚠️  Advertencias: ${results.warnings.length}`);

    if (results.failed.length > 0) {
        console.log('\n❌ ENDPOINTS CON PROBLEMAS:');
        results.failed.forEach(item => {
            console.log(`   - ${item}`);
        });
    }

    console.log('\n' + '='.repeat(80));

    const productionFailed = byServer.production.filter(c => !c.success).length;
    if (productionFailed === 0) {
        console.log('✅ EL SERVIDOR DE PRODUCCIÓN ESTÁ FUNCIONANDO CORRECTAMENTE');
    } else {
        console.log('❌ HAY PROBLEMAS CON EL SERVIDOR DE PRODUCCIÓN');
        console.log('\n📝 Próximos pasos:');
        console.log('   1. Revisa los logs del servidor en Render');
        console.log('   2. Verifica que todas las variables de entorno estén configuradas');
        console.log('   3. Asegúrate de que el servidor se haya desplegado correctamente');
    }

    console.log('='.repeat(80) + '\n');
}

/**
 * Función principal
 */
async function main() {
    console.log('🚀 Iniciando verificación del servidor...\n');

    try {
        const checks = await verifyServer();
        generateReport(checks);

        // Exit code basado en resultados
        const productionFailed = checks.filter(c => c.server === 'production' && !c.success).length;
        if (productionFailed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    } catch (error) {
        console.error('\n❌ Error durante la verificación:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Ejecutar
main();
