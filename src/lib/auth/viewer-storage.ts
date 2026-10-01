/**
 * viewer-storage — which browser-storage keys belong to the VIEWER and
 * which belong to the DEVICE.
 *
 * Sign-out clears the first set and keeps the second. Getting this
 * backwards is a privacy bug in one direction and an annoying one in the
 * other (losing someone's theme every time they sign out), so both lists
 * are explicit and both are pinned by a closed-inventory test.
 *
 * The one I would single out: `bcc-recent-searches` holds the previous
 * viewer's last five search queries and renders them verbatim in the
 * global search dropdown's RECENT section. Search terms are content.
 */

/**
 * Cleared on sign-out / viewer switch. Anything identifying a person,
 * recording what they did, or gating a one-time prompt at their
 * position in a flow.
 */
export const VIEWER_SCOPED_STORAGE_KEYS: readonly string[] = [
  // The previous viewer's search history, rendered to whoever is next.
  "bcc-recent-searches",
  // Which product tours this viewer finished — keeping it suppresses
  // onboarding for the next person on the device.
  "bcc-tour-seen",
  // Where this viewer got to in the onboarding wizard, and whether they
  // dismissed the resume prompt. Keeping either offers viewer B a
  // "resume setup?" at viewer A's position.
  "bcc-onboarding-progress",
  "bcc-onboarding-resume-dismissed",
  // Suppresses the NFT-community activation prompt for this viewer.
  "bcc.communities.dismissed",
  // The server-side push-subscription row id for this viewer+device.
  // Written at register time so sign-out can revoke it; useless and
  // misleading to the next viewer.
  "bcc-push-subscription-id",
];

/**
 * Deliberately PRESERVED. Device/display preferences — not viewer data.
 * Wiping these makes sign-out feel like a factory reset.
 */
export const DEVICE_SCOPED_STORAGE_KEYS: readonly string[] = [
  "bcc-theme",
  "bcc-accent",
  "bcc-sidebar-collapsed",
];

/**
 * Remove every viewer-scoped key, leaving device preferences alone.
 *
 * Every access is individually guarded: `localStorage` throws outright
 * in some private-mode configurations and when site data is blocked, and
 * a storage exception must never be the reason a sign-out stalls.
 */
export function clearViewerStorage(): void {
  if (typeof window === "undefined") {
    return;
  }
  for (const key of VIEWER_SCOPED_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Blocked or unavailable — nothing to clean up here anyway.
    }
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Same.
    }
  }
}
