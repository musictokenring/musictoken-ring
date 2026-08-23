/**
 * Withdrawal Service (retiros manuales en pesos colombianos)
 *
 * No hay desembolso automático: Mercado Pago no permite pagar a terceros,
 * y Wompi (la alternativa real para eso) igual necesitaría fondearse desde
 * la misma cuenta bancaria a la que se retira el saldo de Mercado Pago —
 * no hay atajo. Así que el flujo real es: el usuario pide un retiro, la
 * plataforma DESCUENTA su saldo jugable de inmediato (atómico, vía la RPC
 * reserve_cop_withdrawal — ver migración 023) para que nunca se pueda gastar
 * dos veces la misma plata, y le llega una notificación al operador con los
 * datos para pagar a mano (Nequi/transferencia) después de retirar ese
 * dinero de Mercado Pago a su cuenta bancaria.
 */

const { getCopPerUsd } = require('./mercadopago-service');

const MIN_WITHDRAWAL_COP = 10000; // mismo mínimo que los depósitos, por consistencia
const VALID_PAYOUT_METHODS = ['nequi', 'bre-b', 'bancolombia', 'daviplata', 'otro_banco'];

class WithdrawalService {
    constructor(supabase) {
        this.supabase = supabase;
        this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || null;
        this.telegramChatId = process.env.TELEGRAM_CHAT_ID || null;
        if (!this.telegramBotToken || !this.telegramChatId) {
            console.warn('[withdrawal-service] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID no configurados — las solicitudes de retiro se guardarán pero NO llegará notificación. Configúralos en las variables de entorno del backend.');
        }
    }

    /**
     * Valida los datos de pago mínimos según el método elegido.
     * No es una validación exhaustiva (no verificamos que la cuenta exista de
     * verdad) — es solo para no dejar pasar una solicitud claramente incompleta.
     */
    _validatePayoutDetails(payoutMethod, payoutDetails) {
        const d = payoutDetails || {};
        if (payoutMethod === 'nequi' || payoutMethod === 'bre-b' || payoutMethod === 'daviplata') {
            if (!d.telefono || !/^\d{10}$/.test(String(d.telefono).replace(/\D/g, ''))) {
                throw new Error('Falta un número de teléfono válido (10 dígitos) para este método de pago');
            }
        } else if (payoutMethod === 'bancolombia' || payoutMethod === 'otro_banco') {
            if (!d.numero_cuenta || !d.tipo_cuenta) {
                throw new Error('Faltan datos de la cuenta bancaria (número y tipo de cuenta)');
            }
            if (payoutMethod === 'otro_banco' && !d.banco) {
                throw new Error('Falta el nombre del banco');
            }
        }
    }

    /**
     * Crea una solicitud de retiro: valida, descuenta el saldo de forma
     * atómica (RPC), guarda el registro y notifica al operador por Telegram.
     * @param {Object} params - { userId, email, amountCop, payoutMethod, payoutDetails }
     */
    async createWithdrawalRequest({ userId, email, amountCop, payoutMethod, payoutDetails }) {
        if (!userId) throw new Error('userId es requerido');

        const cop = parseFloat(amountCop);
        if (!Number.isFinite(cop) || cop < MIN_WITHDRAWAL_COP) {
            throw new Error(`amount_cop inválido (mínimo ${MIN_WITHDRAWAL_COP.toLocaleString('es-CO')} COP)`);
        }

        if (!VALID_PAYOUT_METHODS.includes(payoutMethod)) {
            throw new Error(`payout_method inválido. Debe ser uno de: ${VALID_PAYOUT_METHODS.join(', ')}`);
        }

        this._validatePayoutDetails(payoutMethod, payoutDetails);

        const copPerUsd = await getCopPerUsd();
        const amountUsdEquivalent = cop / copPerUsd;

        // Descuento atómico del saldo jugable — si no hay fondos suficientes,
        // esto lanza y no queda ningún registro a medias.
        const { data: reserveData, error: reserveError } = await this.supabase
            .rpc('reserve_cop_withdrawal', {
                user_id_param: userId,
                amount_to_reserve: amountUsdEquivalent
            });

        if (reserveError) {
            // El mensaje de la excepción de Postgres ya es legible ("Saldo insuficiente: ...")
            throw new Error(reserveError.message || 'No se pudo reservar el saldo para el retiro');
        }

        const taken = Array.isArray(reserveData) ? reserveData[0] : reserveData;
        const takenFiat = parseFloat(taken?.taken_fiat || 0);
        const takenCredits = parseFloat(taken?.taken_credits || 0);
        const takenOnchain = parseFloat(taken?.taken_onchain || 0);

        const { data: request, error: insertError } = await this.supabase
            .from('withdrawal_requests_cop')
            .insert([{
                user_id: userId,
                amount_cop: Math.round(cop),
                amount_usd_equivalent: amountUsdEquivalent,
                rate_used: copPerUsd,
                payout_method: payoutMethod,
                payout_details: payoutDetails,
                taken_from_fiat: takenFiat,
                taken_from_credits: takenCredits,
                taken_from_onchain: takenOnchain,
                status: 'pending'
            }])
            .select()
            .single();

        if (insertError) {
            // El saldo YA se descontó — si el insert falla igual hay que devolverlo,
            // si no el usuario pierde saldo sin que quede ninguna solicitud registrada.
            console.error('[withdrawal-service] Fallo al insertar la solicitud tras reservar saldo, revirtiendo:', insertError.message);
            await this.supabase.rpc('refund_cop_withdrawal', {
                user_id_param: userId,
                refund_fiat: takenFiat,
                refund_credits: takenCredits,
                refund_onchain: takenOnchain
            });
            throw new Error('No se pudo registrar la solicitud de retiro. Tu saldo no fue descontado, intenta de nuevo.');
        }

        await this._notifyOperator(request, email);

        return request;
    }

