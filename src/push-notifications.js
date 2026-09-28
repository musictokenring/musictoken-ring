/*
 * Notificaciones push web (ver backend/push-service.js y sw.js).
 * window.MTRPush:
 *   support()        -> 'ok' | 'ios-install' (iPhone sin agregar a inicio) | 'unsupported'
 *   isEnabled()      -> Promise<boolean> (permiso concedido + suscripción activa)
 *   enable()         -> Promise<{ok, error}>  (pide permiso, suscribe y guarda en el backend)
 *   disable()        -> Promise<void>
 *   promptHtml(ctx)  -> HTML de una tarjetita "Activá las notificaciones" (o las
 *                       instrucciones de iPhone), para insertar donde convenga.
 */
(function () {
    'use strict';
    var BACKEND = function () {
        return (window.CONFIG && window.CONFIG.BACKEND_API) || (window.CreditsSystem && window.CreditsSystem.backendUrl) || 'https://musictoken-ring.onrender.com';
    };

    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }
    function isStandalone() {
        return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    }

    function support() {
        if (isIOS() && !isStandalone()) return 'ios-install';
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
        return 'ok';
    }

    function urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - base64String.length % 4) % 4);
        var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        var raw = atob(base64);
        var out = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
    }

    async function authHeaders() {
        var headers = { 'Content-Type': 'application/json' };
        try {
            var client = window.supabaseClient;
            var res = client ? await client.auth.getSession() : null;
            var token = res && res.data && res.data.session && res.data.session.access_token;
            if (token) headers.Authorization = 'Bearer ' + token;
        } catch (e) { /* sin sesión */ }
        return headers;
    }

    async function registration() {
        var reg = await navigator.serviceWorker.getRegistration('/');
        if (!reg) reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        return reg;
    }

    async function isEnabled() {
        if (support() !== 'ok' || Notification.permission !== 'granted') return false;
        try {
            var reg = await navigator.serviceWorker.getRegistration('/');
            if (!reg) return false;
            return !!(await reg.pushManager.getSubscription());
        } catch (e) { return false; }
    }

    async function enable() {
        var s = support();
        if (s === 'ios-install') return { ok: false, error: 'En iPhone primero agregá MusicToken Ring a tu pantalla de inicio.' };
        if (s !== 'ok') return { ok: false, error: 'Tu navegador no soporta notificaciones.' };
        try {
            var permission = await Notification.requestPermission();
            if (permission !== 'granted') return { ok: false, error: 'No diste permiso para las notificaciones. Podés habilitarlo desde la configuración del navegador.' };
            var keyResp = await fetch(BACKEND() + '/api/push/public-key');
            var keyData = await keyResp.json().catch(function () { return {}; });
            if (!keyResp.ok || !keyData.publicKey) return { ok: false, error: 'Las notificaciones todavía no están disponibles.' };
            var reg = await registration();
            var sub = await reg.pushManager.getSubscription();
            if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) });
            var r = await fetch(BACKEND() + '/api/push/subscribe', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ subscription: sub.toJSON() }) });
            var j = await r.json().catch(function () { return {}; });
            if (!r.ok || !j.ok) return { ok: false, error: j.error || ('Error ' + r.status) };
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message || 'No se pudieron activar las notificaciones.' };
        }
    }

    async function disable() {
        try {
            var reg = await navigator.serviceWorker.getRegistration('/');
            var sub = reg && await reg.pushManager.getSubscription();
            if (sub) {
                await fetch(BACKEND() + '/api/push/unsubscribe', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ endpoint: sub.endpoint }) });
                await sub.unsubscribe();
            }
        } catch (e) { /* noop */ }
    }

    // Tarjeta para ofrecer activarlas. ctx: 'challenge' (al crear un
    // desafío) o 'profile'. Devuelve '' si ya están activas o no aplica.
    function promptHtml(ctx) {
        var s = support();
        var lead = ctx === 'challenge'
            ? 'Activá las notificaciones y te avisamos al instante cuando acepten tu reto, aunque no tengas la página abierta.'
            : 'Te avisamos cuando acepten tus retos o tu rival te espere en la sala, aunque no tengas la página abierta.';
        if (s === 'unsupported') return '';
        if (s === 'ios-install') {
            return '<div class="mtr-push-prompt" style="margin-top:14px; padding:12px 14px; border-radius:14px; border:1px solid rgba(34,211,238,0.35); background:rgba(34,211,238,0.08); text-align:left;">' +
                '<div style="font-size:13px; font-weight:800; color:#a5f3fc;">🔔 Avisos en tu iPhone</div>' +
                '<div style="font-size:12px; color:#d1d5db; margin-top:4px; line-height:1.45;">' + lead + ' En iPhone: tocá <strong>Compartir</strong> → <strong>Agregar a pantalla de inicio</strong>, abrí MusicToken Ring desde ese ícono y activalas ahí.</div>' +
            '</div>';
        }
        return '<div class="mtr-push-prompt" style="margin-top:14px; padding:12px 14px; border-radius:14px; border:1px solid rgba(34,211,238,0.35); background:rgba(34,211,238,0.08); text-align:left; display:flex; gap:12px; align-items:center;">' +
            '<div style="flex:1; min-width:0;"><div style="font-size:13px; font-weight:800; color:#a5f3fc;">🔔 No te pierdas la batalla</div>' +
            '<div style="font-size:12px; color:#d1d5db; margin-top:3px; line-height:1.45;">' + lead + '</div></div>' +
            '<button type="button" onclick="window.MTRPush.enableFromPrompt(this)" style="flex-shrink:0; padding:9px 14px; border-radius:10px; border:none; cursor:pointer; font-size:12.5px; font-weight:800; color:#05060a; background:linear-gradient(90deg,#22d3ee,#a5f3fc);">Activar</button>' +
        '</div>';
    }

    async function enableFromPrompt(btn) {
        btn.disabled = true;
        btn.textContent = 'Activando...';
        var r = await enable();
        var box = btn.closest('.mtr-push-prompt');
        if (r.ok) {
            if (box) box.innerHTML = '<div style="font-size:13px; font-weight:700; color:#6ee7b7;">✅ Notificaciones activadas. Te vamos a avisar.</div>';
        } else {
            btn.disabled = false;
            btn.textContent = 'Activar';
            if (typeof window.showToast === 'function') window.showToast(r.error, 'error');
        }
    }

    // Si el usuario ya las activó alguna vez, re-sincronizar la suscripción
    // con el backend en cada visita (el navegador puede rotarla).
    async function resyncIfEnabled() {
        if (!(await isEnabled())) return;
        try {
            var reg = await navigator.serviceWorker.getRegistration('/');
            var sub = reg && await reg.pushManager.getSubscription();
            var headers = await authHeaders();
            if (sub && headers.Authorization) {
                await fetch(BACKEND() + '/api/push/subscribe', { method: 'POST', headers: headers, body: JSON.stringify({ subscription: sub.toJSON() }) });
            }
        } catch (e) { /* noop */ }
    }
    setTimeout(resyncIfEnabled, 6000);

    window.MTRPush = { support: support, isEnabled: isEnabled, enable: enable, disable: disable, promptHtml: promptHtml, enableFromPrompt: enableFromPrompt };
})();
