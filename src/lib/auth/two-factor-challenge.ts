/**
 * Hand the 2FA challenge token from /login to /login/two-factor without
 * putting it in the URL.
 *
 * It used to travel as `?ct=`. A token in the URL lands in browser
 * history, can leak through the Referer header to any page the 2FA
 * screen links to, and appears in server and proxy access logs. It now
 * goes through sessionStorage: one tab only, gone when the tab closes,
 * and cleared as soon as the challenge is used or rejected.
 *
 * Every access is wrapped: storage can be unavailable (private mode,
 * blocked site data), in which case the 2FA page shows its normal
 * "session expired, sign in again" state.
 */

const KEY = "bcc.2fa.challenge";

export function stashChallengeToken(token: string): boolean {
  try {
    window.sessionStorage.setItem(KEY, token);
    return true;
  } catch {
    return false;
  }
}

export function readChallengeToken(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearChallengeToken(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // storage unavailable — nothing to clear
  }
}
