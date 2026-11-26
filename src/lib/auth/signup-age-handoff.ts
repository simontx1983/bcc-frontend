const KEY = "bcc.signup.oauth-eligibility";

/** Carry only the opaque first-party proof across the provider redirect. */
export function stashOAuthEligibility(token: string): void {
  try {
    window.sessionStorage.setItem(KEY, token);
  } catch {
    // The completion page can ask for a new proof when storage is blocked.
  }
}

export function takeOAuthEligibility(): string | null {
  try {
    const token = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return token;
  } catch {
    return null;
  }
}
