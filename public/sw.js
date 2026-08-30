const SW_VERSION = "vidhwaan-neet-live-v9";

self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {

    event.waitUntil(
        Promise.all([
            self.clients.claim(),

            caches.keys().then((keys) =>
                Promise.all(
                    keys
                        .filter(
                            (key) =>
                                key !== SW_VERSION
                        )
                        .map(
                            (key) =>
                                caches.delete(key)
                        )
                )
            )
        ])
    );
});


self.addEventListener("fetch", (event) => {

    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);

    if (url.origin !== self.location.origin) {
        return;
    }

    // Never cache application JSON.
    // The app must always see the newest daily content.
    if (
        url.pathname.endsWith(".json") ||
        url.pathname.includes("/data/")
    ) {
        event.respondWith(
            fetch(request, {
                cache: "no-store"
            })
        );

        return;
    }

    // Network first for the rest of the application.
    event.respondWith(
        fetch(request, {
            cache: "no-store"
        }).catch(
            () => caches.match(request)
        )
    );
});
