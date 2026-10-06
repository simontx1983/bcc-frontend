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
 * Most families are now stored as `base::<viewer id>`
 * (`lib/auth/viewer-scope`), and two more carry something variable in the
 * key itself:
 *
 *   bcc.blog.draft.<handle>   a LEGACY unpublished blog post body
 *   bcc:fp_reported:<userId>  discloses the previous viewer's user id
 *
 * An exact-key `removeItem` list structurally cannot reach any of those.
 * Both sweeps enumerate the store instead and match by family.
 *
 * ## Departure is scoped; arrival is a migration
 *
 * `clearViewerStorage(scope)` removes the DEPARTING viewer's values and
 * leaves other scopes alone — another account's data on this browser is
 * not ours to delete. `clearCrossViewerStorage()` removes only what an
 * older, unscoped version wrote, because scoping already stops one
 * viewer's value being read by another.
 *
 * ## Deletion cannot be promised
 *
 * `localStorage` throws outright in some private-mode configurations and
 * when site data is blocked. This module reports whether the purge
 * actually completed so the UI can say what is true instead of asserting
 * a guarantee it cannot make.
 */

import type { StoragePurgeOutcome } from "@/lib/auth/session-boundary";
import {
  isKeyInFamilyForScope,
  isLegacyUnscopedKey,
  type ViewerScope,
} from "@/lib/auth/viewer-scope";

/**
 * Cleared on sign-out / viewer switch. Anything identifying a person,
 * recording what they did, or gating a one-time prompt at their position
 * in a flow.
 *
 * Each entry is a FAMILY BASE, not a literal key: since viewer scoping
 * these families are stored as `base::<viewer>` (`lib/auth/viewer-scope`),
 * and the bare `base` only appears as a legacy value written by an older
 * version. Both forms are matched. `bcc-push-subscription-id` is the one
 * entry with no scoped form, which costs nothing — matching `base` alone
 * still reaches it.
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
  // The body of an unpublished blog post, autosaved every 5s by BodyEditor.
  // The scoped family; the legacy `bcc.blog.draft.<handle>` form is reached
  // by the prefix below.
  "bcc.blog.draft",
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

function isViewerScoped(key: string, scope: ViewerScope): boolean {
  return (
    VIEWER_SCOPED_STORAGE_KEYS.some((base) =>
      isKeyInFamilyForScope(key, base, scope),
    ) || VIEWER_SCOPED_STORAGE_PREFIXES.some((p) => key.startsWith(p))
  );
}

/**
 * Viewer ARRIVAL sweep: remove what an older version left UNSCOPED, and
 * nothing else.
 *
 * This used to delete a fixed list of keys outright, because those keys
 * were shared by every viewer and so would be read back and shown to
 * whoever arrived next. Scoping removes that failure mode structurally —
 * an arriving viewer reads `base::<their own id>` and cannot reach anyone
 * else's value — so the sweep no longer needs to destroy anything that
 * belongs to someone. What remains is the migration: values written under
 * the old unscoped names identify nobody, so they are deleted rather than
 * adopted (see `purgeLegacyUnscopedKeys`).
 *
 * Two consequences worth stating, because they reverse earlier behaviour:
 *
 *   - A RETURNING viewer keeps their own onboarding resume point and tour
 *     position. Clearing those was an accepted cost of the old fixed list,
 *     and it is no longer a cost anyone has to pay.
 *   - Another viewer's SCOPED values stay on the device until they sign
 *     out. Nothing displays them, and nothing in the app reads across
 *     scopes — but they are still there for anyone inspecting this
 *     browser's storage, which scoping never claimed to prevent.
 */
export function clearCrossViewerStorage(): StoragePurgeOutcome {
  return sweep(isLegacyUnscopedKey);
}

/**
 * Remove the DEPARTING viewer's keys from BOTH stores, leaving device
 * preferences — and other viewers' scopes — alone.
 *
 * `scope` is the viewer who is leaving. Anything of theirs goes: their
 * scoped values, the legacy unscoped names (which may be theirs and belong
 * to nobody else), and the two prefix families, neither of which can be
 * attributed to a scope — a legacy `bcc.blog.draft.<handle>`, and the
 * one-shot `bcc:fp_reported:<id>` marker whose only cost if removed is one
 * extra fingerprint report.
 *
 * The legacy names need no separate clause here: every family base below IS
 * the legacy name, and `isKeyInFamilyForScope` matches the bare base as
 * well as the scoped key. A derived test pins that relationship, so adding a
 * legacy family without adding it here fails rather than silently leaving
 * someone's data behind at sign-out.
 *
 * A `null` scope means we never knew who was here, so only the
 * unattributable keys are removed. That is the honest outcome: guessing a
 * scope would delete a bystander's data.
 *
 * @returns `"cleared"` when the purge completed, `"partial"` when any
 *          access threw — in which case the caller must not claim the data
 *          is gone.
 */
export function clearViewerStorage(scope: ViewerScope): StoragePurgeOutcome {
  return sweep((key) => isViewerScoped(key, scope));
}

function sweep(matches: (key: string) => boolean): StoragePurgeOutcome {
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
      if (!matches(key)) {
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
      if (!matches(key)) {
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
