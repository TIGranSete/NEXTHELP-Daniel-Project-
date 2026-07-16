// GRAN7 HELP Service Worker for Desktop/Background Notifications

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

// Handle click on desktop notification
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  const ticketId = event.notification.data ? event.notification.data.ticketId : null;
  const targetUrl = ticketId ? `${self.location.origin}/?ticket=${ticketId}` : self.location.origin;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Look for an existing open tab of our app
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          // Send message to the tab so it selects the ticket in-app
          if (ticketId) {
            client.postMessage({ type: 'SELECT_TICKET', ticketId: ticketId });
          }
          return client.focus();
        }
      }
      // If no tab is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Handle push notification event (if backend push is integrated)
self.addEventListener('push', function(event) {
  if (!event.data) return;
  
  try {
    const payload = event.data.json();
    const title = payload.title || 'GRAN7 HELP';
    const options = {
      body: payload.body || '',
      icon: '/src/assets/images/7.png',
      badge: '/src/assets/images/7.png',
      data: {
        ticketId: payload.ticketId
      },
      tag: payload.ticketId ? `ticket-${payload.ticketId}` : 'general-alert',
      requireInteraction: true
    };
    
    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('Novo Alerta - GRAN7 HELP', {
        body: text,
        icon: '/src/assets/images/7.png',
        badge: '/src/assets/images/7.png',
        requireInteraction: true
      })
    );
  }
});
