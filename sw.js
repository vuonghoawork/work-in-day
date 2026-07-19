const CACHE_NAME = 'daily-log-v2'; // Nâng cấp version cache
const ASSETS = [
  '/',
  'index.html',
  'manifest.json'
];

// Cài đặt và ép buộc activate ngay lập tức
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

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

// CHIẾN LƯỢC TỐI ƯU: Cache First (Lấy từ cache trước, nếu không có mới gọi mạng)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse; // Trả về ngay lập tức, tốc độ ~0ms
      }
      return fetch(e.request);
    })
  );
});
