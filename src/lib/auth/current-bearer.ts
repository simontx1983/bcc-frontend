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

import { bearerFailsConsistencyCheck, readBearerConsistencyClaims } from "@/lib/auth/bearer-claims";
import { currentViewerEpoch, isStaleEpoch } from "@/lib/auth/session-boundary";

interface PendingBearer {
  token: string;
  /** The viewer epoch it was minted for. A moved boundary discards it. */
  epoch: number;
  expiresAt: number;
}

let pending: PendingBearer | null = null;

/**
 * The last session bearer a client read for the current viewer. Lets
 * `notePendingBearer` refuse, synchronously, a replacement that belongs
 * to a different account or is older than what the session already has.
 */
let lastSessionBearer: { token: string; epoch: number } | null = null;

/** Record the session bearer a client just read (clients call this). */
export function rememberSessionBearer(token: string | null): void {
  lastSessionBearer = token === null ? null : { token, epoch: currentViewerEpoch() };
}

/**
 * Note a validated replacement bearer, before its session write starts.
 * Returns false (and notes nothing) when the token's claims are
 * unreadable, or it fails the consistency check against the session
 * bearer last read for this viewer: a different subject, or an older
 * token version. The session write still runs and still has its own
 * confirm; only the early override is refused.
 */
export function notePendingBearer(token: string, expiresIn: number): boolean {
  if (readBearerConsistencyClaims(token) === null) return false;
  const known =
    lastSessionBearer !== null && !isStaleEpoch(lastSessionBearer.epoch)
      ? lastSessionBearer.token
      : null;
  // No session bearer read yet for this viewer: nothing to prove the new
  // token belongs to them, so don't override the session early. Every
  // caller today runs after a client request has read the session; the
  // session write itself still runs and has its own confirm.
  if (known === null) return false;
  if (bearerFailsConsistencyCheck(token, known)) return false;
  pending = {
    token,
    epoch: currentViewerEpoch(),
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return true;
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
 * A bearer that REPLACED `used` for the SAME viewer, or null. Checked on
 * a 401 before anything treats the rejection as the end of the session:
 * if the bearer was swapped while the request was in flight, the 401
 * says nothing about the session, only about the token it replaced.
 *
 * A candidate qualifies only if ALL hold, checked before the caller
 * re-sends anything:
 *   - the viewer boundary has not moved since dispatch (a sign-out or an
 *     account switch in another tab must never let a request re-send as
 *     someone else);
 *   - it passes the claims consistency check against `used`: same
 *     subject / user_id, and a token version no older than `used`;
 *   - while a pending bearer exists, ONLY the pending one is a candidate:
 *     the session still holds the revoked bearer it replaces, so a 401 on
 *     the fresh token must never retry with the old one.
 * Otherwise null, and the caller takes the normal 401 path.
 */
export async function supersedingBearer(
  used: string,
  dispatchEpoch: number,
): Promise<string | null> {
  if (isStaleEpoch(dispatchEpoch)) return null;
  const qualifies = (candidate: string | null): candidate is string =>
    candidate !== null &&
    candidate !== used &&
    !isStaleEpoch(dispatchEpoch) &&
    !bearerFailsConsistencyCheck(candidate, used);

  const p = pendingBearer();
  if (p !== null) {
    return qualifies(p) ? p : null;
  }
  let current: string | null = null;
  try {
    current = sessionBearerOf((await getSession()) as { bccToken?: unknown } | null);
  } catch {
    return null;
  }
  return qualifies(current) ? current : null;
}

/**
 * After a refresh of `used` was REJECTED, has the SESSION COOKIE moved on
 * to a newer bearer for the same viewer? Returns it, or null.
 *
 * Since a refresh retires the token it replaced after a short overlap
 * (bcc-trust F-282), a request still carrying the old token, or a tab
 * whose in-memory bearer was lost, can have its refresh rejected while
 * the cookie already holds a working token another tab minted. Ending the
 * session then would sign out every tab for nothing. Unlike
 * supersedingBearer this reads the cookie even when a pending bearer
 * exists, because the rejection already proved `used` is dead. Same
 * guards: the viewer boundary must not have moved, and the candidate must
 * pass the claims consistency check against `used`.
 */
export async function sessionBearerAfterRejectedRefresh(
  used: string,
  dispatchEpoch: number,
): Promise<string | null> {
  if (isStaleEpoch(dispatchEpoch)) return null;
  let current: string | null = null;
  try {
    current = sessionBearerOf((await getSession()) as { bccToken?: unknown } | null);
  } catch {
    return null;
  }
  return current !== null &&
    current !== used &&
    !isStaleEpoch(dispatchEpoch) &&
    !bearerFailsConsistencyCheck(current, used)
    ? current
    : null;
}

/** Test seam: forget any pending bearer. */
export function __resetPendingBearerForTests(): void {
  pending = null;
  lastSessionBearer = null;
}