    async _notifyOperator(request, email) {
        const d = request.payout_details || {};
        const detailsLines = Object.entries(d)
            .map(([k, v]) => `  • ${k}: ${v}`)
            .join('\n');

        const text =
            `🧾 *Nueva solicitud de retiro (COP)*\n\n` +
            `Usuario: ${email || request.user_id}\n` +
            `Monto a pagar: *${Number(request.amount_cop).toLocaleString('es-CO')} COP*\n` +
            `(equivale a ${Number(request.amount_usd_equivalent).toFixed(2)} USD de saldo jugable, ya descontado)\n` +
            `Método: ${request.payout_method}\n` +
            `Datos de pago:\n${detailsLines}\n\n` +
            `ID solicitud: ${request.id}\n` +
            `Recuerda retirar el saldo de Mercado Pago a tu cuenta bancaria antes de pagar, si aún no lo hiciste.`;

        try {
            await this._sendTelegram(text);
        } catch (err) {
            // No bloquear la solicitud si Telegram falla — ya quedó guardada
            // en la base de datos con status 'pending', se puede revisar ahí.
            console.error('[withdrawal-service] No se pudo enviar la notificación por Telegram:', err.message);
        }
    }

    async _sendTelegram(text) {
        if (!this.telegramBotToken || !this.telegramChatId) {
            throw new Error('Telegram no configurado (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)');
        }
        const resp = await fetch(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: this.telegramChatId,
                text,
                parse_mode: 'Markdown'
            }),
            signal: AbortSignal.timeout(8000)
        });
        if (!resp.ok) {
            const errBody = await resp.text().catch(() => '');
            throw new Error(`Telegram API status ${resp.status}: ${errBody}`);
        }
    }

    async listUserWithdrawalRequests(userId) {
        const { data, error } = await this.supabase
            .from('withdrawal_requests_cop')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return data || [];
    }

    async listPendingWithdrawalRequests() {
        const { data, error } = await this.supabase
            .from('withdrawal_requests_cop')
            .select('*, users(email)')
            .eq('status', 'pending')
            .order('created_at', { ascending: true });
        if (error) throw new Error(error.message);
        return data || [];
    }

    async markWithdrawalPaid(requestId, adminNotes) {
        const { data, error } = await this.supabase
            .from('withdrawal_requests_cop')
            .update({ status: 'paid', admin_notes: adminNotes || null, processed_at: new Date().toISOString() })
            .eq('id', requestId)
            .eq('status', 'pending') // no permitir marcar dos veces / sobre una ya rechazada
            .select()
            .single();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Solicitud no encontrada o ya procesada');
        return data;
    }

    async rejectWithdrawalRequest(requestId, adminNotes) {
        const { data: request, error: fetchError } = await this.supabase
            .from('withdrawal_requests_cop')
            .select('*')
            .eq('id', requestId)
            .eq('status', 'pending')
            .single();
        if (fetchError || !request) throw new Error('Solicitud no encontrada o ya procesada');

        // Devolver exactamente lo que se había descontado.
        const { error: refundError } = await this.supabase.rpc('refund_cop_withdrawal', {
            user_id_param: request.user_id,
            refund_fiat: request.taken_from_fiat,
            refund_credits: request.taken_from_credits,
            refund_onchain: request.taken_from_onchain
        });
        if (refundError) throw new Error(`No se pudo devolver el saldo: ${refundError.message}`);

        const { data, error } = await this.supabase
            .from('withdrawal_requests_cop')
            .update({ status: 'rejected', admin_notes: adminNotes || null, processed_at: new Date().toISOString() })
            .eq('id', requestId)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    }
}

module.exports = { WithdrawalService, MIN_WITHDRAWAL_COP, VALID_PAYOUT_METHODS };
