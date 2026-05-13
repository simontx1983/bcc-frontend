/**
 * Browser-side helpers for V2 Phase 1 web push.
 *
 * Wraps the Service Worker + PushManager APIs into something the
 * usePushSubscription hook can call without re-implementing the
 * VAPID-key-conversion + browser-quirk handling each time.
 *
 * Boundary rule: nothing in here talks to the BCC server. POSTing
 * the subscription / DELETing it lives in lib/api/push-endpoints.ts —
 * this file is purely the browser side.
 */

import type { PushSubscriptionPayload } from "@/lib/api/push-endpoints";

const SW_PATH = "/sw.js";

/**
 * Typed errors for the registration pipeline.
 *
 * Phase γ doctrine: callers MUST branch on these classes (`instanceof`),
 * never on `err.message.includes(...)`. The English copy on each error
 * is for debugging surfaces (Sentry, console) and is allowed to evolve.
 *
 * The four failure modes are surface-distinct in UX:
 *   - PushUnsupportedError    → "Your browser doesn't support push." (terminal)
 *   - ServiceWorkerError      → "Background sync setup failed." (retry-able)
 *   - PushPermissionDeniedError → "You blocked notifications in your browser."
 *     (terminal until the user changes browser settings)
 *   - PushSubscriptionKeysError → "Your browser returned an unexpected push
 *     subscription shape." (vendor bug; almost never happens)
 */
export class PushUnsupportedError extends Error {
  constructor() {
    super("Push notifications are not supported in this browser.");
    this.name = "PushUnsupportedError";
  }
}

export class ServiceWorkerError extends Error {
  constructor() {
    super("Service worker registration failed.");
    this.name = "ServiceWorkerError";
  }
}

export class PushPermissionDeniedError extends Error {
  constructor() {
    super("Notification permission was denied.");
    this.name = "PushPermissionDeniedError";
  }
}

export class PushSubscriptionKeysError extends Error {
  constructor() {
    super("Push subscription is missing required keys.");
    this.name = "PushSubscriptionKeysError";
  }
}

/**
 * Three-way feature check the UI uses to hide the master toggle on
 * unsupported browsers (mobile Safari without PWA install, embedded
 * webviews, ancient browsers, etc.).
 */
export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Register the service worker (idempotent — re-registering returns
 * the existing registration). Returns `null` on unsupported browsers
 * or if registration fails.
 */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
  } catch (err) {
    console.error("[bcc-push] Service worker registration failed", err);
    return null;
  }
}

/**
 * Read the current PushSubscription if any. The browser caches
 * subscriptions per-origin so this is the source of truth for
 * "is this device subscribed at all", independent of server state.
 *
 * Implementation note: we use `getRegistration()` instead of `.ready`
 * because `.ready` blocks forever when there's no active service
 * worker registration (the page hasn't enabled push yet). Returning
 * `null` for the no-registration case is correct — no registration
 * means no subscription.
 */
export async function getCurrentBrowserSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    if (reg === undefined) return null;
    return await reg.pushManager.getSubscription();
  } catch (err) {
    console.error("[bcc-push] getCurrentBrowserSubscription failed", err);
    return null;
  }
}

/**
 * Subscribe the browser to push, registering the SW first if needed.
 * Throws on unsupported browser, permission denial, or VAPID errors —
 * the caller maps those to UI states.
 *
 * Convention: pass the base64-url-encoded VAPID public key the server
 * returns from /me/push-subscriptions/vapid-public-key. We convert it
 * to the Uint8Array `applicationServerKey` PushManager expects.
 */
export async function registerBrowserPush(
  vapidPublicKey: string,
): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new PushUnsupportedError();
  }

  const reg = await ensureServiceWorker();
  if (reg === null) {
    throw new ServiceWorkerError();
  }

  // Permission must be requested in response to a user gesture; the
  // hook calls this from the master-toggle onChange handler so the
  // prompt always fires under that constraint.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new PushPermissionDeniedError();
  }

  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

  // Reuse an existing subscription if the browser already has one for
  // this origin — avoids creating duplicates after a page reload.
  const existing = await reg.pushManager.getSubscription();
  if (existing !== null) {
    return existing;
  }

  return await reg.pushManager.subscribe({
    userVisibleOnly: true,
    // Cast: PushManager.subscribe wants BufferSource with an ArrayBuffer
    // backing, but TS's Uint8Array constructor in lib.dom.d.ts widens
    // to ArrayBufferLike. The browser only ever hands us a real
    // ArrayBuffer here, so this cast is safe.
    applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
  });
}

/**
 * Tear down the browser-side subscription. Idempotent — silently no-ops
 * if there's no active subscription. The server-side row is cleaned
 * up via the prefs PATCH cascade, not here.
 */
export async function unregisterBrowserPush(): Promise<void> {
  const sub = await getCurrentBrowserSubscription();
  if (sub === null) return;
  try {
    await sub.unsubscribe();
  } catch (err) {
    // Best-effort — server cascade will still drop the row.
    console.warn("[bcc-push] Browser unsubscribe failed", err);
  }
}

/**
 * Translate a browser PushSubscription into the JSON shape the BCC
 * server's POST endpoint expects.
 *
 * The browser exposes the keys via `getKey('p256dh' | 'auth')` →
 * ArrayBuffer. The server stores them as base64url strings (matching
 * the standard PushSubscription.toJSON() shape).
 */
export function subscriptionToPayload(
  sub: PushSubscription,
  userAgent?: string,
): PushSubscriptionPayload {
  const json = sub.toJSON();
  const p256dh = json.keys?.["p256dh"];
  const auth = json.keys?.["auth"];
  if (typeof p256dh !== "string" || typeof auth !== "string") {
    throw new PushSubscriptionKeysError();
  }
  const payload: PushSubscriptionPayload = {
    endpoint: sub.endpoint,
    keys: { p256dh, auth },
  };
  if (userAgent !== undefined && userAgent !== "") {
    payload.user_agent = userAgent;
  }
  return payload;
}

/**
 * Convert a base64url-encoded VAPID public key (from the server) into
 * the Uint8Array PushManager.subscribe() requires for the
 * applicationServerKey parameter.
 *
 * Standard pattern from the W3C Push API examples — pads the string
 * to a base64-multiple-of-4 and converts via window.atob.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    out[i] = rawData.charCodeAt(i);
  }
  return out;
}
