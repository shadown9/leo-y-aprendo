/* Leo y Aprendo — service worker: la app completa funciona sin internet. Sube CACHE_VERSION cuando cambies archivos. */
const CACHE_VERSION = 'lya-v29';
const SHELL = ['./', './index.html', './styles.css', './data.js', './app.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Fonts (Google) → cache as they arrive, so they also work offline after first load
  if (url.hostname.includes('fonts.g')) { e.respondWith(caches.open('lya-fonts').then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; }).catch(() => r)))); return; }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Voces grabadas: se guardan la primera vez que suenan (así funcionan sin internet después)
  if ((url.pathname.includes('/voces/') || url.pathname.includes('/sonidos/') || url.pathname.includes('/canciones/')) && /\.(mp3|json)$/.test(url.pathname) && !url.pathname.endsWith('index.json')) { e.respondWith(caches.open('lya-voces').then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; })))); return; }
  // App shell: cache first, then network; update cache in the background
  e.respondWith(caches.match(e.request).then(cached => { const net = fetch(e.request).then(res => { if (res && res.ok) caches.open(CACHE_VERSION).then(c => c.put(e.request, res.clone())); return res; }).catch(() => cached); return cached || net; }));
});
