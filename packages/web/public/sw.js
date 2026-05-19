// Minimal offline-tolerant service worker for Project Neigo.
// Navigation requests are network-first so app updates appear immediately.
const CACHE = 'neigo-v5';
const SHELL = ['/', '/offline.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

// ── Web Push ─────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: 'Project Neigo', body: event.data?.text() ?? '' };
  }
  const title = data.title ?? 'Project Neigo';
  const options = {
    body: data.body ?? '',
    icon: '/icon-192.svg',
    badge: '/icon-72.svg',
    tag: data.tag ?? 'neigo-push',
    renotify: false,
    data: { url: data.data?.sessionId ? `/chat/${data.data.sessionId}` : '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const c of list) {
          if (c.url.includes(url) && 'focus' in c) return c.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});

// ── Fetch cache ───────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only handle http/https — skip chrome-extension, blob, data, etc.
  if (!url.protocol.startsWith('http')) return;
  if (req.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return; // never cache API
  if (req.headers.get('accept')?.includes('text/event-stream')) return;

  // Always prefer network for navigations so new deployments are visible quickly.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/offline.html'))),
    );
    return;
  }

  // Only cache static same-origin assets (scripts/styles/images/fonts).
  const isStaticAsset =
    url.origin === self.location.origin &&
    (
      url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/sprites/') ||
      /\.(?:js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)$/i.test(url.pathname)
    );
  if (!isStaticAsset) {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const wantsHtml = req.headers.get('accept')?.includes('text/html');
        if (wantsHtml && url.origin === self.location.origin) {
          return (await caches.match('/offline.html')) || new Response('Offline', { status: 503 });
        }
        return new Response('Offline', { status: 503 });
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req)
          .then((res) => {
            if (res.ok && url.origin === self.location.origin) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
            }
            return res;
          })
          .catch(() => new Response('', { status: 503 })),
    ),
  );
});
