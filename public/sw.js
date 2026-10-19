// Service worker: bare push-varsler. Ingen mellomlagring av appen – den hentes alltid fersk fra nettet.
// Eneste som lagres, er hvor et varsel skal åpne (cachen «sulamitten-varsel», hentes og slettes av appen i main.tsx).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const MAAL = () => `${self.registration.scope}varsel-maal`;

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { tekst: e.data ? e.data.text() : '' }; }
  const base = self.registration.scope;
  e.waitUntil(self.registration.showNotification(d.tittel || 'Sulamitten', {
    body: d.tekst || '',
    icon: `${base}ikon-192.png`,
    data: { url: base + (d.url || '') },
  }));
});

// Trykk på varselet åpner appen på riktig side. To veier, fordi iPhone ofte åpner startsiden og ikke lenken:
//  1. Målet huskes i cachen – appen leser det når den starter eller kommer fram (main.tsx).
//  2. Er appen allerede åpen, får den beskjed direkte (postMessage) og bytter side selv.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    try {
      const cache = await caches.open('sulamitten-varsel');
      await cache.put(MAAL(), new Response(JSON.stringify({ url, tid: Date.now() }), { headers: { 'Content-Type': 'application/json' } }));
    } catch { /* uten cache virker fortsatt vei 2 og lenken i openWindow */ }
    const vinduer = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const vindu = vinduer.find((v) => 'focus' in v);
    if (vindu) {
      vindu.postMessage({ type: 'aapne', url });
      await vindu.focus().catch(() => {});
      return;
    }
    await self.clients.openWindow(url);
  })());
});
