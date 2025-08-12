// Phoenix CRM Service Worker - Enhanced PWA Functionality
const CACHE_NAME = 'phoenix-crm-v1';
const STATIC_CACHE = 'phoenix-crm-static-v1';
const DYNAMIC_CACHE = 'phoenix-crm-dynamic-v1';
const API_CACHE = 'phoenix-crm-api-v1';

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/static/css/main.css',
  '/static/js/main.js',
  '/manifest.json',
  '/favicon.ico',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css'
];

// API endpoints that should be cached
const API_ENDPOINTS = [
  '/api/customers',
  '/api/vehicles',
  '/api/work-orders',
  '/api/appointments',
  '/api/technicians',
  '/api/parts',
  '/api/invoices'
];

// Install event - Cache static assets
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS.filter(url => !url.startsWith('http')))
          .catch(err => {
            console.log('Error caching static assets:', err);
            // Cache essential files only if full cache fails
            return cache.addAll(['/', '/offline.html', '/manifest.json']);
          });
      })
      .then(() => {
        console.log('Service Worker installed successfully');
        self.skipWaiting();
      })
  );
});

// Activate event - Clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      const validCaches = [STATIC_CACHE, DYNAMIC_CACHE, API_CACHE];
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!validCaches.includes(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch event - Implement caching strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle different types of requests with appropriate strategies
  if (request.method !== 'GET') {
    // Handle POST, PUT, DELETE requests
    event.respondWith(handleNonGetRequest(request));
  } else if (url.pathname.startsWith('/api/')) {
    // API requests - Network First with cache fallback
    event.respondWith(handleApiRequest(request));
  } else if (isStaticAsset(request)) {
    // Static assets - Cache First
    event.respondWith(handleStaticAsset(request));
  } else {
    // Navigation requests - Network First with offline fallback
    event.respondWith(handleNavigation(request));
  }
});

// Handle non-GET requests (POST, PUT, DELETE)
async function handleNonGetRequest(request) {
  try {
    const response = await fetch(request);
    
    // If it's a successful API mutation, invalidate related cache
    if (response.ok && request.url.includes('/api/')) {
      await invalidateApiCache(request.url);
    }
    
    return response;
  } catch (error) {
    // Store failed requests for retry when online
    await storeFailedRequest(request);
    return new Response(JSON.stringify({
      error: 'Request failed - will retry when online',
      offline: true
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle API requests with Network First strategy
async function handleApiRequest(request) {
  try {
    const response = await fetch(request);
    
    if (response.ok) {
      // Cache successful API responses
      const cache = await caches.open(API_CACHE);
      const responseClone = response.clone();
      cache.put(request, responseClone);
    }
    
    return response;
  } catch (error) {
    // Return cached version if available
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Add offline indicator to cached response
      const data = await cachedResponse.json();
      return new Response(JSON.stringify({
        ...data,
        _offline: true,
        _cached: new Date().toISOString()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Return offline indicator
    return new Response(JSON.stringify({
      error: 'No cached data available',
      offline: true
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle static assets with Cache First strategy
async function handleStaticAsset(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const response = await fetch(request);
    
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    // Return generic offline asset if available
    return caches.match('/offline.html');
  }
}

// Handle navigation requests
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    // Return cached page or offline fallback
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // For SPA routes, return cached index.html
    const indexPage = await caches.match('/');
    if (indexPage) {
      return indexPage;
    }
    
    // Final fallback to offline page
    return caches.match('/offline.html');
  }
}

// Helper function to determine if request is for static asset
function isStaticAsset(request) {
  const url = new URL(request.url);
  return url.pathname.includes('/static/') || 
         url.pathname.endsWith('.css') ||
         url.pathname.endsWith('.js') ||
         url.pathname.endsWith('.png') ||
         url.pathname.endsWith('.jpg') ||
         url.pathname.endsWith('.svg') ||
         url.pathname.endsWith('.ico') ||
         url.hostname.includes('cdnjs.cloudflare.com');
}

// Store failed requests for retry when online
async function storeFailedRequest(request) {
  try {
    const failedRequests = await getFailedRequests();
    const requestData = {
      url: request.url,
      method: request.method,
      headers: [...request.headers.entries()],
      body: request.method !== 'GET' ? await request.text() : null,
      timestamp: Date.now()
    };
    
    failedRequests.push(requestData);
    await setFailedRequests(failedRequests);
  } catch (error) {
    console.error('Failed to store request:', error);
  }
}

// Get failed requests from IndexedDB or localStorage
async function getFailedRequests() {
  try {
    const stored = localStorage.getItem('phoenix-crm-failed-requests');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Store failed requests
async function setFailedRequests(requests) {
  try {
    localStorage.setItem('phoenix-crm-failed-requests', JSON.stringify(requests));
  } catch (error) {
    console.error('Failed to store requests:', error);
  }
}

// Invalidate API cache for mutations
async function invalidateApiCache(url) {
  const cache = await caches.open(API_CACHE);
  const keys = await cache.keys();
  
  // Remove related cache entries
  const toDelete = keys.filter(request => {
    const requestUrl = new URL(request.url);
    const mutationUrl = new URL(url);
    return requestUrl.pathname.startsWith(mutationUrl.pathname.split('/').slice(0, -1).join('/'));
  });
  
  await Promise.all(toDelete.map(request => cache.delete(request)));
}

// Background sync for failed requests
self.addEventListener('sync', event => {
  if (event.tag === 'retry-failed-requests') {
    event.waitUntil(retryFailedRequests());
  }
});

// Retry failed requests when online
async function retryFailedRequests() {
  const failedRequests = await getFailedRequests();
  const successfulRetries = [];
  
  for (const requestData of failedRequests) {
    try {
      const headers = new Headers();
      requestData.headers.forEach(([key, value]) => headers.append(key, value));
      
      const response = await fetch(requestData.url, {
        method: requestData.method,
        headers: headers,
        body: requestData.body
      });
      
      if (response.ok) {
        successfulRetries.push(requestData);
      }
    } catch (error) {
      console.log('Retry failed for:', requestData.url);
    }
  }
  
  // Remove successful retries from failed requests
  const remainingFailed = failedRequests.filter(
    req => !successfulRetries.includes(req)
  );
  await setFailedRequests(remainingFailed);
}

// Message handling for manual cache updates
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_UPDATED') {
    // Notify clients about cache updates
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'CACHE_UPDATED',
          payload: event.data.payload
        });
      });
    });
  }
});