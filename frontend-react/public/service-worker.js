self.addEventListener('push', (event) => {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icon-192.png', // Ensure you have an icon in the /public folder
    badge: '/badge-72.png', // And a badge icon
  };
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});