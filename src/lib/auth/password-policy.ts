/**
 * Password rules the server enforces, as the copy the password forms show.
 *
 * `bcc_password_breached` 422 (contract v1.NEXT, F-294; bcc-trust #712):
 * sign-up, password reset and password change refuse a password that
 * appears in Have I Been Pwned's Pwned Passwords. Only the password is
 * wrong, so the line belongs on the password field and nothing else needs
 * re-entering (a reset link and a signed wallet challenge stay usable).
 * The check fails open, so this never appears during a breach-list outage.
 */
export const PASSWORD_BREACHED_CODE = "bcc_password_breached";

export const PASSWORD_BREACHED_COPY =
  "This password has appeared in a known data breach. Choose a different one.";
