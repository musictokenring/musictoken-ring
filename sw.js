/*
 * Service worker de MusicToken Ring -- SOLO notificaciones push.
 * A propósito no intercepta fetch ni cachea nada: el sitio carga siempre
 * igual que sin service worker (así no quedan versiones viejas pegadas).
 */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
    var data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'MusicToken Ring', body: event.data ? event.data.text() : '' }; }
    var title = data.title || 'MusicToken Ring';
    event.waitUntil(self.registration.showNotification(title, {
        body: data.body || '',
        icon: '/assets/icons/icon-192.png',
        badge: '/assets/icons/badge-72.png',
        tag: data.tag || undefined,
        renotify: !!data.tag,
        requireInteraction: true,
        data: { url: data.url || '/' }
    }));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    var url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
            var c = clientList[i];
            if (c.url.indexOf(self.location.origin) === 0 && 'focus' in c) {
                c.navigate(url).catch(function () {});
                return c.focus();
            }
        }
        return self.clients.openWindow(url);
    }));
});
