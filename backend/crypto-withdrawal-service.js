/**
 * Retiros cripto (sql/crypto-withdrawals.sql) -- reemplaza a /api/claim.
 *
 * El usuario pega su dirección; no hace falta conectar ninguna wallet.
 * Garantías:
 * - El saldo se reserva de forma atómica AL PEDIR (reserve_cop_withdrawal,
 *   FOR UPDATE en la base): dos pedidos simultáneos no pueden sacar más de
 *   lo que hay. El /api/claim viejo pagaba primero y descontaba después.
 * - Pago automático SOLO si: red Base (USDC), monto <= límite automático,
 *   dentro del tope de 24h, la dirección ya recibió un pago anterior de esta
 *   misma cuenta, y la wallet de pagos tiene USDC + ETH para el gas. Todo lo
 *   demás queda "pending_review" para el operador (admin-retiros.html).
 * - Una sola ejecución por retiro: el paso a "processing" es un UPDATE
 *   condicional; si otro proceso ya lo tomó, no se paga dos veces.
 * - Rechazo o transacción fallida -> el saldo se devuelve exacto
 *   (refund_cop_withdrawal). Si no se sabe si la tx salió (timeout), queda en
 *   "processing" con su tx_hash para revisar a mano: nunca se devuelve saldo
 *   de algo que pudo haberse pagado.
 */
const { createPublicClient, createWalletClient, http, parseUnits, formatUnits } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { base } = require('viem/chains');

