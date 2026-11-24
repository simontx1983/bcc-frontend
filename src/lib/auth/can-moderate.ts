/**
 * `can_moderate` on the auth responses (bcc-trust #876): whether the user
 * passes the admin routes' own capability check.
 *
 * DISPLAY ONLY. It shows or hides the avatar menu's Admin group and is
 * never an input to anything else: every admin request is re-checked by
 * the server. It fails closed: absent, false or malformed hides the group.
 *
 * Carried like `in_good_standing`: read at sign-in, kept in the NextAuth
 * JWT as `canModerate` until the next sign-in, and left ABSENT (not
 * false) when the backend did not send it.
 */

import { booleanFlagCredential, parseBooleanFlagCredential } from "@/lib/auth/auth-flags";

/**
 * The signIn("bcc-verified") credential for the flag, present only when
 * the auth response carries a boolean. Credentials travel as strings.
 */
export function canModerateCredential(resp: { can_moderate?: unknown }): { can_moderate?: "true" | "false" } {
  const value = booleanFlagCredential(resp.can_moderate);
  return value === undefined ? {} : { can_moderate: value };
}

/** The credential read back in authorize(): a boolean, or undefined (absent). */
export function parseCanModerateCredential(raw: unknown): boolean | undefined {
  return parseBooleanFlagCredential(raw);
}

/** The Admin group's gate: shown for exactly `true`, hidden otherwise. */
export function sessionCanModerate(session: { user?: { canModerate?: unknown } } | null | undefined): boolean {
  return session?.user?.canModerate === true;
}
