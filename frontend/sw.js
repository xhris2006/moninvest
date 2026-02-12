const CACHE_NAME = 'moninvest-v1';
const DYNAMIC_CACHE = 'moninvest-dynamic-v1';

// Fichiers à mettre en cache lors de l'installation
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/pass.html',
  '/profil.html',
  '/affiliation.html',
  '/apropos.html',
  '/contact.html',
  '/login.html',
  '/register.html',
  '/css/style.css',
  '/js/main.js',
  '/js/auth.js',
  '/js/pwa.js',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installation...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Mise en cache des fichiers statiques');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activation
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activation...');
  
  // Nettoyer les anciens caches
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== DYNAMIC_CACHE)
          .map(key => caches.delete(key))
      );
    })
  );
  
  event.waitUntil(clients.claim());
});

// Stratégie de cache: Stale-while-revalidate pour les pages, Network First pour les API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Stratégie pour les pages HTML
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          return caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(event.request, response.clone());
            return response;
          });
        })
        .catch(() => {
          return caches.match(event.request).then(cached => {
            if (cached) return cached;
            return caches.match('/index.html');
          });
        })
    );
    return;
  }
  
  // Stratégie pour les assets statiques (Cache First)
  if (STATIC_ASSETS.includes(url.pathname) || 
      url.pathname.startsWith('/assets/') || 
      url.pathname.endsWith('.css') || 
      url.pathname.endsWith('.js')) {
    
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            // Mettre à jour le cache en arrière-plan
            fetch(event.request)
              .then(newResponse => {
                caches.open(DYNAMIC_CACHE)
                  .then(cache => cache.put(event.request, newResponse));
              })
              .catch(() => {});
            
            return response;
          }
          
          return fetch(event.request)
            .then(response => {
              return caches.open(DYNAMIC_CACHE)
                .then(cache => {
                  cache.put(event.request, response.clone());
                  return response;
                });
            })
            .catch(() => {
              if (event.request.destination === 'image') {
                return caches.match('/assets/images/default-avatar.png');
              }
            });
        })
    );
    return;
  }
  
  // Stratégie pour les API (Network First)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clonedResponse = response.clone();
          caches.open(DYNAMIC_CACHE)
            .then(cache => cache.put(event.request, clonedResponse));
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then(cached => {
              if (cached) {
                return cached;
              }
              return new Response(
                JSON.stringify({ 
                  success: false, 
                  message: 'Vous êtes hors ligne' 
                }),
                { 
                  status: 503, 
                  headers: { 'Content-Type': 'application/json' } 
                }
              );
            });
        })
    );
    return;
  }
  
  // Stratégie par défaut
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

// Gestion des notifications push
self.addEventListener('push', (event) => {
  console.log('Service Worker: Notification reçue');
  
  let notificationData = {
    title: 'Mon Invest',
    body: 'Nouvelle notification',
    icon: '/assets/icons/icon-192x192.png',
    badge: '/assets/icons/badge-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      url: '/'
    }
  };
  
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (e) {
      console.error('Erreur parsing notification:', e);
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(
      notificationData.title,
      {
        body: notificationData.body,
        icon: notificationData.icon,
        badge: notificationData.badge,
        vibrate: notificationData.vibrate,
        data: notificationData.data,
        actions: [
          {
            action: 'open',
            title: 'Ouvrir'
          },
          {
            action: 'close',
            title: 'Fermer'
          }
        ]
      }
    )
  );
});

// Gestion du clic sur notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        const url = event.notification.data?.url || '/';
        
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Background Sync pour les transactions hors ligne
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Sync event', event.tag);
  
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncTransactions());
  }
  
  if (event.tag === 'sync-reclamations') {
    event.waitUntil(syncReclamations());
  }
});

async function syncTransactions() {
  try {
    const db = await openIndexedDB();
    const offlineTransactions = await db.getAll('offline-transactions');
    
    for (const transaction of offlineTransactions) {
      try {
        const response = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(transaction)
        });
        
        if (response.ok) {
          await db.delete('offline-transactions', transaction.id);
          
          // Notification locale
          self.registration.showNotification('✅ Transaction synchronisée', {
            body: `Votre transaction a été traitée avec succès`,
            icon: '/assets/icons/icon-192x192.png'
          });
        }
      } catch (error) {
        console.error('Erreur sync transaction:', error);
      }
    }
  } catch (error) {
    console.error('Erreur sync transactions:', error);
  }
}

async function syncReclamations() {
  try {
    const db = await openIndexedDB();
    const offlineReclamations = await db.getAll('offline-reclamations');
    
    for (const reclamation of offlineReclamations) {
      try {
        const formData = new FormData();
        Object.keys(reclamation.data).forEach(key => {
          formData.append(key, reclamation.data[key]);
        });
        
        const response = await fetch('/api/reclamations', {
          method: 'POST',
          body: formData
        });
        
        if (response.ok) {
          await db.delete('offline-reclamations', reclamation.id);
        }
      } catch (error) {
        console.error('Erreur sync réclamation:', error);
      }
    }
  } catch (error) {
    console.error('Erreur sync réclamations:', error);
  }
}

async function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MonInvestDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      resolve({
        getAll: (storeName) => {
          return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        },
        delete: (storeName, id) => {
          return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
        }
      });
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore('offline-transactions', { keyPath: 'id' });
      db.createObjectStore('offline-reclamations', { keyPath: 'id' });
    };
  });
}