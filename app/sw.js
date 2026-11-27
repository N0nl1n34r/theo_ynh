const CACHE_NAME = 'theo-beta-shell-v6';
const SHELL_ASSETS = [
  './',
  './index.html',
  './education.js',
  './presets.js',
  './admin.js',
  './manifest.webmanifest',
  './theo-icon.png',
  './supabase.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first für App-Shell: neue Deployments sind sofort live; im Flugmodus springt der Cache ein.
// API- und Supabase-Requests werden niemals im Service-Worker gecacht (dafür dient localStorage + LWW-Sync).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const isShellDoc =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/app/') ||
    url.pathname.endsWith('/app') ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/manifest.webmanifest') ||
    url.pathname.endsWith('/theo-icon.png') ||
    url.pathname.endsWith('/supabase.min.js') ||
    url.pathname.endsWith('/education.js') ||
    url.pathname.endsWith('/presets.js') ||
    url.pathname.endsWith('/admin.js');

  if (!isShellDoc) return;

  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)));
        }
        return resp;
      })
      .catch(() =>
        caches.match(event.request).then((hit) => hit || (event.request.mode === 'navigate' ? caches.match('./index.html') : undefined))
      )
  );
});
