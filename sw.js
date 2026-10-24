/* Leo y Aprendo — service worker: la app completa funciona sin internet. Sube CACHE_VERSION cuando cambies archivos. */
const CACHE_VERSION = 'lya-v44';
const SHELL = ['./', './index.html', './styles.css', './data.js', './app.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Fonts (Google) → cache as they arrive, so they also work offline after first load
  if (url.hostname.includes('fonts.g')) { e.respondWith(caches.open('lya-fonts').then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { c.put(e.request, res.clone()); return res; }).catch(() => r)))); return; }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Letra de las canciones: primero la red (cambia cuando se regraba una canción), la guardada solo sin internet
  if (url.pathname.includes('/canciones/') && url.pathname.endsWith('.json')) { e.respondWith(caches.open('lya-voces').then(c => fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => c.match(e.request)))); return; }
  // Audios (voces, sonidos, canciones): se guardan completos la primera vez y se sirven con soporte de rangos.
  // El reproductor del teléfono pide el mp3 por trozos (cabecera Range); si se le devuelve la respuesta completa guardada, play() falla y la app cae a la voz leyendo.
  if ((url.pathname.includes('/voces/') || url.pathname.includes('/sonidos/') || url.pathname.includes('/canciones/')) && url.pathname.endsWith('.mp3')) {
    e.respondWith((async () => {
      const c = await caches.open('lya-voces'); const key = url.href; let full = await c.match(key);
      if (!full) { const res = await fetch(key); if (!res.ok) return res; await c.put(key, res.clone()); full = await c.match(key) || res; }
      const range = e.request.headers.get('range'); if (!range) return full;
      const buf = await full.arrayBuffer(); const m = /bytes=(\d+)-(\d*)/.exec(range); const start = m ? +m[1] : 0; const end = m && m[2] ? Math.min(+m[2], buf.byteLength - 1) : buf.byteLength - 1;
      return new Response(buf.slice(start, end + 1), { status: 206, headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
    })()); return; }
  if ((url.pathname.includes('/voces/') || url.pathname.includes('/sonidos/')) && url.pathname.endsWith('.json') && !url.pathname.endsWith('index.json')) { e.respondWith(caches.open('lya-voces').then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; })))); return; }
  // App shell: cache first, then network; update cache in the background
  e.respondWith(caches.match(e.request).then(cached => { const net = fetch(e.request).then(res => { if (res && res.ok) caches.open(CACHE_VERSION).then(c => c.put(e.request, res.clone())); return res; }).catch(() => cached); return cached || net; }));
});
