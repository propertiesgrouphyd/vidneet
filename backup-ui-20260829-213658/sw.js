const SW_VERSION = "vidhwaan-neet-live-v1";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    self.clients.claim()
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  /*
   * LIVE / NETWORK-FIRST PWA
   *
   * No Cache API is used.
   * The application always requests current files
   * from the server.
   */
  event.respondWith(
    fetch(request, {
      cache: "no-store"
    })
  );
});
