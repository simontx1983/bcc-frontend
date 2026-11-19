/**
 * Hand the address being verified to /verify-email without putting it in
 * the URL (F-410).
 *
 * It used to travel as `?email=`, from /signup after a password sign-up
 * and from /login when a sign-in was refused as unverified. An address in
 * the URL lands in browser history, can leak through the Referer header,
 * and appears in server and proxy access logs. It now goes through
 * sessionStorage, as the 2FA challenge does (lib/auth/two-factor-challenge):
 * one tab only, gone when the tab closes, never sent anywhere.
 *
 * /verify-email needs it to say where the code went, to verify a code
 * (POST /auth/verify-email takes the address and the code) and to resend
 * one. A link token verifies without it. It is cleared once verification
 * succeeds or the server drops the address, and a sign-out clears it too
 * (lib/auth/viewer-storage).
 *
 * Every access is wrapped: storage can be unavailable (private mode,
 * blocked site data). The page then asks for the address instead.
 */

export const PENDING_VERIFICATION_EMAIL_KEY = "bcc.verify.email";

export function stashPendingVerificationEmail(email: string): void {
  try {
    window.sessionStorage.setItem(PENDING_VERIFICATION_EMAIL_KEY, email);
  } catch {
    // storage unavailable — /verify-email asks for the address instead
  }
}

/** The stashed address, or "" when there is none (or storage is unavailable). */
export function readPendingVerificationEmail(): string {
  try {
    return window.sessionStorage.getItem(PENDING_VERIFICATION_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearPendingVerificationEmail(): void {
  try {
    window.sessionStorage.removeItem(PENDING_VERIFICATION_EMAIL_KEY);
  } catch {
    // storage unavailable — nothing to clear
  }
}
