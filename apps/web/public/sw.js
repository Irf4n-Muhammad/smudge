// Smudge's service worker: only shows push notifications and opens the post when tapped.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  const body = data.body || "Something happened on Smudge.";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || "Smudge", {
        body,
        tag: data.tag,
        data: { url },
      }),
      // Open tabs refresh their Notifications instead of waiting for the next visit.
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((list) => list.forEach((c) => c.postMessage({ type: "smudge-push", body, url }))),
    ]),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list)
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      return self.clients.openWindow(url);
    }),
  );
});
