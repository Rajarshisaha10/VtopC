const CACHE_NAME = 'mycampus-store-v2'; // Incremented version to force update

const ASSETS_TO_CACHE = [
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
];

// 1. Install Event: Cache the "App Shell" (HTML + Static Assets)
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Forces this SW to become active immediately
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching App Shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Activate Event: Clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim(); // Take control of all clients immediately
});

// 3. Fetch Event: The Core Logic
self.addEventListener('fetch', (e) => {
  
  // A. Handle Navigation Requests (HTML Pages)
  // This is what prevents the "Unable to connect" screen.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .catch(() => {
          // If network fails (offline), return the cached Dashboard HTML
          return caches.match('/'); 
        })
    );
    return;
  }

  // B. Handle Static Assets (JS, CSS, Images) -> Cache First
  if (e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        // Return cached file if found, otherwise try network
        return cachedResponse || fetch(e.request);
      })
    );
  }
});