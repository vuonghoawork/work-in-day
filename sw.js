const CACHE_NAME = 'daily-log'; // Phiên bản cache
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png', // Thêm icon vào đây để cache
  './icons/icon-512x512.png'
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

// Chiến lược Stale-While-Revalidate: Tải cực nhanh từ Cache, cập nhật ngầm từ Network
self.addEventListener('fetch', (e) => {
  // Chỉ áp dụng cache cho các request thông thường (GET)
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(e.request).then((cachedResponse) => {
        // Tạo một request fetch để cập nhật cache ngầm
        const fetchedResponse = fetch(e.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // Xử lý fallback khi mất mạng hoàn toàn và request điều hướng (navigate)
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });

        // Trả về kết quả từ cache ngay lập tức nếu có, nếu không thì đợi network
        return cachedResponse || fetchedResponse;
      });
    })
  );
});
