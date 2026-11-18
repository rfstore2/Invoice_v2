"use strict";

/*
 * Naikkan versi setiap mengubah file aplikasi.
 * Semua aset lokal: tidak ada ketergantungan CDN.
 */
const PREFIX = "rpayment-";
const CACHE = `${PREFIX}v3`;

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg"
];

const URL_ASET = new Set(
  ASSETS.map(path => new URL(path, self.registration.scope).href)
);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    /*
     * Hindari HTTP cache lama saat memasang versi service worker baru.
     * Jika ada aset gagal, worker lama tetap dapat digunakan.
     */
    await cache.addAll(
      ASSETS.map(path => new Request(
        new URL(path, self.registration.scope),
        { cache: "reload" }
      ))
    );

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith(PREFIX) && key !== CACHE)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);

  if (url.origin !== scope.origin ||
      !url.pathname.startsWith(scope.pathname)) return;

  /*
   * Navigasi: coba jaringan dahulu agar HTML terbaru diterima.
   * Saat offline, gunakan halaman yang sudah tersimpan.
   */
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request, { cache: "no-cache" });
        if (response.ok) {
          await cache.put(
            new URL("./index.html", self.registration.scope),
            response.clone()
          );
          return response;
        }
      } catch (_) {
        // Tidak ada jaringan; lanjutkan dengan halaman offline.
      }

      return await cache.match("./index.html") ||
        Response.error();
    })());
    return;
  }

  if (!URL_ASET.has(url.href)) return;

  /*
   * Aset mengikuti versi cache agar CSS dan JS konsisten.
   * Versi baru dimuat saat CACHE dinaikkan.
   */
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
