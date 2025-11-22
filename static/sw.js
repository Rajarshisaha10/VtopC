self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('mycampus-store').then((cache) => cache.addAll([
      '/',
      '/login',
      '/static/style.css',
      '/static/dashboard.js',
      '/static/login.js',
      '/static/manifest.json'
    ])),
  );
});

self.addEventListener('fetch', (e) => {
  console.log(e.request.url);
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request)),
  );
});