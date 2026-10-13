/**
 * revoke — push cleanup for the session boundary.
 *
 * ## Why sign-out has to do this at all
 *
 * `PushSubscriptionRepository::upsert` keys on `(user_id, endpoint_hash)`,
 * not on the endpoint alone. So when viewer B signs in on viewer A's
 * browser and enables push, B gets a SECOND row against the same browser
 * endpoint and A's row is untouched. Both rows are live, so the one
 * device receives both accounts' notifications. Sign-out is the only
 * moment we can break that.
 *
 * ## Why the server call comes first
 *
 * `DELETE /me/push-subscriptions/{id}` is authenticated and
 * ownership-checked (403 if the row is not yours). Once the NextAuth
 * cookie is gone it can only 401 — so it must run while the session is
 * still alive, which is why the boundary orders push cleanup ahead of
 * `signOut`.
 *
 * ## Why it uses the low-level fetch
 *
 * It goes through `bccFetch` with an explicit token, NOT
 * `bccFetchAsClient`. The latter owns the 401 → expiry handling, and a
 * cleanup request firing from inside a teardown could re-enter that
 * handler and start a second teardown. Using the low-level call makes
 * that recursion structurally impossible rather than merely guarded.
 *
 * ## Why the result is not a boolean
 *
 * `unsubscribe()` can reject, and the subscription id may never have
 * been stored. "We tried" and "it is gone" are different facts, and the
 * sign-out UI must not tell someone their device is clean when the
 * browser refused to unsubscribe.
 */

import { getSession } from "next-auth/react";

import type { PushCleanupOutcome } from "@/lib/auth/session-boundary";
import { deletePushSubscription } from "@/lib/api/push-endpoints";
import { getCurrentBrowserSubscription } from "@/lib/push/register";

/** Where `registerPushSubscription`'s returned row id is parked. */
export const PUSH_SUBSCRIPTION_ID_KEY = "bcc-push-subscription-id";

/** Remember the server row id so the boundary can revoke it later. */
export function rememberPushSubscriptionId(id: number): void {
  if (typeof window === "undefined" || !Number.isFinite(id) || id <= 0) {
    return;
  }
  try {
    window.localStorage.setItem(PUSH_SUBSCRIPTION_ID_KEY, String(id));
  } catch {
    // Storage blocked — we simply lose the ability to delete the row
    // server-side, and the outcome below degrades to
    // "unsubscribed-locally" rather than "revoked".
  }
}

function readPushSubscriptionId(): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(PUSH_SUBSCRIPTION_ID_KEY);
    if (raw === null) {
      return null;
    }
    const id = Number.parseInt(raw, 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Revoke this device's push subscription as part of a session teardown.
 *
 * Never throws — the boundary treats push cleanup as best-effort and
 * bounds it with a timeout. Returns what actually happened so the caller
 * can be honest about it.
 */
export async function revokePushForSessionEnd(): Promise<PushCleanupOutcome> {
  const sub = await getCurrentBrowserSubscription().catch(() => null);
  if (sub === null) {
    return "not-subscribed";
  }

  // Server row first, while the session still authenticates us.
  let serverRowDeleted = false;
  const id = readPushSubscriptionId();
  if (id !== null) {
    try {
      const session = await getSession();
      const token =
        session !== null &&
        typeof session.bccToken === "string" &&
        session.bccToken !== ""
          ? session.bccToken
          : null;
      if (token !== null) {
        await deletePushSubscription(id, token);
        serverRowDeleted = true;
      }
    } catch {
      // A 401/403/5xx here is not worth blocking sign-out over. The
      // browser-side unsubscribe below is what actually stops delivery
      // to this device; the row becomes undeliverable and is pruned on
      // the next 410 from the push service.
    }
  }

  // Browser side. This is the step that actually stops notifications
  // arriving on this device, so its failure is the one we report.
  try {
    const gone = await sub.unsubscribe();
    if (!gone) {
      return "unsubscribe-failed";
    }
  } catch {
    return "unsubscribe-failed";
  }

  return serverRowDeleted ? "revoked" : "unsubscribed-locally";
}
