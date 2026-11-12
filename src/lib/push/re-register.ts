/**
 * Re-register this device's existing push subscription with the server.
 *
 * A password change deletes EVERY server-side push subscription for the
 * account, including this device's (bcc-trust #466), and nothing put it
 * back, so the device silently stopped receiving pushes. After the new
 * bearer is in the session, the password flow calls this to re-POST the
 * subscription the browser still holds.
 *
 * Best-effort by design:
 *   - never prompts: it acts only when notification permission is already
 *     granted and the browser already has a subscription;
 *   - never overrides the user's choice: the POST flips the account-wide
 *     push master ON as a side effect, so it runs only when the server
 *     says push is currently enabled. A push OFF made on another device
 *     stays OFF (#240 review M1);
 *   - never throws: every failure resolves to false, so it can never
 *     change the outcome of the action that called it.
 */

import { getNotificationPrefs } from "@/lib/api/notification-prefs-endpoints";
import { registerPushSubscription } from "@/lib/api/push-endpoints";
import { getCurrentBrowserSubscription, subscriptionToPayload } from "@/lib/push/register";
import { rememberPushSubscriptionId } from "@/lib/push/revoke";

export async function reRegisterCurrentPushSubscription(): Promise<boolean> {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      return false;
    }
    const sub = await getCurrentBrowserSubscription();
    if (sub === null) return false;
    // Read the master fresh: a cached copy could predate an OFF made on
    // another device. A password change leaves the master untouched.
    const prefs = await getNotificationPrefs();
    if (prefs.push.enabled !== true) return false;
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const registered = await registerPushSubscription(subscriptionToPayload(sub, userAgent));
    // The old row id was deleted with the rest; park the new one so the
    // sign-out cleanup can DELETE this device's row.
    rememberPushSubscriptionId(registered.id);
    return true;
  } catch {
    return false;
  }
}
