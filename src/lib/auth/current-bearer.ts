/**
 * current-bearer — which BCC bearer a client request should carry, and
 * whether the one a failed request carried has since been replaced.
 *
 * ## The race this closes
 *
 * Several routes revoke the viewer's bearer and hand back a replacement
 * in the same response: password change, email-change confirm,
 * verify-email, a token refresh. The server revokes the old bearer the
 * moment it answers, but `updateSessionBearer` is an async NextAuth
 * session write (csrf read + POST + echo). In that gap, any request that
 * goes out with the OLD bearer gets a 401 (badge polling, a React Query
 * refetch already in flight, a second tab), and the reactive path used
 * to refresh with the revoked token, be rejected, and end the session:
 * the viewer was signed out right after a successful action.
 *
 * Two parts:
 *
 *   1. A PENDING bearer, noted synchronously the moment a replacement is
 *      validated and cleared once the session write settles. New
 *      requests in this tab carry it straight away.
 *   2. `supersedingBearer(used)`: on a 401, a newer bearer than the one
 *      the request used (pending in this tab, or already in the session
 *      because another tab or an earlier write swapped it) means "retry
 *      with the newer one", never "this session is over".
 *
 * The pending bearer lives in module memory only. It is never logged,
 * never written to storage, and is dropped as soon as the viewer
 * boundary moves (sign-out, account switch) or it expires.
 */

import { getSession } from "next-auth/react";

import { currentViewerEpoch, isStaleEpoch } from "@/lib/auth/session-boundary";

interface PendingBearer {
  token: string;
  /** The viewer epoch it was minted for. A moved boundary discards it. */
  epoch: number;
  expiresAt: number;
}

let pending: PendingBearer | null = null;

/** Note a validated replacement bearer, before its session write starts. */
export function notePendingBearer(token: string, expiresIn: number): void {
  pending = {
    token,
    epoch: currentViewerEpoch(),
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

/** The session write for `token` has settled; stop overriding the session. */
export function settlePendingBearer(token: string): void {
  if (pending !== null && pending.token === token) {
    pending = null;
  }
}

/** The pending bearer, if one is live for the current viewer. */
export function pendingBearer(): string | null {
  if (pending === null) return null;
  if (isStaleEpoch(pending.epoch) || Date.now() >= pending.expiresAt) {
    pending = null;
    return null;
  }
  return pending.token;
}

function sessionBearerOf(session: { bccToken?: unknown } | null): string | null {
  const t = session?.bccToken;
  return typeof t === "string" && t !== "" ? t : null;
}

/**
 * A bearer NEWER than `used`, or null. Checked on a 401 before anything
 * treats the rejection as the end of the session: if the bearer was
 * swapped while the request was in flight, the 401 says nothing about
 * the session, only about the token it replaced.
 */
export async function supersedingBearer(used: string): Promise<string | null> {
  const p = pendingBearer();
  if (p !== null && p !== used) return p;
  let current: string | null = null;
  try {
    current = sessionBearerOf((await getSession()) as { bccToken?: unknown } | null);
  } catch {
    return null;
  }
  return current !== null && current !== used ? current : null;
}

/** Test seam: forget any pending bearer. */
export function __resetPendingBearerForTests(): void {
  pending = null;
}
