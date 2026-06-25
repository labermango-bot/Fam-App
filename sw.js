// sw.js — Service Worker für Offline-Betrieb von FamOrga.
//
// Strategie: NETWORK-FIRST für die App-Hülle. Wenn das Gerät online ist,
// wird immer die frische Version vom Server geladen (und im Cache aktualisiert)
// — so kommen Updates sofort an, ohne dass man die App mehrfach neu starten
// muss. Nur wenn das Netz nicht erreichbar ist, wird aus dem Cache bedient,
// damit die App offline trotzdem startet.
//
// (Früher war es cache-first; dadurch blieben Geräte hartnäckig auf einer
// alten Version hängen.)
const CACHE = "famorga-v38";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/store.js",
  "./js/ics.js",
  "./js/ai.js",
  "./js/sync.js",
  "./js/ferien-bw.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
];

self.addEventListener("install", (e) => {
  // Vorab cachen (für Offline-Start) und sofort die neue Version übernehmen.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // Nur eigene Dateien behandeln; Fremd-Hosts (z. B. KI-Worker) normal lassen.
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first: zuerst Netz versuchen, Cache aktualisieren; bei Fehler
  // (offline) aus dem Cache bedienen. Navigationen fallen auf index.html
  // zurück, damit die App auch offline aufgeht.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(e.request).then((cached) =>
          cached || (e.request.mode === "navigate" ? caches.match("./index.html") : undefined)
        )
      )
  );
});
