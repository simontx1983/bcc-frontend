/**
 * session-update — write a replacement bearer into the NextAuth session.
 *
 * Extracted from `tryRefresh` in `lib/api/client`, which has done this
 * since Phase β.3, so the password-change flow reuses the proven seam
 * instead of hand-rolling a second one. Both callers now share the two
 * gotchas below, and both report failure the same way.
 *
 * ## The NextAuth 4.x session-write contract (load-bearing)
 *
 *   1. The body MUST carry a `csrfToken` read from `GET /api/auth/csrf`.
 *      Omit it and the POST returns 200 while changing nothing.
 *   2. The payload MUST be wrapped under `data:`. NextAuth unwraps that
 *      and hands it to the `jwt` callback as `session` when
 *      `trigger === 'update'` (see `lib/auth.ts` for the receiving side).
 *
 * Both were verified empirically on 2026-05-13: drop either and
 * `session.bccToken` is unchanged on the next `getSession()`.
 *
 * ## Why this returns a boolean rather than throwing
 *
 * The two callers want opposite things from a failure. For a token
 * REFRESH it is non-fatal — the caller already holds the fresh token for
 * its immediate retry, and the cost is one extra refresh later. For a
 * PASSWORD CHANGE it is the difference between "you are still signed in"
 * and "your password changed, now sign in again", and reporting the wrong
 * one is the defect this fixes. So the outcome is returned, not thrown,
 * and neither caller may ignore it.
 *
 * ## The bearer does not get logged or stored
 *
 * It travels in a request body to the first-party session endpoint and
 * nowhere else. It is never written to `localStorage`, never put in a
 * query cache, and never passed to `console.*` — a replacement bearer is
 * a live credential for the full token TTL.
 */

export interface SessionBearerUpdate {
  /** The replacement JWT from the server. Never logged or persisted. */
  token: string;
  /** Seconds until it expires, as the server reported it. */
  expiresIn: number;
}

/**
 * Merge a replacement bearer into the active NextAuth session.
 *
 * @returns true when the session now carries the new token; false when
 *          the write could not be completed, in which case the caller
 *          must NOT claim the session was restored.
 */
export async function updateSessionBearer(
  update: SessionBearerUpdate,
): Promise<boolean> {
  if (update.token === "" || !Number.isFinite(update.expiresIn) || update.expiresIn <= 0) {
    return false;
  }

  try {
    const csrfResp = await fetch("/api/auth/csrf", { credentials: "include" });
    const csrfBody = (await csrfResp.json().catch(() => null)) as
      | { csrfToken?: unknown }
      | null;
    const csrfToken =
      typeof csrfBody?.csrfToken === "string" && csrfBody.csrfToken !== ""
        ? csrfBody.csrfToken
        : null;
    if (csrfToken === null) {
      return false;
    }

    const resp = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        csrfToken,
        data: {
          bccToken: update.token,
          bccTokenExpiresAt: Date.now() + update.expiresIn * 1000,
        },
      }),
    });

    // A non-2xx means the merge did not happen. Note that a 200 is
    // necessary but not sufficient — NextAuth answers 200 for a write it
    // silently dropped — which is exactly why the csrfToken and the
    // `data:` wrapper above are not optional.
    return resp.ok;
  } catch {
    // Network failure, abort, or a non-JSON csrf response.
    return false;
  }
}
