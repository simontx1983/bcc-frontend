/**
 * BCC service worker — V2 Phase 1 web push.
 *
 * Three responsibilities:
 *   1. install/activate — claim clients so the worker takes over the
 *      page on first registration without a reload.
 *   2. push — render a notification from the server's payload. The
 *      payload format is owned by the PHP PushPayload builder; this
 *      file is intentionally a thin renderer with sensible fallbacks
 *      so a payload-shape mismatch never silently swallows a push.
 *   3. notificationclick — if an open tab is already on the target URL,
 *      focus it; otherwise open a new tab. We deliberately do NOT
 *      hijack an existing tab with `client.navigate()` — that would
 *      yank the user away from in-progress work in another tab of
 *      our app.
 *
 * pushsubscriptionchange is logged but does not auto-resubscribe —
 * the SW doesn't have an authenticated channel to POST a renewed
 * subscription back to the server, and embedding the VAPID public
 * key here would couple the SW to the build pipeline. The next page
 * load handles renewal: usePushSubscription's hydration step calls
 * getCurrentBrowserSubscription, which reflects whatever the browser
 * gave us, and the form re-syncs with the server.
 *
 * @see docs/v2-phase-1-push-notifications.md sub-phase 1.4
 */

self.addEventListener("install", () => {
  // Skip the "waiting" state — new SW takes over immediately rather
  // than queuing behind the previously-registered one.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of any open tabs that haven't loaded under this SW yet.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      try {
        payload = { body: event.data.text() };
      } catch {
        // Empty payload — render a generic notification rather than
        // dropping the push silently.
      }
    }
  }

  const title = typeof payload.title === "string" && payload.title.length > 0
    ? payload.title
    : "Blue Collar Crypto";
  const body = typeof payload.body === "string" && payload.body.length > 0
    ? payload.body
    : "You have a new notification.";
  const url = typeof payload.url === "string" && payload.url.length > 0
    ? payload.url
    : "/";
  const tag = typeof payload.tag === "string" ? payload.tag : undefined;

  // `icon` and `badge` are intentionally omitted here. When asset files
  // exist at /icon-192.png and /badge-72.png in public/, add them back:
  //   options.icon  = "/icon-192.png";
  //   options.badge = "/badge-72.png";
  // Without them the OS falls back to the browser's default app icon —
  // less polished, but no broken-image 404 in the network log.
  const options = {
    body,
    data: { url },
  };
  if (tag !== undefined) {
    options.tag = tag;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Resolve target URL once for comparison.
      let targetHref;
      try {
        targetHref = new URL(url, self.location.origin).href;
      } catch {
        targetHref = self.location.origin + "/";
      }

      // Prefer an open tab already on the exact target URL — focus it
      // without navigating. Tab-stealing (navigating an unrelated tab)
      // is intentionally avoided.
      for (const client of windowClients) {
        try {
          if (client.url === targetHref && "focus" in client) {
            return client.focus();
          }
        } catch {
          // Ignore one client; keep scanning.
        }
      }

      // Otherwise open a new tab; this leaves whatever the user was
      // doing in their existing tabs untouched.
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
      return null;
    }),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // Browser-side subscription rotation. We can't authenticate a
  // server-side renewal from inside the SW (bearer JWT lives in the
  // page context, not the worker), so the recovery path is:
  //   1. The old subscription dies; pushes start failing with 410.
  //   2. Server tombstones the dead row via PushDispatcher.
  //   3. User's next page load runs usePushSubscription hydration,
  //      sees the new browser subscription, and the master toggle's
  //      enable() path re-registers the renewed endpoint server-side.
  // That cycle is acceptable for V1: pushes resume on the user's
  // next visit. Logged here so the rotation is visible in DevTools.
  console.warn("[bcc-sw] pushsubscriptionchange — defer to next page load", event);
});
