/*
 * Anagrammaton: Service Worker. Hält die App für den Start ohne Netz bereit.
 * Er legt nur eigene Dateien in den Cache: die Hülle sofort, eine Wortliste beim ersten Gebrauch.
 * Muster und Begründungen wie bei Hourbridge (dennismit2n.github.io/hourbridge).
 */
'use strict';

// Bei jedem Deploy, der eine der Dateien unten ändert, um 1 erhöhen.
const CACHE = 'anagrammaton-v3';
// Wortlisten in einem eigenen Cache: sie überleben jeden Versionssprung der Hülle und erneuern sich
// beim Gebrauch selbst (stale-while-revalidate). Nur erhöhen, wenn sich das Format der Listen ändert.
const WOERTER = 'anagrammaton-woerter-v1';

// Genau die Dateien, die index.html, der Worker und das Manifest laden. Eine Datei, die es nicht gibt,
// ließe addAll und damit die ganze Installation scheitern. Die Wortlisten (je etwa 0,5 MB) kommen erst
// in den Cache, wenn eine Sprache zum ersten Mal gebraucht wird.
const SHELL = [
  './',
  './index.html',
  './engine.js',
  './worker.js',
  './manifest.webmanifest',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png'
];

// Am HTTP-Cache des Browsers vorbei laden (cache: 'reload'): GitHub Pages schickt jede Datei mit
// max-age=600, sonst landete womöglich eine zehn Minuten alte Fassung im Offline-Cache.
function fillShell(cache) {
  return cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(fillShell).then(() => self.skipWaiting()));
});

// Nur eigene alte Caches löschen. Cache Storage gehört dem ganzen Origin dennismit2n.github.io,
// die Caches der anderen Werkzeuge dürfen nicht angefasst werden.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('anagrammaton-') && k !== CACHE && k !== WOERTER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fehlt ./index.html, obwohl das Netz antwortet, holt der Worker die ganze Hülle nach.
async function healShell(cache) {
  const index = await cache.match('./index.html');
  if (!index) { await fillShell(cache); }
}

async function answer(e) {
  const req = e.request;
  const isNav = req.mode === 'navigate';
  const cache = await caches.open(new URL(req.url).pathname.includes('/woerter/') ? WOERTER : CACHE);
  const hit = await cache.match(req, { ignoreSearch: isNav });

  // Netzantwort holen und, wenn sie in Ordnung ist, für das nächste Mal ablegen (nie ein 404).
  // Eine Navigation fragt immer beim Server nach (bedingte Anfrage, meist nur 304).
  let stored = null;
  const net = fetch(req, isNav ? { cache: 'no-cache' } : undefined).then(r => {
    if (r.ok) {
      // Navigationen ohne Abfrage ablegen, sonst legte jeder geteilte Link eine eigene Kopie an.
      let key = req;
      if (isNav) { const u = new URL(req.url); u.search = ''; key = u.href; }
      stored = cache.put(key, r.clone()).catch(console.error);
    }
    return r;
  });

  const after = net.then(
    () => Promise.resolve(stored).then(() => (isNav ? healShell(cache).catch(console.error) : null)),
    () => null
  );
  e.waitUntil(after);

  // Stale-while-revalidate: den Altbestand sofort liefern, die Netzantwort erneuert ihn nebenbei.
  if (hit) { return hit; }

  try {
    return await net;
  } catch (err) {
    if (isNav) {
      const index = await cache.match('./index.html');
      if (index) { return index; }
    }
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) { return; }
  // Nur Anfragen unterhalb von /anagrammaton/, die Nachbar-Werkzeuge haben ihre eigenen Worker.
  if (!new URL(req.url).pathname.startsWith(new URL('./', self.location).pathname)) { return; }
  e.respondWith(answer(e));
});
