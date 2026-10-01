/**
 * viewer-storage — which browser-storage keys belong to the VIEWER and
 * which belong to the DEVICE.
 *
 * Sign-out clears the first set and keeps the second. Getting this
 * backwards is a privacy bug in one direction and an annoying one in the
 * other (losing someone's theme every time they sign out), so both sets
 * are explicit and both are pinned by a derived test.
 *
 * ## Exact keys are not enough
 *
 * Two of the viewer-scoped families are keyed by the viewer's own id, so
 * their names are not knowable up front:
 *
 *   bcc.blog.draft.<handle>   the viewer's UNPUBLISHED blog post body
 *   bcc:fp_reported:<userId>  discloses the previous viewer's user id
 *
 * An exact-key `removeItem` list structurally cannot reach those. They are
 * handled by prefix, by enumerating the store.
 *
 * ## Deletion cannot be promised
 *
 * `localStorage` throws outright in some private-mode configurations and
 * when site data is blocked. This module reports whether the purge
 * actually completed so the UI can say what is true instead of asserting
 * a guarantee it cannot make.
 */

import type { StoragePurgeOutcome } from "@/lib/auth/session-boundary";

/**
 * Cleared on sign-out / viewer switch. Anything identifying a person,
 * recording what they did, or gating a one-time prompt at their position
 * in a flow.
 */
export const VIEWER_SCOPED_STORAGE_KEYS: readonly string[] = [
  // The previous viewer's search history, rendered verbatim to whoever is
  // next in the global search dropdown's RECENT section.
  "bcc-recent-searches",
  // Which product tours this viewer finished / is part-way through /
  // dismissed. Keeping any of them suppresses or mis-positions onboarding
  // for the next person on the device.
  "bcc-tour-seen",
  "bcc-tour-progress",
  "bcc-tour-dismissed",
  // Where this viewer got to in the onboarding wizard, and whether they
  // dismissed the resume prompt.
  "bcc-onboarding-progress",
  "bcc-onboarding-resume-dismissed",
  // Suppresses the NFT-community activation prompt for this viewer.
  "bcc.communities.dismissed",
  // The server-side push-subscription row id for this viewer+device.
  "bcc-push-subscription-id",
];

/**
 * Cleared by PREFIX, because the rest of the key is the viewer's own id.
 * Every key in either store starting with one of these goes.
 */
export const VIEWER_SCOPED_STORAGE_PREFIXES: readonly string[] = [
  // Unpublished blog post bodies, autosaved every 5s by BodyEditor.
  "bcc.blog.draft.",
  // Fingerprint-reported marker; the user id is IN the key.
  "bcc:fp_reported:",
];

/**
 * Deliberately PRESERVED. Device/display preferences — not viewer data.
 * Wiping these makes sign-out feel like a factory reset.
 */
export const DEVICE_SCOPED_STORAGE_KEYS: readonly string[] = [
  "bcc-theme",
  "bcc-accent",
  "bcc-sidebar-collapsed",
  // Roster list/grid choice. A display preference for the device, and it
  // reveals nothing about who was signed in.
  "bcc:roster-view",
];

function isViewerScoped(key: string): boolean {
  return (
    VIEWER_SCOPED_STORAGE_KEYS.includes(key) ||
    VIEWER_SCOPED_STORAGE_PREFIXES.some((p) => key.startsWith(p))
  );
}

/**
 * Remove every viewer-scoped key from BOTH stores, leaving device
 * preferences alone.
 *
 * @returns `"cleared"` when the purge completed, `"partial"` when any
 *          access threw — in which case the caller must not claim the data
 *          is gone.
 */
export function clearViewerStorage(): StoragePurgeOutcome {
  if (typeof window === "undefined") {
    return "cleared";
  }

  let complete = true;

  for (const store of [window.localStorage, window.sessionStorage]) {
    // Enumerate first, then delete: removing while iterating by index
    // re-indexes the store and skips keys.
    let keys: string[];
    try {
      keys = Object.keys(store);
    } catch {
      // The store itself is unreachable. Nothing here can be removed, and
      // we must not pretend otherwise.
      complete = false;
      continue;
    }
    for (const key of keys) {
      if (!isViewerScoped(key)) {
        continue;
      }
      try {
        store.removeItem(key);
      } catch {
        complete = false;
      }
    }
    // A key we were told to remove but that is still present — a quota or
    // policy quirk — is also an incomplete purge.
    for (const key of keys) {
      if (!isViewerScoped(key)) {
        continue;
      }
      try {
        if (store.getItem(key) !== null) {
          complete = false;
        }
      } catch {
        complete = false;
      }
    }
  }

  return complete ? "cleared" : "partial";
}
