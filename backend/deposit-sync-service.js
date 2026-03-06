/**
 * Deposit Sync Service
 * Verifica periódicamente el balance del vault y sincroniza depósitos no procesados
 * Escanea transacciones recientes hacia la wallet de la plataforma
 */

const { createPublicClient, http, formatUnits } = require('viem');
const { base } = require('viem/chains');
const { createClient } = require('@supabase/supabase-js');
const { DepositListener } = require('./deposit-listener');

const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS || '0x75376BC58830f27415402875D26B73A6BE8E2253';
const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const MTR_TOKEN_ADDRESS = process.env.MTR_TOKEN_ADDRESS || '0x99cd1eb32846c9027ed9cb8710066fa08791c33b';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bscmgcnynbxalcuwdqlm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org')
});

// ERC20 Transfer Event ABI
const ERC20_TRANSFER_ABI = [
    {
        type: 'event',
        name: 'Transfer',
        inputs: [
            { name: 'from', type: 'address', indexed: true },
            { name: 'to', type: 'address', indexed: true },
            { name: 'value', type: 'uint256', indexed: false }
        ]
    }
];

class DepositSyncService {
    constructor() {
        this.isRunning = false;
        this.syncInterval = null;
        this.depositListener = null;
        this.lastSyncBlock = null;
    }

    /**
     * Initialize sync service
     */
    async init() {
        console.log('[deposit-sync] Initializing deposit sync service...');
        
        // Initialize DepositListener for processing
        this.depositListener = new DepositListener();
        await this.depositListener.init();

        // Start periodic sync
        this.startPeriodicSync();

        console.log('[deposit-sync] ✅ Deposit sync service initialized');
    }

    /**
     * Start periodic synchronization
     */
    startPeriodicSync() {
        if (this.isRunning) return;

        this.isRunning = true;

        // Sync immediately
        this.syncDeposits();

        // Then sync every 2 minutes
        this.syncInterval = setInterval(() => {
            this.syncDeposits();
        }, 2 * 60 * 1000); // 2 minutes

        console.log('[deposit-sync] Periodic sync started (every 2 minutes)');
    }

