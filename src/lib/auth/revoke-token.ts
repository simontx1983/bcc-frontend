/**
 * Revoke this session's API token as part of a session teardown (F-282).
 *
 * Signing out used to clear only the NextAuth cookie. The bcc bearer JWT
 * inside it stayed valid on the server until it expired (up to 7 days),
 * so a copied token kept working after "Sign out". bcc-trust's
 * POST /auth/logout (F-120) revokes exactly the presented token.
 *
 * Best-effort and never throws: the teardown bounds it with a timeout and
 * carries on regardless, because a slow or failing logout call must never
 * be the reason someone stays signed in on this device. Returns whether
 * the server confirmed the revocation.
 */

import { getSession } from "next-auth/react";

import { logoutToken } from "@/lib/api/auth-endpoints";

export async function revokeTokenForSessionEnd(): Promise<boolean> {
  try {
    const session = await getSession();
    const token =
      session !== null && typeof session.bccToken === "string" && session.bccToken !== ""
        ? session.bccToken
        : null;
    if (token === null) return false;
    await logoutToken(token);
    return true;
  } catch {
    return false;
  }
}
