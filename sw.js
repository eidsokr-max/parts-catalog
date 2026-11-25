// يسمح بإشعارات المتصفح (على أندرويد لازم من خلال service worker)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = new URL("./#requests", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    const client = clients.find(c => "focus" in c);
    if (client) {
      if ("navigate" in client) await client.navigate(target);
      return client.focus();
    }
    return self.clients.openWindow(target);
  }));
});