    /**
     * Stop periodic synchronization
     */
    stopPeriodicSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.isRunning = false;
        console.log('[deposit-sync] Periodic sync stopped');
    }

    /**
     * Sync deposits - main function
     */
    async syncDeposits() {
        try {
            console.log('[deposit-sync] 🔄 Starting deposit sync...');

            // Get latest block
            const latestBlock = await publicClient.getBlockNumber();
            const fromBlock = this.lastSyncBlock || latestBlock - 2000n; // Check last 2000 blocks

            // Scan for USDC deposits
            const usdcDeposits = await this.scanTokenDeposits(USDC_ADDRESS, 'USDC', fromBlock, latestBlock);
            
            // Scan for MTR deposits
            const mtrDeposits = await this.scanTokenDeposits(MTR_TOKEN_ADDRESS, 'MTR', fromBlock, latestBlock);

            const allDeposits = [...usdcDeposits, ...mtrDeposits];

            console.log(`[deposit-sync] Found ${allDeposits.length} potential deposits to process`);

            // Process each deposit
            let processedCount = 0;
            for (const deposit of allDeposits) {
                try {
                    const processed = await this.processDepositIfNeeded(deposit);
                    if (processed) {
                        processedCount++;
                    }
                } catch (error) {
                    console.error(`[deposit-sync] Error processing deposit ${deposit.txHash}:`, error.message);
                }
            }

            this.lastSyncBlock = latestBlock;

            if (processedCount > 0) {
                console.log(`[deposit-sync] ✅ Processed ${processedCount} new deposits`);
            } else {
                console.log('[deposit-sync] ✅ Sync completed, no new deposits found');
            }

        } catch (error) {
            console.error('[deposit-sync] Error in sync:', error);
        }
    }

    /**
     * Scan for token deposits in a block range
     */
    async scanTokenDeposits(tokenAddress, tokenName, fromBlock, toBlock) {
        try {
            const events = await publicClient.getLogs({
                address: tokenAddress,
                event: {
                    type: 'event',
                    name: 'Transfer',
                    inputs: [
                        { name: 'from', type: 'address', indexed: true },
                        { name: 'to', type: 'address', indexed: true },
                        { name: 'value', type: 'uint256', indexed: false }
                    ]
                },
                args: {
                    to: PLATFORM_WALLET
                },
                fromBlock: fromBlock,
                toBlock: toBlock
            });

            console.log(`[deposit-sync] Found ${events.length} ${tokenName} transfer events to platform wallet`);

            return events.map(event => ({
                txHash: event.transactionHash,
                from: event.args.from,
                to: event.args.to,
                value: event.args.value,
                tokenName,
                tokenAddress,
                blockNumber: event.blockNumber
            }));

        } catch (error) {
            console.error(`[deposit-sync] Error scanning ${tokenName}:`, error.message);
            return [];
        }
    }

    /**
     * Process deposit if not already processed
     */
    async processDepositIfNeeded(deposit) {
        try {
            // Skip if from platform wallet (internal transfer)
            if (deposit.from.toLowerCase() === PLATFORM_WALLET.toLowerCase()) {
                return false;
            }

            // PROTECCIÓN CRÍTICA: Verificar si ya está procesado en base de datos
            // Esta verificación previene procesar depósitos duplicados
            const { data: existing, error: checkError } = await supabase
                .from('deposits')
                .select('id, user_id, credits_awarded, status, processed_at')
                .eq('tx_hash', deposit.txHash)
                .single();

            if (existing) {
                console.log(`[deposit-sync] ⚠️ DEPÓSITO DUPLICADO DETECTADO Y RECHAZADO:`, {
                    txHash: deposit.txHash,
                    existingId: existing.id,
                    userId: existing.user_id,
                    creditsAlreadyAwarded: existing.credits_awarded,
                    status: existing.status,
                    processedAt: existing.processed_at
                });
                return false; // CRÍTICO: Ya procesado, no intentar de nuevo
            }

            // Si hay error de consulta (no es "no encontrado"), registrar pero no procesar por seguridad
            if (checkError && checkError.code !== 'PGRST116') {
                console.error('[deposit-sync] Error checking for existing deposit:', checkError);
                // Por seguridad, no procesar si no podemos verificar
                return false;
            }

            // Verify transaction receipt
            const receipt = await publicClient.getTransactionReceipt({ hash: deposit.txHash });
            
            if (receipt.status !== 'success') {
                console.log(`[deposit-sync] Transaction ${deposit.txHash} failed, skipping`);
                return false;
            }

            // Process using DepositListener
            console.log(`[deposit-sync] Processing new deposit: ${deposit.txHash} (${deposit.tokenName})`);

            const mockEvent = {
                transactionHash: deposit.txHash,
                args: {
                    from: deposit.from,
                    to: deposit.to,
                    value: deposit.value
                }
            };

            await this.depositListener.processDeposit(mockEvent, deposit.tokenName, deposit.tokenAddress);

            return true;

        } catch (error) {
            console.error(`[deposit-sync] Error processing deposit ${deposit.txHash}:`, error);
            return false;
        }
    }

    /**
     * Manual sync trigger (for API endpoint)
     */
    async manualSync() {
        console.log('[deposit-sync] Manual sync triggered');
        await this.syncDeposits();
        return { success: true, message: 'Sync completed' };
    }

    /**
     * Sync specific transaction
     */
    async syncTransaction(txHash) {
        try {
            console.log(`[deposit-sync] Syncing specific transaction: ${txHash}`);

            // Get transaction receipt
            const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
            
            if (receipt.status !== 'success') {
                throw new Error('Transaction failed');
            }

            // Find Transfer events to platform wallet
            const deposits = [];

            for (const log of receipt.logs) {
                // Check USDC
                if (log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
                    try {
                        const decoded = await publicClient.decodeEventLog({
                            abi: ERC20_TRANSFER_ABI,
                            data: log.data,
                            topics: log.topics
                        });

                        if (decoded.args.to.toLowerCase() === PLATFORM_WALLET.toLowerCase()) {
                            deposits.push({
                                txHash,
                                from: decoded.args.from,
                                to: decoded.args.to,
                                value: decoded.args.value,
                                tokenName: 'USDC',
                                tokenAddress: USDC_ADDRESS
                            });
                        }
                    } catch (e) {
                        // Skip invalid logs
                    }
                }

                // Check MTR
                if (log.address.toLowerCase() === MTR_TOKEN_ADDRESS.toLowerCase()) {
                    try {
                        const decoded = await publicClient.decodeEventLog({
                            abi: ERC20_TRANSFER_ABI,
                            data: log.data,
                            topics: log.topics
                        });

                        if (decoded.args.to.toLowerCase() === PLATFORM_WALLET.toLowerCase()) {
                            deposits.push({
                                txHash,
                                from: decoded.args.from,
                                to: decoded.args.to,
                                value: decoded.args.value,
                                tokenName: 'MTR',
                                tokenAddress: MTR_TOKEN_ADDRESS
                            });
                        }
                    } catch (e) {
                        // Skip invalid logs
                    }
                }
            }

            if (deposits.length === 0) {
                return { success: false, message: 'No deposits found in this transaction' };
            }

            // Process each deposit (con protección contra duplicados)
            let processedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;

            for (const deposit of deposits) {
                try {
                    // Verificar ANTES de procesar (protección adicional)
                    const { data: preCheck } = await supabase
                        .from('deposits')
                        .select('id')
                        .eq('tx_hash', deposit.txHash)
                        .single();

                    if (preCheck) {
                        skippedCount++;
                        console.log(`[deposit-sync] Skipping already processed deposit: ${deposit.txHash}`);
                        continue;
                    }

                    const processed = await this.processDepositIfNeeded(deposit);
                    if (processed) {
                        processedCount++;
                    } else {
                        skippedCount++;
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`[deposit-sync] Error processing deposit ${deposit.txHash}:`, error.message);
                }
            }

            return {
                success: true,
                message: `Sync completed: ${processedCount} processed, ${skippedCount} skipped, ${errorCount} errors`,
                depositsFound: deposits.length,
                depositsProcessed: processedCount,
                depositsSkipped: skippedCount,
                depositsErrors: errorCount
            };

        } catch (error) {
            console.error(`[deposit-sync] Error syncing transaction ${txHash}:`, error);
            throw error;
        }
    }
}

module.exports = { DepositSyncService };
