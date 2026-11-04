/* Service worker: permite usar la app sin conexión.
   Estrategia: red primero (así ves las actualizaciones), con respaldo en caché. */
const CACHE = 'finanzas-v17';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './sync.js', './firebase-config.js', './manifest.webmanifest', './icon-v2.svg', './icon-v2-180.png', './icon-v2-192.png', './icon-v2-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const u = new URL(req.url);
  const ok = u.origin === self.location.origin || (u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/')) // SDK de Firebase
    || u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com'; // tipografías
  if (req.method !== 'GET' || !ok) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
