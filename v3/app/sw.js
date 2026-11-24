/* Fonctionnement hors ligne : tout le programme est gardé sur l'appareil.
   Le build (tools/build.mjs) remplace VERSION et FILES. Les données et les vidéos ne passent jamais ici. */
const VERSION = "dev";
const FILES = ["./", "./index.html"];

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
