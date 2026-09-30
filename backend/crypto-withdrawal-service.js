/**
 * Retiros cripto (sql/crypto-withdrawals.sql) -- reemplaza a /api/claim.
 *
 * El usuario pega su dirección; no hace falta conectar ninguna wallet.
 * Garantías:
 * - El saldo se reserva de forma atómica AL PEDIR (reserve_cop_withdrawal,
 *   FOR UPDATE en la base): dos pedidos simultáneos no pueden sacar más de
 *   lo que hay. El /api/claim viejo pagaba primero y descontaba después.
 * - Dos vías de pago:
 *     1. NOWPayments (Mass Payouts desde la custodia): USDC Base y USDT TRON.
 *        Necesita NOWPAYMENTS_API_KEY + NOWPAYMENTS_EMAIL/PASSWORD. Cada
 *        payout se confirma con un código 2FA: con NOWPAYMENTS_2FA_SECRET el
 *        servidor lo genera solo (automático); sin él, NOWPayments manda el
 *        código al email del dueño y se pega en admin-retiros.html (1 hora,
 *        si no NOWPayments lo rechaza y el saldo se devuelve).
 *     2. Wallet de pagos propia en Base (ADMIN_WALLET_PRIVATE_KEY): solo USDC.
 * - Pago automático SOLO si: monto <= límite automático, dentro del tope de
 *   24h, la dirección ya recibió un pago anterior de esta misma cuenta y hay
 *   una vía automática disponible. Todo lo demás queda "pending_review".
 * - Una sola ejecución por retiro: el paso a "processing" es un UPDATE
 *   condicional; si otro proceso ya lo tomó, no se paga dos veces.
 * - Rechazo o pago fallido -> el saldo se devuelve exacto
 *   (refund_cop_withdrawal), una sola vez. Si no se sabe si el pago salió
 *   (timeout), queda en "processing" para revisar a mano: nunca se devuelve
 *   saldo de algo que pudo haberse pagado.
 */
const crypto = require('crypto');
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

const NP_API = 'https://api.nowpayments.io/v1';
// Códigos de moneda de NOWPayments por red. usdttrc20 está confirmado en su
// documentación; el de USDC en Base se puede ajustar por entorno (el panel
// admin muestra las monedas que reporta la cuenta para confirmarlo).
const NP_TICKERS = {
    base_usdc: (process.env.NOWPAYOUT_TICKER_BASE || 'usdcbase').toLowerCase(),
    tron_usdt: (process.env.NOWPAYOUT_TICKER_TRON || 'usdttrc20').toLowerCase()
};

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

function base32Decode(input) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = String(input || '').replace(/[\s=]/g, '').toUpperCase();
    let bits = '';
    for (const ch of clean) {
        const v = alphabet.indexOf(ch);
        if (v < 0) throw new Error('NOWPAYMENTS_2FA_SECRET no es base32 válido');
        bits += v.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return Buffer.from(bytes);
}

