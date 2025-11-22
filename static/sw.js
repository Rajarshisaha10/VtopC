self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('mycampus-store').then((cache) => cache.addAll([
      '/',
      '/login',
      '/static/style.css',
      '/static/dashboard.js',
      '/static/login.js',
      '/static/manifest.json',
      '/static/icon-192.png',
      '/static/icon-512.png',
      '/static/favicon.ico',
      // Modules
      '/static/modules/constants.js',
      '/static/modules/data.js',
      '/static/modules/state.js',
      '/static/modules/ui.js',
      // Helpers
      '/static/calculator.js',
      '/static/solver.js',
      '/static/bitmaps.js'
    ])),
  );
});

self.addEventListener('fetch', (e) => {
  // Only handle GET requests for static assets. 
  // POST requests (API calls) should go to network (or fail and be handled by data.js)
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request)),
  );
});