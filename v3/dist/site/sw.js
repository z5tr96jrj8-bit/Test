/* Fonctionnement hors ligne : tout le programme est gardé sur l'appareil.
   Le build (tools/build.mjs) remplace VERSION et FILES. Les données et les vidéos ne passent jamais ici. */
const VERSION = "f694ef31f5c5";
const FILES = ["./","css/app.css","css/theme.css","fonts/JetBrainsMono-500.woff2","fonts/JetBrainsMono-700.woff2","fonts/OpenSans-400.woff2","fonts/OpenSans-600.woff2","fonts/OpenSans-700.woff2","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/icon.png","index.html","js/csv.js","js/demo.js","js/download.js","js/home.js","js/legacy.js","js/main.js","js/match.js","js/model.js","js/pad.js","js/player.js","js/settings.js","js/shortcuts.js","js/sort.js","js/state.js","js/store.js","js/sync.js","js/ui-common.js","js/util.js","js/videostore.js","manifest.webmanifest"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open("rl-" + VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf("rl-") === 0 && k !== "rl-" + VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(r).catch(function () { return r.mode === "navigate" ? caches.match("./index.html") : Response.error(); });
  }));
});
