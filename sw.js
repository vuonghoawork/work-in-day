const CACHE_NAME = 'daily-log-v4';

const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

// Cài đặt và lưu các file cốt lõi vào bộ nhớ đệm
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Kích hoạt và dọn dẹp các cache phiên bản cũ
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Chiến lược Stale-While-Revalidate
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(e.request).then((cachedResponse) => {
        const fetchedResponse = fetch(e.request).then((networkResponse) => {
          // Hỗ trợ lưu cache cho cả Opaque Response (status === 0 từ CDN)
          if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });

        return cachedResponse || fetchedResponse;
      });
    })
  );
});
