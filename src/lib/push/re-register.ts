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
 *   - never throws: every failure resolves to false, so it can never
 *     change the outcome of the action that called it.
 */

import { registerPushSubscription } from "@/lib/api/push-endpoints";
import { getCurrentBrowserSubscription, subscriptionToPayload } from "@/lib/push/register";

export async function reRegisterCurrentPushSubscription(): Promise<boolean> {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      return false;
    }
    const sub = await getCurrentBrowserSubscription();
    if (sub === null) return false;
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
    await registerPushSubscription(subscriptionToPayload(sub, userAgent));
    return true;
  } catch {
    return false;
  }
}
