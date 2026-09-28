/**
 * Notificaciones push web (sql/push-notifications.sql).
 *
 * - Claves VAPID: se toman de VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY si están
 *   en el entorno; si no, de push_config; y si tampoco existen, se generan
 *   acá una sola vez y se guardan en push_config (tabla sin políticas RLS:
 *   solo el backend la lee). Así no hace falta configurar nada en Render.
 * - Envío best-effort: nunca debe romper el flujo que lo dispara. Las
 *   suscripciones que el navegador dio de baja (404/410) se borran.
 */
const crypto = require('crypto');

let webpush = null;
try {
    webpush = require('web-push');
} catch (e) {
    console.warn('[push] Módulo web-push no instalado -- notificaciones push desactivadas.');
}

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soporte@musictokenring.xyz';

function base64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateVapidKeys() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pubJwk = publicKey.export({ format: 'jwk' });
    const privJwk = privateKey.export({ format: 'jwk' });
    // Clave pública "raw" sin comprimir: 0x04 || X || Y (lo que espera el navegador).
    const raw = Buffer.concat([
        Buffer.from([0x04]),
        Buffer.from(pubJwk.x, 'base64'),
        Buffer.from(pubJwk.y, 'base64')
    ]);
    return { publicKey: base64url(raw), privateKey: privJwk.d };
}

class PushService {
    constructor(supabase) {
        this.supabase = supabase;
        this.keys = null;
        this.ready = null;
    }

    async init() {
        if (this.ready) return this.ready;
        this.ready = (async () => {
            if (!webpush) return false;
            let keys = null;
            if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
                keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
            } else {
                const { data, error } = await this.supabase.from('push_config').select('*').eq('id', 1).maybeSingle();
                if (error) {
                    if (error.code !== '42P01') console.error('[push] No se pudo leer push_config:', error.message);
                    return false;
                }
                if (data) {
                    keys = { publicKey: data.vapid_public_key, privateKey: data.vapid_private_key };
                } else {
                    const generated = generateVapidKeys();
                    // on conflict do nothing: si dos instancias arrancan a la
                    // vez, gana una y la otra relee la misma.
                    await this.supabase.from('push_config').upsert([{ id: 1, vapid_public_key: generated.publicKey, vapid_private_key: generated.privateKey }], { onConflict: 'id', ignoreDuplicates: true });
                    const { data: stored } = await this.supabase.from('push_config').select('*').eq('id', 1).maybeSingle();
                    if (!stored) return false;
                    keys = { publicKey: stored.vapid_public_key, privateKey: stored.vapid_private_key };
                    console.log('[push] Claves VAPID generadas y guardadas en push_config');
                }
            }
            webpush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);
            this.keys = keys;
            return true;
        })().catch((e) => {
            console.error('[push] Error inicializando:', e.message);
            this.ready = null;
            return false;
        });
        return this.ready;
    }

    async getPublicKey() {
        const ok = await this.init();
        return ok && this.keys ? this.keys.publicKey : null;
    }

    async subscribe(userId, subscription, userAgent) {
        if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
            throw new Error('Suscripción inválida');
        }
        if (!/^https:\/\//.test(subscription.endpoint)) throw new Error('Endpoint inválido');
        const { error } = await this.supabase.from('push_subscriptions').upsert([{
            user_id: userId,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            user_agent: userAgent ? String(userAgent).slice(0, 300) : null,
            failure_count: 0
        }], { onConflict: 'endpoint' });
        if (error) throw error;
    }

    async unsubscribe(userId, endpoint) {
        await this.supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
    }

    async hasSubscription(userId) {
        const { data } = await this.supabase.from('push_subscriptions').select('id').eq('user_id', userId).limit(1);
        return !!(data && data.length);
    }

    /**
     * payload: { title, body, url, tag }. Devuelve cuántos envíos salieron.
     */
    async sendToUser(userId, payload) {
        try {
            if (!userId || !(await this.init())) return 0;
            const { data: subs } = await this.supabase.from('push_subscriptions').select('*').eq('user_id', userId);
            let sent = 0;
            for (const sub of subs || []) {
                try {
                    await webpush.sendNotification(
                        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                        JSON.stringify(payload),
                        { TTL: 300, urgency: 'high', topic: payload.tag ? String(payload.tag).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) : undefined }
                    );
                    sent++;
                    await this.supabase.from('push_subscriptions').update({ last_success_at: new Date().toISOString(), failure_count: 0 }).eq('id', sub.id);
                } catch (err) {
                    const code = err && err.statusCode;
                    if (code === 404 || code === 410) {
                        await this.supabase.from('push_subscriptions').delete().eq('id', sub.id);
                    } else {
                        console.error('[push] Envío falló:', code || '', err && err.message);
                        await this.supabase.from('push_subscriptions').update({ failure_count: (sub.failure_count || 0) + 1 }).eq('id', sub.id);
                    }
                }
            }
            return sent;
        } catch (e) {
            console.error('[push] sendToUser:', e.message);
            return 0;
        }
    }
}

module.exports = { PushService, generateVapidKeys };