/** Código TOTP (RFC 6238: SHA1, 30 s, 6 dígitos) como Google Authenticator. */
function totp(secret, now = Date.now()) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
    const h = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
    const offset = h[h.length - 1] & 0xf;
    return String((h.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}

class CryptoWithdrawalService {
    constructor(supabase, opts = {}) {
        this.supabase = supabase;
        this.fetch = opts.fetch || globalThis.fetch;
        this.hotWallet = null;
        this.np = {
            apiKey: process.env.NOWPAYMENTS_API_KEY || '',
            email: process.env.NOWPAYMENTS_EMAIL || '',
            password: process.env.NOWPAYMENTS_PASSWORD || '',
            totpSecret: process.env.NOWPAYMENTS_2FA_SECRET || '',
            token: null,
            tokenExpiresAt: 0
        };
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
                console.error('[crypto-withdrawal] Wallet de pagos inválida:', e.message);
            }
        }
    }

    static networks() {
        return Object.keys(NETWORKS).map((id) => ({ id, label: NETWORKS[id].label }));
    }

    static limits() {
        return { feeRate: FEE_RATE, min: MIN_AMOUNT, max: MAX_AMOUNT, autoMax: AUTO_MAX_USD };
    }

    npConfigured() { return !!(this.np.apiKey && this.np.email && this.np.password); }
    npAuto2fa() { return this.npConfigured() && !!this.np.totpSecret; }

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
        const viaNp = this.npAuto2fa();
        const viaWallet = row.network === 'base_usdc' && !!this.hotWallet;
        if (!viaNp && !viaWallet) {
            return this.npConfigured()
                ? 'NOWPayments sin 2FA automático: aprobar y pegar el código'
                : 'Pagos automáticos no configurados';
        }
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

    // ---------------------------------------------------------------- NOWPayments
    async npToken() {
        if (this.np.token && Date.now() < this.np.tokenExpiresAt) return this.np.token;
        const resp = await this.fetch(`${NP_API}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: this.np.email, password: this.np.password })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.token) throw new Error(`NOWPayments auth ${resp.status}: ${data.message || 'sin token'}`);
        this.np.token = data.token;
        this.np.tokenExpiresAt = Date.now() + 4 * 60 * 1000; // el JWT dura 5 min
        return data.token;
    }

    async npRequest(path, { method = 'GET', body, jwt = true } = {}) {
        const headers = { 'x-api-key': this.np.apiKey, 'Content-Type': 'application/json' };
        if (jwt) headers.Authorization = `Bearer ${await this.npToken()}`;
        const resp = await this.fetch(`${NP_API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            const err = new Error(`NOWPayments ${method} ${path} ${resp.status}: ${data.message || data.error || JSON.stringify(data).slice(0, 200)}`);
            err.status = resp.status;
            throw err;
        }
        return data;
    }

    /** Saldo de la custodia por moneda (para el panel y para no crear payouts sin fondos). */
    async npBalance() {
        return this.npRequest('/balance', { jwt: false });
    }

    static npAvailable(balance, ticker) {
        const entry = balance && (balance[ticker] || balance[ticker.toUpperCase()]);
        if (entry == null) return null;
        const n = typeof entry === 'object' ? parseFloat(entry.amount) : parseFloat(entry);
        return Number.isFinite(n) ? n : null;
    }

    async npVerify(row, code) {
        await this.npRequest(`/payout/${encodeURIComponent(row.payout_id)}/verify`, {
            method: 'POST', body: { verification_code: String(code).trim() }
        });
    }

    // ------------------------------------------------------------------ Ejecución
    /**
     * Paga un retiro en pending_review. Lo usan el pago automático y el botón
     * "Aprobar y pagar" del operador. Prefiere NOWPayments si está configurado.
     */
    async executePayout(id) {
        // Toma exclusiva: solo un proceso pasa de pending_review a processing.
        const { data: claimed } = await this.supabase
            .from('withdrawal_requests_crypto')
            .update({ status: 'processing', error: null, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('status', 'pending_review')
            .select()
            .maybeSingle();
        if (!claimed) return { ok: false, error: 'El retiro ya no está pendiente (otro proceso lo tomó o ya terminó)' };

        if (this.npConfigured()) return this.payViaNowPayments(claimed);
        if (claimed.network === 'base_usdc' && this.hotWallet) return this.payViaHotWallet(claimed);
        return this.backToReview(id, 'Sin vía de pago automática: pagar por fuera y registrar el tx hash');
    }

    async backToReview(id, reason, err) {
        const { data } = await this.supabase.from('withdrawal_requests_crypto')
            .update({ status: 'pending_review', review_reason: reason, error: err || null, updated_at: new Date().toISOString() })
            .eq('id', id).select().maybeSingle();
        return { ok: false, error: reason, request: data };
    }

    async payViaNowPayments(row) {
        const ticker = NP_TICKERS[row.network];
        const amount = Number(row.payout_amount);

        // Sin la columna payout_id no se podría seguir el pago después de
        // crearlo: se comprueba ANTES de mandar nada a NOWPayments.
        const { error: colError } = await this.supabase.from('withdrawal_requests_crypto')
            .update({ payout_id: null }).eq('id', row.id);
        if (colError) return this.backToReview(row.id, 'Falta la columna payout_id: correr sql/crypto-withdrawals.sql', colError.message);

        try {
            const available = CryptoWithdrawalService.npAvailable(await this.npBalance(), ticker);
            if (available !== null && available < amount) {
                return this.backToReview(row.id, `NOWPayments sin saldo suficiente en ${ticker} (${available.toFixed(2)} disponibles)`);
            }
        } catch (e) {
            console.warn('[crypto-withdrawal] No se pudo leer el saldo de NOWPayments, se intenta igual:', e.message);
        }

        let created;
        try {
            created = await this.npRequest('/payout', {
                method: 'POST',
                body: {
                    ...(process.env.BACKEND_URL ? { ipn_callback_url: `${process.env.BACKEND_URL.replace(/\/$/, '')}/webhook/nowpayments` } : {}),
                    withdrawals: [{ address: row.address, currency: ticker, amount, unique_external_id: row.id }]
                }
            });
        } catch (e) {
            // No se creó el payout: seguro volver a la cola.
            return this.backToReview(row.id, 'NOWPayments no aceptó el pago', e.message);
        }

        const payoutId = String(created.id || created.batch_withdrawal_id || created.payout_id || '');
        const { data: saved } = await this.supabase.from('withdrawal_requests_crypto')
            .update({ payout_method: 'nowpayments', payout_id: payoutId || null, error: null,
                      review_reason: null, updated_at: new Date().toISOString() })
            .eq('id', row.id).select().maybeSingle();
        const current = saved || { ...row, payout_id: payoutId };

        if (!this.np.totpSecret) {
            await this.setReviewReason(row.id, 'Esperando código 2FA de NOWPayments (llegó al email del dueño; vence en 1 hora)');
            return { ok: true, pending2fa: true, request: { ...current, review_reason: 'Esperando código 2FA' } };
        }
        if (!payoutId) {
            await this.setReviewReason(row.id, 'NOWPayments no devolvió el id del pago: verificar en su panel');
            return { ok: false, error: 'Sin id de payout', request: current };
        }
        try {
            await this.npVerify(current, totp(this.np.totpSecret));
        } catch (e) {
            await this.setReviewReason(row.id, 'No se pudo verificar el 2FA automático: pegar el código a mano');
            return { ok: false, pending2fa: true, error: e.message, request: current };
        }
        return { ok: true, request: current };
    }

    /** El operador pega el código 2FA que NOWPayments le mandó por email. */
    async verifyNowPayments2fa(id, code) {
        const { data: row } = await this.supabase.from('withdrawal_requests_crypto')
            .select('*').eq('id', id).maybeSingle();
        if (!row || row.status !== 'processing' || row.payout_method !== 'nowpayments' || !row.payout_id) {
            throw new Error('Ese retiro no está esperando un código de NOWPayments');
        }
        await this.npVerify(row, code);
        await this.setReviewReason(id, null);
        return row;
    }

    /**
     * Estado de los payouts de NOWPayments en curso (se llama cada tanto).
     * FINISHED -> paid con su hash; FAILED/REJECTED (incluye 2FA vencido) ->
     * failed + saldo devuelto, una sola vez.
     */
    async syncNowPaymentsPayouts() {
        if (!this.npConfigured()) return;
        const { data: rows } = await this.supabase.from('withdrawal_requests_crypto')
            .select('*')
            .eq('status', 'processing')
            .eq('payout_method', 'nowpayments');
        for (const row of rows || []) {
            if (!row.payout_id) continue;
            try {
                const data = await this.npRequest(`/payout/${encodeURIComponent(row.payout_id)}`);
                const items = Array.isArray(data) ? data : (data.withdrawals || [data]);
                const mine = items.find((w) => w && (w.unique_external_id === row.id || String(w.address || '').toLowerCase() === String(row.address).toLowerCase())) || items[0] || {};
                const status = String(mine.status || data.status || '').toUpperCase();
                if (status === 'FINISHED') {
                    await this.supabase.from('withdrawal_requests_crypto')
                        .update({ status: 'paid', tx_hash: mine.hash || mine.tx_hash || row.tx_hash || null, review_reason: null,
                                  processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                        .eq('id', row.id).eq('status', 'processing');
                } else if (status === 'FAILED' || status === 'REJECTED') {
                    const { data: failed } = await this.supabase.from('withdrawal_requests_crypto')
                        .update({ status: 'failed', error: `NOWPayments: ${status}${mine.error ? ' · ' + mine.error : ''}`,
                                  processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                        .eq('id', row.id).eq('status', 'processing')
                        .select().maybeSingle();
                    if (failed) await this.refund(failed);
                }
            } catch (e) {
                console.warn('[crypto-withdrawal] No se pudo consultar el payout', row.payout_id, e.message);
            }
        }
    }

    // ------------------------------------------------------ Wallet propia en Base
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

    async payViaHotWallet(claimed) {
        const id = claimed.id;
        const amount = Number(claimed.payout_amount);
        let status;
        try {
            status = await this.hotWalletStatus();
        } catch (e) {
            return this.backToReview(id, 'No se pudo leer el saldo de la wallet de pagos', e.message);
        }
        if (status.usdc < amount) return this.backToReview(id, `Wallet de pagos sin USDC suficiente (${status.usdc.toFixed(2)} disponibles)`);
        if (status.eth <= 0.00002) return this.backToReview(id, 'Wallet de pagos sin ETH para el gas en Base');

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
            return this.backToReview(id, 'El envío no salió (sin transacción)', e.shortMessage || e.message);
        }

        await this.supabase.from('withdrawal_requests_crypto')
            .update({ tx_hash: txHash, payout_method: 'hot_wallet_base', updated_at: new Date().toISOString() })
            .eq('id', id);

        let receipt;
        try {
            receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120000 });
        } catch (e) {
            // Transmitida pero sin confirmar: NO se devuelve saldo.
            const { data } = await this.supabase.from('withdrawal_requests_crypto')
                .update({ error: 'Sin confirmación todavía, verificar tx en BaseScan', updated_at: new Date().toISOString() })
                .eq('id', id).select().maybeSingle();
            return { ok: false, error: 'Pago enviado, esperando confirmación', request: data };
        }

        if (receipt.status !== 'success') {
            const { data } = await this.supabase.from('withdrawal_requests_crypto')
                .update({ status: 'failed', error: 'La transacción falló en la red', processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq('id', id).eq('status', 'processing').select().maybeSingle();
            if (data) await this.refund(data);
            return { ok: false, error: 'La transacción falló; saldo devuelto', request: data };
        }

        const { data: paid } = await this.supabase.from('withdrawal_requests_crypto')
            .update({ status: 'paid', error: null, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', id).select().maybeSingle();
        console.log(`[crypto-withdrawal] ✅ ${amount} USDC -> ${claimed.address} (${txHash})`);
        return { ok: true, request: paid };
    }

    // -------------------------------------------------------------- Operador
    async refund(row) {
        const { error } = await this.supabase.rpc('refund_cop_withdrawal', {
            user_id_param: row.user_id,
            refund_fiat: row.taken_from_fiat,
            refund_credits: row.taken_from_credits,
            refund_onchain: row.taken_from_onchain
        });
        if (error) throw new Error(`No se pudo devolver el saldo: ${error.message}`);
    }

    /** El operador pagó por fuera (exchange, otra wallet) y registra el tx hash. */
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

    /** Estado de las dos vías para el panel admin. */
    async railsStatus() {
        const out = {
            nowpayments: { configured: this.npConfigured(), auto2fa: this.npAuto2fa(), tickers: NP_TICKERS },
            hotWallet: { configured: !!this.hotWallet }
        };
        if (this.npConfigured()) {
            try { out.nowpayments.balance = await this.npBalance(); } catch (e) { out.nowpayments.error = e.message; }
        }
        if (this.hotWallet) {
            try { out.hotWallet = await this.hotWalletStatus(); } catch (e) { out.hotWallet.error = e.message; }
        }
        return out;
    }
}

module.exports = { CryptoWithdrawalService, totp };
