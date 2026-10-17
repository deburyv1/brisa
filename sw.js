/* ============================================
   BRISA - Service worker
   Makes the app installable and ready for phone
   notifications. Deliberately does NOT precache:
   the app must never serve stale code.
   ============================================ */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/* Needed for installability. Passthrough: network decides. */
self.addEventListener("fetch", () => {});

/* Web Push: arrives on the phone even with the tab closed. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "brisa";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/brisa-icon.svg",
    badge: "/brisa-icon.svg",
    tag: data.tag || "brisa",
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      if ("focus" in client) {
        if ("navigate" in client) await client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
