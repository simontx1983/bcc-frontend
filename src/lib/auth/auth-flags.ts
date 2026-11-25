/**
 * Boolean DISPLAY flags on the auth responses, carried into the NextAuth
 * session the same way: read at sign-in, passed to signIn("bcc-verified")
 * as a string credential, kept in the JWT, and left ABSENT (not false)
 * when the backend did not send a boolean. Never a security input: the
 * server enforces on every request.
 *
 * Two flags use this today: `can_moderate` (bcc-trust #876, see
 * can-moderate.ts) and `suspended` (contract v1.136, F-305 / F-582).
 */

/** A boolean flag as a signIn credential string, or undefined when it is not a boolean. */
export function booleanFlagCredential(value: unknown): "true" | "false" | undefined {
  if (value === true) return "true";
  if (value === false) return "false";
  return undefined;
}

/** A flag credential read back in authorize(): a boolean, or undefined (absent). */
export function parseBooleanFlagCredential(raw: unknown): boolean | undefined {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

// ── suspended ─────────────────────────────────────────────────────────
// Contract v1.136 (F-305): a suspended member signs in READ-ONLY. Every
// response that carries `in_good_standing` also carries `suspended`, and so
// do GET /auth/session and /auth/refresh. The frontend shows a notice from
// it (F-582); every write is still refused by the server.

/** The signIn("bcc-verified") credential for `suspended`, present only for a boolean. */
export function suspendedCredential(resp: { suspended?: unknown }): { suspended?: "true" | "false" } {
  const value = booleanFlagCredential(resp.suspended);
  return value === undefined ? {} : { suspended: value };
}

/** The `suspended` credential read back in authorize(). */
export function parseSuspendedCredential(raw: unknown): boolean | undefined {
  return parseBooleanFlagCredential(raw);
}

/** Whether the session says the member is suspended: exactly `true`, nothing else. */
export function sessionSuspended(session: { user?: { suspended?: unknown } } | null | undefined): boolean {
  return session?.user?.suspended === true;
}
