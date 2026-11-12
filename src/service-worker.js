import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { createPartialResponse } from "workbox-range-requests";

// Only the built, public app assets are admitted to this cache. User files stay
// in IndexedDB; Supabase and the local media-processing API use the network.
clientsClaim();
cleanupOutdatedCaches();

// Serve range requests from the full, precached demo audio. Local user audio
// uses blob URLs and never enters this handler or the service-worker cache.
registerRoute(
  ({ request, url }) =>
    request.method === "GET" &&
    url.origin === self.location.origin &&
    url.pathname.startsWith(new URL("audio/", self.registration.scope).pathname) &&
    url.pathname.endsWith(".mp3"),
  async ({ request }) => {
    const cached = await matchPrecache(request.url);
    if (!cached) return fetch(request);
    return request.headers.has("range") ? createPartialResponse(request, cached) : cached;
  },
);

precacheAndRoute(self.__WB_MANIFEST);
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/\/__onda-media(?:\/|$)/, /\/(?:api|auth)(?:\/|$)/],
  }),
);

// A new build waits until the listener explicitly asks to use it. Merely
// downloading a new worker must not interrupt a playing song.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
