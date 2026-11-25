// The Holdover loader service worker.
// 1) Android share target: AB / GeoBallistics "Share" -> The Holdover lands here as a POST.
//    Stash the CSV(s) in a cache, then open the loader, which picks them up.
// 2) Keeps the loader working with no cell signal at the range.
const SHELL = 'holdover-shell-v5';
const FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const box = await caches.open('holdover-share');
      let n = 0;
      for (const f of form.getAll('csv')) {
        if (!f || typeof f === 'string') continue;
        await box.put('./_shared/' + Date.now() + '-' + (n++) + '-' + encodeURIComponent(f.name || 'export.csv'),
                      new Response(await f.text()));
      }
      const txt = form.get('text');                     // some apps share the card as text, not a file
      if (n === 0 && txt && /Range/.test(txt))
        await box.put('./_shared/' + Date.now() + '-text.csv', new Response(txt));
      return Response.redirect('./?share=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // network first (so updates show up), cached copy when offline
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match('./index.html'))));
});
