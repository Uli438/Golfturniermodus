// Birdino Service Worker — identisch fuer Dev- und Pro-Version.
// Cache-Name wird aus dem Installationspfad (scope) abgeleitet, damit sich
// beide Apps auf derselben Domain nicht gegenseitig die Caches loeschen.
var VERSION = '2026-07-19h';
var SCOPE_KEY = (self.registration && self.registration.scope || self.location.href)
  .replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/,'');
var CACHE = 'birdino-' + SCOPE_KEY + '-' + VERSION;
var CACHE_PREFIX = 'birdino-' + SCOPE_KEY + '-';
var SDK = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    var own = c.addAll(['./', './index.html']).catch(function () {});
    var sdk = Promise.all(SDK.map(function (u) {
      return c.add(new Request(u, { mode: 'no-cors' })).catch(function () {});
    }));
    return Promise.all([own, sdk]);
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      // Nur die EIGENEN alten Caches (gleicher Scope) loeschen, fremde App unberuehrt
      return Promise.all(keys.filter(function (k) {
        return k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Firebase-SDK: cache-first (versioniert, aendert sich nie)
  if (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0) {
    e.respondWith(caches.match(req).then(function (m) {
      return m || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
        return res;
      });
    }));
    return;
  }
  // Alles andere Fremde unangetastet (Firebase-Daten, Supabase, APIs)
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (m) {
        return m || caches.match('./index.html');
      });
    })
  );
});
