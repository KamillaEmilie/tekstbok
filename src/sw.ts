/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

const manifest = self.__WB_MANIFEST;

cleanupOutdatedCaches();
precacheAndRoute(manifest);
// Alle navigasjoner (også i flymodus) får den cachede index.html.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Ingen skipWaiting her: en ny versjon venter til appen startes på nytt,
// så den aldri byttes ut midt i scenemodus.
self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
    return;
  }
  if (data?.type === 'CHECK_PRECACHE') {
    const port = event.ports[0];
    event.waitUntil(
      (async () => {
        const missing: string[] = [];
        for (const e of manifest) {
          const url = typeof e === 'string' ? e : e.url;
          if (!(await matchPrecache(url))) missing.push(url);
        }
        port?.postMessage({ total: manifest.length, missing });
      })(),
    );
  }
});
