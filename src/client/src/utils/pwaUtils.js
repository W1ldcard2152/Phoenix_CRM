// PWA Utility Functions for Phoenix CRM

/**
 * Check if the app is running as a PWA (installed)
 */
export const isPWA = () => {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches
  );
};

/**
 * Check if the device is online
 */
export const isOnline = () => {
  return navigator.onLine;
};

/**
 * Get the current network status with additional info
 */
export const getNetworkStatus = () => {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  
  return {
    online: navigator.onLine,
    effectiveType: connection?.effectiveType || 'unknown',
    downlink: connection?.downlink || null,
    rtt: connection?.rtt || null,
    saveData: connection?.saveData || false
  };
};

/**
 * Show PWA install prompt
 */
export const showInstallPrompt = (deferredPrompt) => {
  if (!deferredPrompt) {
    console.log('Install prompt not available');
    return false;
  }
  
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
  });
  
  return true;
};

/**
 * Check if data appears to be from cache (offline)
 */
export const isDataFromCache = (data) => {
  return data && (data._offline === true || data._cached);
};

/**
 * Show offline indicator to user
 */
export const showOfflineIndicator = () => {
  // Remove existing indicator
  const existing = document.getElementById('offline-indicator');
  if (existing) {
    existing.remove();
  }
  
  const indicator = document.createElement('div');
  indicator.id = 'offline-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #ef4444;
    color: white;
    padding: 8px 16px;
    text-align: center;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  `;
  indicator.textContent = '📡 You are offline - Limited functionality available';
  
  document.body.appendChild(indicator);
  
  return indicator;
};

/**
 * Hide offline indicator
 */
export const hideOfflineIndicator = () => {
  const indicator = document.getElementById('offline-indicator');
  if (indicator) {
    indicator.style.transition = 'transform 0.3s ease-out';
    indicator.style.transform = 'translateY(-100%)';
    setTimeout(() => {
      indicator.remove();
    }, 300);
  }
};

/**
 * Show back online notification
 */
export const showBackOnlineNotification = () => {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease-out;
  `;
  
  // Add animation keyframes
  if (!document.getElementById('pwa-animations')) {
    const style = document.createElement('style');
    style.id = 'pwa-animations';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  notification.textContent = '🌐 Back online! Syncing data...';
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.transition = 'opacity 0.3s ease-out';
    notification.style.opacity = '0';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
};

/**
 * Cache important data in localStorage for offline use
 */
export const cacheDataForOffline = (key, data) => {
  try {
    const cacheEntry = {
      data,
      timestamp: Date.now(),
      version: '1.0'
    };
    localStorage.setItem(`phoenix-crm-cache-${key}`, JSON.stringify(cacheEntry));
    return true;
  } catch (error) {
    console.error('Failed to cache data:', error);
    return false;
  }
};

/**
 * Retrieve cached data for offline use
 */
export const getCachedData = (key, maxAge = 24 * 60 * 60 * 1000) => {
  try {
    const cached = localStorage.getItem(`phoenix-crm-cache-${key}`);
    if (!cached) return null;
    
    const cacheEntry = JSON.parse(cached);
    const age = Date.now() - cacheEntry.timestamp;
    
    if (age > maxAge) {
      localStorage.removeItem(`phoenix-crm-cache-${key}`);
      return null;
    }
    
    return {
      ...cacheEntry.data,
      _cached: true,
      _cachedAt: new Date(cacheEntry.timestamp).toISOString()
    };
  } catch (error) {
    console.error('Failed to retrieve cached data:', error);
    return null;
  }
};

/**
 * Clear expired cache entries
 */
export const clearExpiredCache = (maxAge = 24 * 60 * 60 * 1000) => {
  const keys = Object.keys(localStorage);
  let cleared = 0;
  
  keys.forEach(key => {
    if (key.startsWith('phoenix-crm-cache-')) {
      try {
        const cached = localStorage.getItem(key);
        if (cached) {
          const cacheEntry = JSON.parse(cached);
          const age = Date.now() - cacheEntry.timestamp;
          
          if (age > maxAge) {
            localStorage.removeItem(key);
            cleared++;
          }
        }
      } catch (error) {
        // Remove corrupted cache entries
        localStorage.removeItem(key);
        cleared++;
      }
    }
  });
  
  console.log(`Cleared ${cleared} expired cache entries`);
  return cleared;
};

/**
 * Get cache usage statistics
 */
export const getCacheStats = () => {
  const keys = Object.keys(localStorage);
  const cacheKeys = keys.filter(key => key.startsWith('phoenix-crm-cache-'));
  
  let totalSize = 0;
  const entries = [];
  
  cacheKeys.forEach(key => {
    try {
      const value = localStorage.getItem(key);
      const size = new Blob([value]).size;
      const cacheEntry = JSON.parse(value);
      
      totalSize += size;
      entries.push({
        key: key.replace('phoenix-crm-cache-', ''),
        size,
        timestamp: cacheEntry.timestamp,
        age: Date.now() - cacheEntry.timestamp
      });
    } catch (error) {
      console.error(`Error reading cache entry ${key}:`, error);
    }
  });
  
  return {
    totalEntries: cacheKeys.length,
    totalSize,
    entries: entries.sort((a, b) => b.timestamp - a.timestamp)
  };
};

/**
 * Register for background sync when a request fails
 */
export const registerBackgroundSync = (tag = 'retry-failed-requests') => {
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready
      .then(registration => registration.sync.register(tag))
      .catch(error => console.error('Background sync registration failed:', error));
  }
};

/**
 * Initialize PWA utilities and event listeners
 */
export const initializePWA = () => {
  // Handle online/offline events
  window.addEventListener('online', () => {
    console.log('App is back online');
    hideOfflineIndicator();
    showBackOnlineNotification();
    registerBackgroundSync();
  });
  
  window.addEventListener('offline', () => {
    console.log('App is offline');
    showOfflineIndicator();
  });
  
  // Show initial offline status if applicable
  if (!isOnline()) {
    showOfflineIndicator();
  }
  
  // Clear expired cache entries on startup
  clearExpiredCache();
  
  // Log PWA status
  console.log('PWA Status:', {
    isPWA: isPWA(),
    isOnline: isOnline(),
    networkStatus: getNetworkStatus(),
    cacheStats: getCacheStats()
  });
};

// Auto-initialize when imported
if (typeof window !== 'undefined') {
  // Initialize after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePWA);
  } else {
    initializePWA();
  }
}