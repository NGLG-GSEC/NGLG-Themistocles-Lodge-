/* TAMEIO THEMISTOCLES 96 — Service Worker (offline-first app shell).
 * Bump VERSION (build_release.py does it) to invalidate caches on release. */
const VERSION = '1.0.1';
const CACHE = `t96-v${VERSION}`;
// PRECACHE-START
const PRECACHE = [
  './',
  'app.js',
  'assets/fonts/DejaVuSans-Bold-subset.ttf',
  'assets/fonts/DejaVuSans-subset.ttf',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/favicon-32.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/icon.svg',
  'assets/samples/Book2-sample.csv',
  'assets/samples/Book2-sample.json',
  'assets/samples/Book2-sample.xlsx',
  'assets/vendor/chart.umd.min.js',
  'assets/vendor/jspdf.umd.min.js',
  'assets/vendor/xlsx.full.min.js',
  'index.html',
  'js/analytics.js',
  'js/auth.js',
  'js/autocomplete.js',
  'js/charts.js',
  'js/config.js',
  'js/exporter.js',
  'js/importer.js',
  'js/reports.js',
  'js/search-core.js',
  'js/search-engine.js',
  'js/seed-data.js',
  'js/store.js',
  'js/tests.js',
  'js/treasury.js',
  'js/ui.js',
  'js/utils.js',
  'js/views/analytics.js',
  'js/views/dashboard.js',
  'js/views/docs.js',
  'js/views/forms.js',
  'js/views/import.js',
  'js/views/members.js',
  'js/views/profile.js',
  'js/views/reports.js',
  'js/views/settings.js',
  'js/views/shared.js',
  'js/views/tests.js',
  'js/views/treasury.js',
  'manifest.json',
  'styles.css',
  'worker.js'
];
// PRECACHE-END

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch((e) => console.warn('precache miss', u, e)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('t96-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: network first (fresh deploys), fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('index.html', copy)); return res; })
        .catch(() => caches.match('index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // App code and data (js, css, json, html): network first so a new deploy is picked up immediately; cache when offline.
  // Heavy static files (vendor libs, fonts, icons, samples): cache first.
  const heavy = /\/assets\//.test(url.pathname);
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (heavy && cached) return cached;
      try {
        const res = await fetch(req, heavy ? undefined : { cache: 'no-cache' });
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return cached || new Response('Εκτός σύνδεσης', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })
  );
});

self.addEventListener('message', (event) => { if (event.data === 'skipWaiting') self.skipWaiting(); });
