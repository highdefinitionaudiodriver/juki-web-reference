const CACHE_NAME = "resident-record-web-v1";
const ASSETS = ["/", "/src/app.js", "/src/api.js", "/src/data.js", "/src/styles.css", "/manifest.webmanifest", "/icon.svg"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))));
self.addEventListener("fetch", (event) => { if (new URL(event.request.url).pathname.startsWith("/api/")) return; event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request))); });
