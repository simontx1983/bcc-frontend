/**
 * Pending recovery email — the hand-off between /login's wallet-signup
 * modal and onboarding's "Secure your account" step (F-332).
 *
 * When a wallet signup includes an email, the server mails a 6-digit code
 * to it at signup (bcc-trust #658). The modal records the address here so
 * the step can say where the code went and verify it, without asking the
 * new member to type the address a second time.
 *
 * sessionStorage, not localStorage: the code is short-lived and the
 * address should not outlive the tab. Every accessor is SSR-safe and
 * swallows storage errors (private mode, quota, disabled storage) — the
 * worst case is that the step falls back to its add-an-email form.
 */

export const PENDING_RECOVERY_EMAIL_KEY = "bcc:pending-recovery-email";

export function readPendingRecoveryEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_RECOVERY_EMAIL_KEY);
    return raw !== null && raw.trim() !== "" ? raw : null;
  } catch {
    return null;
  }
}

export function writePendingRecoveryEmail(email: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_RECOVERY_EMAIL_KEY, email);
  } catch {
    // Ignore — the step shows the add-an-email form instead.
  }
}

export function clearPendingRecoveryEmail(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_RECOVERY_EMAIL_KEY);
  } catch {
    // Ignore — nothing else reads a stale entry once the step is done.
  }
}
