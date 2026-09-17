// 信用卡还款提醒 · Service Worker
// 策略：network-first + 缓存兜底（离线也能打开）；/api/ 一律走网络不缓存。
// 版本号 CACHE 变更后，旧缓存会在 activate 时被清空。

const CACHE = 'ccr-v1';
const ASSETS = [
  '/',
  '/style.css',
  '/app.js',
  '/auth.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;       // 跨域不处理
  if (url.pathname.startsWith('/api/')) return;     // 接口永远走网络，不缓存

  e.respondWith(
    fetch(e.request).then(function (resp) {
      if (resp && resp.ok) {
        var clone = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
      }
      return resp;
    }).catch(function () {
      return caches.match(e.request);
    })
  );
});