const FEE_RATE = 0.05;
const MIN_AMOUNT = 5;
const MAX_AMOUNT = 10000;
const AUTO_MAX_USD = Number(process.env.CRYPTO_AUTO_PAYOUT_MAX_USD ?? 50);
const USDC_BASE = (process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913').toLowerCase();
// Destinos que siempre son un error del usuario (el dinero se perdería).
const FORBIDDEN_DESTINATIONS = new Set([
    USDC_BASE,
    '0x0000000000000000000000000000000000000000',
    (process.env.MTR_TOKEN_ADDRESS || '').toLowerCase()
].filter(Boolean));

const ERC20_ABI = [
    { name: 'transfer', type: 'function', stateMutability: 'nonpayable',
      inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
    { name: 'balanceOf', type: 'function', stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }
];

const NETWORKS = {
    base_usdc: { label: 'USDC · Base', validate: (a) => /^0x[a-fA-F0-9]{40}$/.test(a) },
    tron_usdt: { label: 'USDT · TRON (TRC-20)', validate: (a) => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a) }
};

function round2(n) { return Math.floor(Number(n) * 100) / 100; }

class CryptoWithdrawalService {
    constructor(supabase) {
        this.supabase = supabase;
        this.hotWallet = null;
        const pk = process.env.ADMIN_WALLET_PRIVATE_KEY;
        if (pk) {
            try {
                const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
                const transport = http(process.env.BASE_RPC_URL || 'https://mainnet.base.org');
                this.hotWallet = {
                    account,
                    publicClient: createPublicClient({ chain: base, transport }),
                    walletClient: createWalletClient({ account, chain: base, transport })
                };
            } catch (e) {
                console.error('[crypto-withdrawal] Wallet de pagos inválida, solo retiros manuales:', e.message);
            }
        }
    }

    static networks() {
        return Object.keys(NETWORKS).map((id) => ({ id, label: NETWORKS[id].label }));
    }

    static limits() {
        return { feeRate: FEE_RATE, min: MIN_AMOUNT, max: MAX_AMOUNT, autoMax: AUTO_MAX_USD };
    }

    normalizeAddress(network, address) {
        const a = String(address || '').trim();
        return network === 'base_usdc' ? a.toLowerCase() : a;
    }

    async requestWithdrawal({ userId, amount, network, address }) {
        if (!NETWORKS[network]) throw new Error('Red no soportada');
        const addr = this.normalizeAddress(network, address);
        if (!NETWORKS[network].validate(addr)) {
            throw new Error(network === 'base_usdc'
                ? 'Dirección inválida: en Base debe empezar con 0x y tener 42 caracteres'
                : 'Dirección inválida: en TRON debe empezar con T y tener 34 caracteres');
        }
        if (FORBIDDEN_DESTINATIONS.has(addr.toLowerCase())) {
            throw new Error('Esa dirección es un contrato de token, no una wallet: el dinero se perdería');
        }
        const credits = round2(amount);
        if (!Number.isFinite(credits) || credits < MIN_AMOUNT) throw new Error(`El mínimo de retiro es ${MIN_AMOUNT} créditos`);
        if (credits > MAX_AMOUNT) throw new Error(`El máximo por retiro es ${MAX_AMOUNT} créditos`);

        const fee = round2(credits * FEE_RATE);
        const payout = round2(credits - fee);

        // 1) Reserva atómica del saldo real (nunca créditos de prueba).
        const { data: reserveData, error: reserveError } = await this.supabase
            .rpc('reserve_cop_withdrawal', { user_id_param: userId, amount_to_reserve: credits });
        if (reserveError) {
            throw new Error(/insuficiente/i.test(reserveError.message) ? 'Saldo insuficiente' : `No se pudo reservar el saldo: ${reserveError.message}`);
        }
        const taken = Array.isArray(reserveData) ? reserveData[0] : reserveData;
        const takenFiat = parseFloat(taken?.taken_fiat || 0);
        const takenCredits = parseFloat(taken?.taken_credits || 0);
        const takenOnchain = parseFloat(taken?.taken_onchain || 0);

        // 2) Registro. Si falla, el saldo vuelve: nunca queda descontado sin fila.
        const { data: row, error: insertError } = await this.supabase
            .from('withdrawal_requests_crypto')
            .insert([{
                user_id: userId,
                amount_credits: credits,
                fee_credits: fee,
                payout_amount: payout,
                network,
                address: addr,
                status: 'pending_review',
                taken_from_fiat: takenFiat,
                taken_from_credits: takenCredits,
                taken_from_onchain: takenOnchain
            }])
            .select()
            .single();
        if (insertError || !row) {
            await this.supabase.rpc('refund_cop_withdrawal', {
                user_id_param: userId, refund_fiat: takenFiat, refund_credits: takenCredits, refund_onchain: takenOnchain
            });
            throw new Error(`No se pudo registrar el retiro: ${insertError?.message || 'sin fila'}`);
        }

        // 3) ¿Pago automático?
        const reason = await this.autoPayBlocker(row);
        if (reason) {
            await this.setReviewReason(row.id, reason);
            return { ...row, review_reason: reason };
        }
        const result = await this.executePayout(row.id);
        return result.request || row;
    }

    /** Devuelve el motivo por el que NO se paga solo, o null si se puede. */
    async autoPayBlocker(row) {
        if (row.network !== 'base_usdc') return 'Red TRON: pago manual del operador';
        if (!this.hotWallet) return 'Pagos automáticos no configurados';
        if (!(AUTO_MAX_USD > 0)) return 'Pagos automáticos desactivados';
        if (Number(row.amount_credits) > AUTO_MAX_USD) return `Monto mayor al límite automático (${AUTO_MAX_USD})`;

        const { data: prior } = await this.supabase
            .from('withdrawal_requests_crypto')
            .select('id')
            .eq('user_id', row.user_id)
            .eq('address', row.address)
            .eq('status', 'paid')
            .limit(1);
        if (!prior || !prior.length) return 'Primera vez a esta dirección: el operador la confirma';

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recent } = await this.supabase
            .from('withdrawal_requests_crypto')
            .select('amount_credits')
            .eq('user_id', row.user_id)
            .in('status', ['paid', 'processing'])
            .gte('created_at', since);
        const used = (recent || []).reduce((s, r) => s + Number(r.amount_credits || 0), 0);
        if (used + Number(row.amount_credits) > AUTO_MAX_USD) return `Tope automático de 24h (${AUTO_MAX_USD}) alcanzado`;
        return null;
    }

    async setReviewReason(id, reason) {
        await this.supabase.from('withdrawal_requests_crypto')
            .update({ review_reason: reason, updated_at: new Date().toISOString() })
            .eq('id', id);
    }

    async hotWalletStatus() {
        if (!this.hotWallet) return { configured: false };
        const { publicClient, account } = this.hotWallet;
        const [usdcRaw, ethRaw] = await Promise.all([
            publicClient.readContract({ address: USDC_BASE, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] }),
            publicClient.getBalance({ address: account.address })
        ]);
        return {
            configured: true,
            address: account.address,
            usdc: Number(formatUnits(usdcRaw, 6)),
            eth: Number(formatUnits(ethRaw, 18))
        };
    }

    /**
     * Paga un retiro en pending_review por la wallet de pagos (USDC en Base).
     * Lo usan el pago automático y el botón "Aprobar y pagar" del operador.
     */
    async executePayout(id) {
        // Toma exclusiva: solo un proceso pasa de pending_review a processing.
        const { data: claimed } = await this.supabase
            .from('withdrawal_requests_crypto')
            .update({ status: 'processing', updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('status', 'pending_review')
            .select()
            .maybeSingle();
        if (!claimed) return { ok: false, error: 'El retiro ya no está pendiente (otro proceso lo tomó o ya terminó)' };

        const backToReview = async (reason, err) => {
            const { data } = await this.supabase.from('withdrawal_requests_crypto')
                .update({ status: 'pending_review', review_reason: reason, error: err || null, updated_at: new Date().toISOString() })
                .eq('id', id).select().maybeSingle();
            return { ok: false, error: reason, request: data };
        };

        if (claimed.network !== 'base_usdc') return backToReview('Red TRON: pagar manualmente y registrar el tx hash');
        if (!this.hotWallet) return backToReview('Pagos automáticos no configurados');

        const amount = Number(claimed.payout_amount);
        let status;
        try {
            status = await this.hotWalletStatus();
        } catch (e) {
            return backToReview('No se pudo leer el saldo de la wallet de pagos', e.message);
        }
        if (status.usdc < amount) return backToReview(`Wallet de pagos sin USDC suficiente (${status.usdc.toFixed(2)} disponibles)`);
        if (status.eth <= 0.00002) return backToReview('Wallet de pagos sin ETH para el gas en Base');

        const { walletClient, publicClient } = this.hotWallet;
        let txHash;
        try {
            txHash = await walletClient.writeContract({
                address: USDC_BASE,
                abi: ERC20_ABI,
                functionName: 'transfer',
                args: [claimed.address, parseUnits(amount.toFixed(6), 6)]
            });
        } catch (e) {
            // No se transmitió nada: seguro volver a la cola.
            return backToReview('El envío no salió (sin transacción)', e.shortMessage || e.message);
        }

        await this.supabase.from('withdrawal_requests_crypto')
            .update({ tx_hash: txHash, payout_method: 'hot_wallet_base', updated_at: new Date().toISOString() })
            .eq('id', id);

        let receipt;
        try {
            receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120000 });
        } catch (e) {
            // Transmitida pero sin confirmar: NO se devuelve saldo, queda en
            // processing con su tx_hash para verificar en BaseScan.
            const { data } = await this.supabase.from('withdrawal_requests_crypto')
                .update({ error: 'Sin confirmación todavía, verificar tx en BaseScan', updated_at: new Date().toISOString() })
                .eq('id', id).select().maybeSingle();
            return { ok: false, error: 'Pago enviado, esperando confirmación', request: data };
        }

        if (receipt.status !== 'success') {
            await this.refund(claimed);
            const { data } = await this.supabase.from('withdrawal_requests_crypto')
                .update({ status: 'failed', error: 'La transacción falló en la red', processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq('id', id).select().maybeSingle();
            return { ok: false, error: 'La transacción falló; saldo devuelto', request: data };
        }

        const { data: paid } = await this.supabase.from('withdrawal_requests_crypto')
            .update({ status: 'paid', error: null, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', id).select().maybeSingle();
        console.log(`[crypto-withdrawal] ✅ ${amount} USDC -> ${claimed.address} (${txHash})`);
        return { ok: true, request: paid };
    }

    async refund(row) {
        const { error } = await this.supabase.rpc('refund_cop_withdrawal', {
            user_id_param: row.user_id,
            refund_fiat: row.taken_from_fiat,
            refund_credits: row.taken_from_credits,
            refund_onchain: row.taken_from_onchain
        });
        if (error) throw new Error(`No se pudo devolver el saldo: ${error.message}`);
    }

    /** El operador pagó por fuera (TRON, exchange) y registra el tx hash. */
    async markPaidManually(id, txHash, notes) {
        const hash = String(txHash || '').trim();
        if (hash.length < 20) throw new Error('Tx hash requerido');
        const { data, error } = await this.supabase.from('withdrawal_requests_crypto')
            .update({ status: 'paid', tx_hash: hash, payout_method: 'manual', admin_notes: notes || null,
                      processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', id)
            .in('status', ['pending_review', 'processing'])
            .select().maybeSingle();
        if (error || !data) throw new Error('El retiro no está pendiente');
        return data;
    }

    async reject(id, notes) {
        // Tomarlo primero (condicional) para que no se pague y rechace a la vez.
        const { data: row } = await this.supabase.from('withdrawal_requests_crypto')
            .update({ status: 'rejected', admin_notes: notes || null, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('status', 'pending_review')
            .select().maybeSingle();
        if (!row) throw new Error('Solo se puede rechazar un retiro pendiente de revisión');
        await this.refund(row);
        return row;
    }

    async listMine(userId) {
        const { data, error } = await this.supabase.from('withdrawal_requests_crypto')
            .select('id, amount_credits, fee_credits, payout_amount, network, address, status, tx_hash, created_at, processed_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);
        if (error) throw new Error(error.message);
        return data || [];
    }

    async listForAdmin() {
        const { data, error } = await this.supabase.from('withdrawal_requests_crypto')
            .select('*, users(email)')
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) throw new Error(error.message);
        return data || [];
    }
}

module.exports = { CryptoWithdrawalService };
