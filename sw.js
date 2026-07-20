const CACHE_NAME = 'daily-log-v4'; // Đổi tên phiên bản để trình duyệt cập nhật cache mới
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn-icons-png.flaticon.com/512/5499/5499335.png' // Cache luôn icon từ CDN để tăng tốc độ hiển thị
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
  // Chỉ xử lý các request GET thông thường (bỏ qua các request của extension hoặc POST nếu có)
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(e.request).then((cachedResponse) => {
        // Tạo một request fetch để cập nhật cache ngầm từ mạng
        const fetchedResponse = fetch(e.request).then((networkResponse) => {
          // Nếu tải thành công, lưu bản mới vào cache
          if (networkResponse.status === 200 || networkResponse.type === 'opaque') {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // Khi mất mạng hoàn toàn và người dùng điều hướng trang, trả về index.html cứu cánh
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });

        // Ưu tiên trả về kết quả từ cache ngay lập tức để app load "tức thì", nếu chưa có cache thì dùng network
        return cachedResponse || fetchedResponse;
      });
    })
  );
});
