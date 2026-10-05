/* Bardic offline app shell. Hand-written, no dependencies.
 *
 * What it does: lets the app open with no server by keeping the built files (the SPA shell index.html and the hashed
 * /assets/*) and the web fonts in Cache Storage.
 * What it never does: touch /api/**. Downloaded audio, text and timings are served by the page from its own store
 * (src/offline), not by this worker; every /api request, every non-GET request and every other origin's request
 * (except the font hosts) goes to the network untouched.
 *
 * Versioning: sw.ts registers this file as /sw.js?v=<name of the built entry script>. A new build has a new entry file
 * name, so it is a new worker URL: it installs next to the old one, fills its own cache `bardic-app-<v>`, and on
 * activation deletes every other `bardic-app-*` cache. It waits (never takes over a page by itself) until the page asks
 * for it with SKIP_WAITING, so an update never reloads anything under the listener. The first install does take control.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const APP_CACHE = 'bardic-app-' + VERSION;
const FONT_CACHE = 'bardic-fonts-v1';
const SHELL = '/index.html';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const sameFiles = (text, from) => {
  // built files named inside a built file: "/assets/index-AbC.js", "assets/x.css", or "./Chunk-AbC.js" (a lazily loaded chunk,
  // relative to the file it is named in)
  const found = new Set();
  // Minifiers may use any JavaScript string delimiter, including a static template literal.
  const abs = /(?:["'`(=]|\/)(\/?assets\/[A-Za-z0-9_.\-]+\.(?:js|css|woff2?|svg|png|jpg|webp))/g;
  const rel = /(["'`])(\.\/[A-Za-z0-9_.\-]+\.(?:js|css))\1/g;
  let m;
  while ((m = abs.exec(text))) found.add(m[1].startsWith('/') ? m[1] : '/' + m[1]);
  while ((m = rel.exec(text))) {
    const u = new URL(m[2], new URL(from, self.location.origin));
    if (u.origin === self.location.origin) found.add(u.pathname);
  }
  return found;
};

async function precache() {
  const cache = await caches.open(APP_CACHE);
  const res = await fetch(SHELL, { cache: 'no-store' });
  if (!res.ok) throw new Error('shell ' + res.status);
  const html = await res.clone().text();
  await cache.put(SHELL, res);
  const queue = [...sameFiles(html, SHELL), '/manifest.webmanifest', '/icon.svg', '/icon-180.png', '/icon-192.png', '/icon-512.png'];
  const seen = new Set(queue);
  // follow the built scripts one level at a time: lazily loaded chunks are named inside them
  for (let i = 0; i < queue.length && i < 300; i++) {
    const url = queue[i];
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) continue;
      await cache.put(url, r.clone());
      if (url.endsWith('.js') || url.endsWith('.css')) {
        for (const next of sameFiles(await r.text(), url)) if (!seen.has(next)) (seen.add(next), queue.push(next));
      }
    } catch (e) {
      /* a file that cannot be fetched now is cached the first time the page asks for it */
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precache().then(() => {
      // the very first worker takes over at once; a replacement waits for the page to say so
      if (!self.registration.active) return self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith('bardic-app-') && name !== APP_CACHE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const isFont = (url) => FONT_HOSTS.includes(url.hostname);

async function staleWhileRevalidate(request) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return hit || (await fresh) || Response.error();
}

async function cacheFirst(request) {
  const cache = await caches.open(APP_CACHE);
  const hit = await cache.match(request, { ignoreSearch: false });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.status === 200 && res.type === 'basic') cache.put(request, res.clone());
  return res;
}

async function navigation(request) {
  const cache = await caches.open(APP_CACHE);
  const shell = () => cache.match(SHELL);
  try {
    // the network first, so an online visit always gets the current build; a slow or dead network falls back to the shell
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 4000));
    const res = await Promise.race([fetch(request), timeout]);
    if (res && res.ok) return res;
    return (await shell()) || res;
  } catch (e) {
    return (await shell()) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    if (isFont(url)) event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return; // never: the app's own store serves held audio
  if (url.pathname === '/sw.js') return;
  if (request.headers.has('range')) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigation(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
