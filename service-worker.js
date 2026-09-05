"use strict";

// アプリのファイルを変更したときは、この版も上げる。
const VERSION = "v8";
const BASE = self.registration.scope;
const PREFIX = `activity-mood-shell:${BASE}:`;
const CACHE = PREFIX + VERSION;
const FILES = ["index.html", "print.html", "styles/main.css", "styles/print.css", "scripts/app.js", "scripts/date-time.js", "scripts/db.js", "scripts/records.js", "scripts/week.js", "scripts/print.js", "scripts/backup.js", "scripts/backup-ui.js", "scripts/pwa.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
const URLS = new Set(FILES.map(file => new URL(file, BASE).href));

self.addEventListener("install", event => {
  // 全ファイルが取得できるまで新しい版を使わない。
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...URLS].map(url => new Request(url, { cache: "reload" })))));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    // このアプリ・この設置先の旧画面キャッシュだけを削除する。
    // IndexedDBやJSONバックアップには触れない。
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener("message", event => {
  // 明示的な更新操作後だけ、新しい画面キャッシュを直ちに有効化する。
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== new URL(BASE).origin) return;
  const root = new URL(BASE).pathname;
  if (url.pathname === root) url.pathname += "index.html";
  url.search = ""; url.hash = "";
  if (!URLS.has(url.href)) return;
  // 同じ版のHTMLとJSをまとめて使い、通信断でも同じ画面を開く。
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(url.href);
    return cached || fetch(request);
  })());
});
