/**
 * Script de Diagnóstico - Pool MTR/USDC
 * Verifica si existe el pool, qué fee tier tiene, y si hay MTR para vender
 * NO modifica nada, solo consulta información
 */

const { createPublicClient, http, formatUnits } = require('viem');
const { base } = require('viem/chains');

// Configuration
const MTR_TOKEN_ADDRESS = process.env.MTR_TOKEN_ADDRESS || '0x99cd1eb32846c9027ed9cb8710066fa08791c33b';
const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const MTR_POOL_WALLET = process.env.MTR_POOL_WALLET || process.env.PLATFORM_WALLET_ADDRESS || '0x75376BC58830f27415402875D26B73A6BE8E2253';

// Uniswap V3 Factory on Base
const UNISWAP_V3_FACTORY = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD'; // Base Uniswap V3 Factory

// ERC20 ABI
const ERC20_ABI = [
    {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
    }
];

// Uniswap V3 Factory ABI (simplified)
const FACTORY_ABI = [
    {
        type: 'function',
        name: 'getPool',
        stateMutability: 'view',
        inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'fee', type: 'uint24' }
        ],
        outputs: [{ name: 'pool', type: 'address' }]
    }
];

// Uniswap V3 Pool ABI (simplified)
const POOL_ABI = [
    {
        type: 'function',
        name: 'liquidity',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint128' }]
    },
    {
        type: 'function',
        name: 'token0',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'address' }]
    },
    {
        type: 'function',
        name: 'token1',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'address' }]
    },
    {
        type: 'function',
        name: 'fee',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint24' }]
    }
];

