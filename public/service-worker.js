// One-release cleanup worker for visitors registered on the former path.
function isScolyAppCache(name) {
  const scope = self.registration.scope;
  const isWorkboxCache = /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name);
  const isLegacyScolyCache = /scoly|vite-pwa|workbox|precache|runtime-cache|offline/i.test(name);
  return (isWorkboxCache && name.endsWith(scope)) || isLegacyScolyCache;
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const obsoleteCaches = cacheNames.filter(isScolyAppCache);
        await Promise.allSettled(obsoleteCaches.map((name) => caches.delete(name)));
        await self.clients.claim();
        const clients = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(clients.map((client) => client.navigate(client.url)));
      } finally {
        await self.registration.unregister();
      }
    })(),
  );
});