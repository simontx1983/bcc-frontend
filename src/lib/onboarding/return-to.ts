/**
 * Where to go when onboarding finishes (F-332, #288 review).
 *
 * A wallet signup from /login's modal goes through onboarding first (user
 * decision), but the visitor may have arrived on /login from a deep link
 * (`?callbackUrl=/v/atlas?tab=reviews`). The modal records that target
 * here; the onboarding send-off reads it once and goes there instead of
 * the Floor, so the deep link isn't lost.
 *
 * The wizard owns its own query string (`?step=…`), which is why this is
 * sessionStorage rather than a URL param. Only same-origin relative paths
 * are ever stored or returned (safeCallbackPath). Every accessor is
 * SSR-safe and swallows storage errors — the worst case is the Floor.
 *
 * Viewer-scoped by KEY (`bcc:onboarding-return-to::<user id>`, see
 * lib/auth/viewer-scope), and cleared by the sign-out sweep
 * (lib/auth/viewer-storage): one member's navigation is never followed
 * by another who signs in on the same tab. Unknown (null) and anonymous
 * scopes neither read nor write; the bare unscoped key is a legacy key
 * the arrival sweep deletes, and is never read.
 */

import type { Route } from "next";

import { safeCallbackPath } from "@/lib/auth/safe-callback";
import { ANON_SCOPE, scopedKey, type ViewerScope } from "@/lib/auth/viewer-scope";

export const ONBOARDING_RETURN_TO_KEY = "bcc:onboarding-return-to";

/** The key for a signed-in member's scope; null for unknown or anonymous. */
function keyFor(scope: ViewerScope): string | null {
  if (scope === ANON_SCOPE) return null;
  return scopedKey(ONBOARDING_RETURN_TO_KEY, scope);
}

export function writeOnboardingReturnTo(
  path: string | null | undefined,
  scope: ViewerScope,
): void {
  if (typeof window === "undefined") return;
  const key = keyFor(scope);
  if (key === null) return;
  const safe = safeCallbackPath(path);
  try {
    if (safe === null || safe === "/") {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, safe);
    }
  } catch {
    // Ignore — onboarding ends on the Floor instead.
  }
}

/** Read AND clear: the target is used once. Null when none (go to "/"). */
export function takeOnboardingReturnTo(scope: ViewerScope): Route | null {
  if (typeof window === "undefined") return null;
  const key = keyFor(scope);
  if (key === null) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    return safeCallbackPath(raw);
  } catch {
    return null;
  }
}