async function diagnosticarPoolMTR() {
    console.log('🔍 DIAGNÓSTICO DEL POOL MTR/USDC\n');
    console.log('='.repeat(60));
    
    const publicClient = createPublicClient({
        chain: base,
        transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
    });

    try {
        // 1. Verificar balance de MTR en pool wallet
        console.log('\n📊 PASO 1: Verificando balance de MTR en pool wallet...');
        console.log(`Pool wallet: ${MTR_POOL_WALLET}`);
        
        const mtrBalance = await publicClient.readContract({
            address: MTR_TOKEN_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [MTR_POOL_WALLET]
        });
        
        const mtrBalanceFormatted = parseFloat(formatUnits(mtrBalance, 18));
        console.log(`✅ Balance de MTR: ${mtrBalanceFormatted.toFixed(4)} MTR`);
        
        if (mtrBalanceFormatted === 0) {
            console.log('⚠️  NO HAY MTR EN EL POOL WALLET');
            console.log('   Esto significa que aún no se han comprado MTR (no hay depósitos de USDC)');
            console.log('   El error de venta es NORMAL en este caso - no hay nada que vender');
        } else {
            console.log(`✅ Hay ${mtrBalanceFormatted.toFixed(4)} MTR disponible para vender`);
        }

        // 2. Verificar balance de USDC en pool wallet
        console.log('\n📊 PASO 2: Verificando balance de USDC en pool wallet...');
        const usdcBalance = await publicClient.readContract({
            address: USDC_ADDRESS,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [MTR_POOL_WALLET]
        });
        const usdcBalanceFormatted = parseFloat(formatUnits(usdcBalance, 6));
        console.log(`✅ Balance de USDC: ${usdcBalanceFormatted.toFixed(2)} USDC`);

        // 3. Buscar pools MTR/USDC en Uniswap V3 con diferentes fee tiers
        console.log('\n📊 PASO 3: Buscando pools MTR/USDC en Uniswap V3 Base...');
        console.log('Fee tiers a verificar: 500 (0.05%), 3000 (0.3%), 10000 (1%)');
        
        const feeTiers = [500, 3000, 10000];
        const poolsEncontrados = [];

        for (const fee of feeTiers) {
            try {
                const poolAddress = await publicClient.readContract({
                    address: UNISWAP_V3_FACTORY,
                    abi: FACTORY_ABI,
                    functionName: 'getPool',
                    args: [MTR_TOKEN_ADDRESS, USDC_ADDRESS, fee]
                });

                if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
                    console.log(`\n✅ Pool encontrado con fee tier ${fee} (${fee === 500 ? '0.05%' : fee === 3000 ? '0.3%' : '1%'})`);
                    console.log(`   Dirección: ${poolAddress}`);

                    // Verificar liquidez del pool
                    try {
                        const liquidity = await publicClient.readContract({
                            address: poolAddress,
                            abi: POOL_ABI,
                            functionName: 'liquidity',
                            args: []
                        });

                        const liquidityFormatted = parseFloat(formatUnits(liquidity, 0));
                        console.log(`   Liquidez: ${liquidityFormatted.toFixed(0)} (unidades de liquidez)`);
                        
                        if (liquidityFormatted === 0) {
                            console.log('   ⚠️  Pool existe pero SIN LIQUIDEZ');
                        } else {
                            console.log('   ✅ Pool tiene liquidez');
                        }

                        poolsEncontrados.push({
                            fee,
                            address: poolAddress,
                            liquidity: liquidityFormatted
                        });
                    } catch (err) {
                        console.log(`   ⚠️  No se pudo verificar liquidez: ${err.message}`);
                    }
                } else {
                    console.log(`❌ No existe pool con fee tier ${fee}`);
                }
            } catch (err) {
                console.log(`❌ Error buscando pool con fee tier ${fee}: ${err.message}`);
            }
        }

        // 4. Resumen y conclusiones
        console.log('\n' + '='.repeat(60));
        console.log('📋 RESUMEN Y CONCLUSIONES\n');

        if (mtrBalanceFormatted === 0) {
            console.log('✅ CAUSA PRINCIPAL IDENTIFICADA:');
            console.log('   No hay MTR en el pool wallet porque aún no hay depósitos de USDC.');
            console.log('   El sistema intenta vender MTR cada 5 minutos si el buffer USDC está bajo,');
            console.log('   pero como no hay MTR para vender, el swap falla.');
            console.log('\n   SOLUCIÓN: Agregar validación para NO intentar vender si balance MTR = 0');
        } else {
            console.log('⚠️  Hay MTR disponible, pero el swap sigue fallando.');
            console.log('   Esto indica un problema con la configuración del pool.');
        }

        if (poolsEncontrados.length === 0) {
            console.log('\n❌ PROBLEMA CRÍTICO:');
            console.log('   No se encontró ningún pool MTR/USDC en Uniswap V3 Base.');
            console.log('   El código está usando fee tier 500, pero ese pool no existe.');
            console.log('\n   SOLUCIÓN:');
            console.log('   1. Verificar si existe en BaseSwap');
            console.log('   2. O crear el pool en Uniswap V3');
            console.log('   3. O ajustar el código para usar otro DEX');
        } else {
            const poolConLiquidez = poolsEncontrados.find(p => p.liquidity > 0);
            if (poolConLiquidez) {
                console.log(`\n✅ Pool encontrado con liquidez:`);
                console.log(`   Fee tier: ${poolConLiquidez.fee}`);
                console.log(`   Dirección: ${poolConLiquidez.address}`);
                console.log(`\n   SOLUCIÓN: Actualizar código para usar fee tier ${poolConLiquidez.fee}`);
            } else {
                console.log('\n⚠️  Pool existe pero sin liquidez suficiente.');
                console.log('   El swap fallará hasta que haya más liquidez en el pool.');
            }
        }

        console.log('\n' + '='.repeat(60));

    } catch (error) {
        console.error('\n❌ ERROR EN EL DIAGNÓSTICO:');
        console.error(error);
        console.error('\nStack:', error.stack);
    }
}

// Ejecutar diagnóstico
diagnosticarPoolMTR()
    .then(() => {
        console.log('\n✅ Diagnóstico completado');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Error fatal:', err);
        process.exit(1);
    });
