import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register Service Worker for PWA functionality (only in production)
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
        
        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker == null) {
            return;
          }
          
          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New content is available; please refresh
                console.log('New content is available; please refresh.');
                
                // Show update notification to user
                if (window.confirm('A new version of Phoenix CRM is available. Reload to update?')) {
                  window.location.reload();
                }
              } else {
                // Content is cached for the first time
                console.log('Content is cached for the first time.');
              }
            }
          });
        });
        
        // Check for updates every 5 minutes
        setInterval(() => {
          registration.update();
        }, 5 * 60 * 1000);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
      
    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'CACHE_UPDATED') {
        console.log('Cache updated:', event.data.payload);
        // You can dispatch custom events or show notifications here
      }
    });
  });
  
  // Handle app install prompt
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('PWA install prompt ready');
    
    // Show custom install button or notification
    // You can integrate this with your app's UI
  });
  
  // Handle successful PWA installation
  window.addEventListener('appinstalled', (evt) => {
    console.log('PWA was installed');
    deferredPrompt = null;
  });
}

// Background Sync registration (only in production)
if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype && process.env.NODE_ENV === 'production') {
  navigator.serviceWorker.ready.then((registration) => {
    // Register for background sync when offline requests fail
    window.addEventListener('online', () => {
      registration.sync.register('retry-failed-requests');
    });
  });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();