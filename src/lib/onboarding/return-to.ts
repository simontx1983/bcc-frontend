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
 * Viewer-scoped (lib/auth/viewer-storage): a sign-out clears it.
 */

import type { Route } from "next";

import { safeCallbackPath } from "@/lib/auth/safe-callback";

export const ONBOARDING_RETURN_TO_KEY = "bcc:onboarding-return-to";

export function writeOnboardingReturnTo(path: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const safe = safeCallbackPath(path);
  try {
    if (safe === null || safe === "/") {
      window.sessionStorage.removeItem(ONBOARDING_RETURN_TO_KEY);
    } else {
      window.sessionStorage.setItem(ONBOARDING_RETURN_TO_KEY, safe);
    }
  } catch {
    // Ignore — onboarding ends on the Floor instead.
  }
}

/** Read AND clear: the target is used once. Null when none (go to "/"). */
export function takeOnboardingReturnTo(): Route | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_RETURN_TO_KEY);
    window.sessionStorage.removeItem(ONBOARDING_RETURN_TO_KEY);
    return safeCallbackPath(raw);
  } catch {
    return null;
  }
}
