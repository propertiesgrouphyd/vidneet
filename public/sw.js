"use strict";

const SW_VERSION = "vidhwaan-neet-live-v15";

self.addEventListener("install", event => {
    event.waitUntil(
        self.skipWaiting()
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(),

            caches.keys().then(keys =>
                Promise.all(
                    keys.map(key =>
                        caches.delete(key)
                    )
                )
            )
        ])
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);

    if (url.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        fetch(request, {
            cache: "no-store"
        })
    );
});
