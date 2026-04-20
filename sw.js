const CACHE_NAME = 'mozaik-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './icon-192.png',
  './icon-512.png'
];

// Kurulum Aşaması (Dosyaları Önbelleğe Alır)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Dosyalar önbelleğe alındı.');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Etkinleşme Aşaması (Eski önbellekleri temizler)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Eski önbellek temizlendi:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// İnternet yoksa bile uygulamanın açılmasını sağlayan (Fetch) yakalayıcı
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});