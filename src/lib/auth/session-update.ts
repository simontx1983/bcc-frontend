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
  // Validated by TYPE, not just by value. `token` is typed `string`, but
  // the value comes from JSON at runtime — a backend that stopped
  // returning it would make this `undefined`, which `=== ""` does not
  // catch. JSON.stringify would then omit `bccToken` from the payload
  // while `bccTokenExpiresAt` still merged (lib/auth.ts applies the two
  // fields in independent `if`s), leaving the session holding the REVOKED
  // old bearer stamped with a fresh 7-day expiry — which also suppresses
  // the pre-emptive refresh, since that compares against that timestamp.
  // `resp.ok` would be true and the UI would say "Saved": exactly the
  // defect this file exists to prevent.
  if (typeof update.token !== "string" || update.token === "") {
    return false;
  }
  if (!Number.isFinite(update.expiresIn) || update.expiresIn <= 0) {
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

    // A non-2xx means the merge did not happen — including a CSRF
    // failure, which next-auth answers with 400.
    if (!resp.ok) {
      return false;
    }

    // A 200 is necessary but NOT sufficient, and `resp.ok` alone was a
    // real defect. Verified in next-auth 4.24.14:
    //
    //   core/routes/session.js:43   `if (!sessionToken) return response` —
    //                               no cookie, nothing written.
    //   core/routes/session.js:88   the JWT-strategy catch: it logs
    //                               JWT_SESSION_ERROR and pushes
    //                               sessionStore.clean(), whose cookies
    //                               carry maxAge 0 (core/lib/cookie.js:169)
    //                               — so it DELETES the session.
    //   next/utils.js:55            `status = res.status ?? 200`.
    //
    // Neither path sets a status, so both answer **200 with no body**. The
    // second is the dangerous one: the session is gone, yet the caller
    // would be told the bearer was adopted, show "Saved", and leave this
    // device rendering the previous viewer's private payloads until some
    // later poll 401s.
    //
    // The success path sets `response.body = updatedSession`, and this
    // app's `session` callback copies `bccToken` onto it (lib/auth.ts), so
    // the merged token echoed back is the one unambiguous success signal.
    // Compared, never logged.
    const merged = (await resp.json().catch(() => null)) as
      | { bccToken?: unknown }
      | null;
    if (merged?.bccToken !== update.token) {
      return false;
    }

    // Even a positive echo is not conclusive. In core/routes/session.js the
    // body is assigned at :72, BEFORE `jwt.encode` at :73 — and the catch
    // at :86 pushes `sessionStore.clean()` without resetting the body. So a
    // throw in encode, chunk, or an `events.session` handler produces
    // status 200, the merged session WITH our token echoed back, and
    // Set-Cookie headers that EXPIRE the session. Trusting the echo there
    // reports success for a session that no longer exists.
    //
    // The browser applies those Set-Cookie headers before this next
    // request, so a GET re-reads whatever cookie actually survived. This
    // is the same endpoint `useSession()` reads, so it exposes nothing the
    // client does not already hold.
    const check = await fetch("/api/auth/session", {
      credentials: "include",
      cache: "no-store",
    });
    const live = (await check.json().catch(() => null)) as
      | { bccToken?: unknown }
      | null;
    return live?.bccToken === update.token;
  } catch {
    // Network failure, abort, or a non-JSON csrf response.
    return false;
  }
}
