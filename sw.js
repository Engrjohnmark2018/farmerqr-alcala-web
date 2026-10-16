/* FarmerQR-Alcala — service worker
 *
 * Makes the web app installable as a PWA and keeps the whole app shell
 * available offline (the QR scanner runs fully on-device; only opening
 * the farmer's profile page needs internet).
 *
 * Strategy:
 *   - Navigations: network-first (fresh when online), cached index offline.
 *   - Same-origin static assets: cache-first with background refresh.
 *   - Other origins (e.g. lgu-rsbsa.da.gov.ph): never intercepted.
 */

var CACHE = "farmerqr-alcala-v1.1.1";

var ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./lib/html5-qrcode.min.js",
  "./manifest.json",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        return cache.addAll(ASSETS);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) { return key !== CACHE; })
            .map(function (key) { return caches.delete(key); })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: try network first, fall back to the cached app shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            return hit || caches.match("./index.html");
          });
        })
    );
    return;
  }

  // Static assets: cache-first, refresh in the background.
  event.respondWith(
    caches.match(req).then(function (cached) {
      var fetched = fetch(req)
        .then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
          }
          return res;
        })
        .catch(function () {
          return cached;
        });
      return cached || fetched;
    })
  );
});
