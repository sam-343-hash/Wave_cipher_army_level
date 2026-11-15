// Service worker: cache-first for the app shell so FIELDLINE loads with no network. No network requests are made on its own.
const VERSION = 'fieldline-v1.0.1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'css/app.css',
  'js/app.js', 'js/ui.js', 'js/state.js', 'js/crypto.js', 'js/chain.js', 'js/pkg.js', 'js/wav.js', 'js/signal.js', 'js/recorder-worklet.js',
  'js/db.js', 'js/vault.js', 'js/sop.js', 'js/translate.js', 'js/gesture.js', 'js/camera-evidence.js', 'js/views_core.js', 'js/views_tools.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return; // never intercept cross-origin or non-GET requests
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(VERSION).then(ca => ca.put(r, c)); } return res; }).catch(() => r.mode === 'navigate' ? caches.match('index.html') : new Response('Offline and not cached', { status: 503, statusText: 'Offline' }))));
});
self.addEventListener('message', e => { if (e.data === 'status') caches.has(VERSION).then(ok => e.source && e.source.postMessage({ type: 'sw-status', ok, version: VERSION })); });
