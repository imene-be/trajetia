// Service worker : reçoit les notifications push et les affiche, même application fermée.
self.addEventListener('push', (event) => {
  let donnees = { title: 'TrajetIA', body: 'Nouvelle alerte sur votre trajet.', url: '/' }
  try { donnees = { ...donnees, ...event.data.json() } } catch { /* message sans contenu */ }
  event.waitUntil(self.registration.showNotification(donnees.title, {
    body: donnees.body, icon: '/icone.svg', badge: '/icone.svg', data: { url: donnees.url },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || '/'))
})
