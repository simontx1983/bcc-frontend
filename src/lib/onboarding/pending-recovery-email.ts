/**
 * Pending recovery email — the hand-off between /login's wallet-signup
 * modal and onboarding's "Secure your account" step (F-332).
 *
 * When a wallet signup includes an email, the server mails a 6-digit code
 * to it at signup (bcc-trust #658). The modal records the address here so
 * the step can say where the code went and verify it, without asking the
 * new member to type the address a second time.
 *
 * Viewer-scoped by KEY (`bcc:pending-recovery-email::<user id>`, see
 * lib/auth/viewer-scope): if a session ages out with no teardown and
 * someone else signs in on the same tab, they must not see — or Resend
 * to — the previous member's address. Unknown (null) and anonymous scopes
 * neither read nor write; the bare unscoped key is a legacy key the
 * arrival sweep deletes, and is never read.
 *
 * sessionStorage, not localStorage: the code is short-lived and the
 * address should not outlive the tab. Every accessor is SSR-safe and
 * swallows storage errors (private mode, quota, disabled storage) — the
 * worst case is that the step falls back to its add-an-email form.
 */

import { ANON_SCOPE, scopedKey, type ViewerScope } from "@/lib/auth/viewer-scope";

export const PENDING_RECOVERY_EMAIL_KEY = "bcc:pending-recovery-email";

/** The key for a signed-in member's scope; null for unknown or anonymous. */
function keyFor(scope: ViewerScope): string | null {
  if (scope === ANON_SCOPE) return null;
  return scopedKey(PENDING_RECOVERY_EMAIL_KEY, scope);
}

export function readPendingRecoveryEmail(scope: ViewerScope): string | null {
  if (typeof window === "undefined") return null;
  const key = keyFor(scope);
  if (key === null) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw !== null && raw.trim() !== "" ? raw : null;
  } catch {
    return null;
  }
}

export function writePendingRecoveryEmail(email: string, scope: ViewerScope): void {
  if (typeof window === "undefined") return;
  const key = keyFor(scope);
  if (key === null) return;
  try {
    window.sessionStorage.setItem(key, email);
  } catch {
    // Ignore — the step shows the add-an-email form instead.
  }
}

export function clearPendingRecoveryEmail(scope: ViewerScope): void {
  if (typeof window === "undefined") return;
  const key = keyFor(scope);
  if (key === null) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore — the sign-out sweep clears the family anyway.
  }
}
