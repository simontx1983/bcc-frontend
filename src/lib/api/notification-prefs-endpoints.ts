/**
 * §I1 — typed wrappers for /me/notification-prefs.
 *
 * Backend: MyNotificationPrefsEndpoint (bcc/v1 namespace, standard
 * envelope). Storage: wp_usermeta `bcc_notif_pref_*`. Read/write
 * round-trip the same nested `{email_digest, bell}` shape.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  NotificationPrefs,
  NotificationPrefsPatch,
} from "@/lib/api/types";

export function getNotificationPrefs(
  signal?: AbortSignal,
): Promise<NotificationPrefs> {
  const init: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
  if (signal !== undefined) init.signal = signal;
  return bccFetchAsClient<NotificationPrefs>("me/notification-prefs", init);
}

export function patchNotificationPrefs(
  patch: NotificationPrefsPatch,
): Promise<NotificationPrefs> {
  return bccFetchAsClient<NotificationPrefs>("me/notification-prefs", {
    method: "PATCH",
    body: patch,
  });
}
