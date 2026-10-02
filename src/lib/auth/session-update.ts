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
/**
 * Bound for the two WRITE legs: the csrf read and the session POST.
 *
 * `useAccount`'s `mutationFn` awaits this, so an unbounded hang leaves
 * `mutation.isPending` true forever: the submit button reads "Saving…",
 * every field stays disabled, and no recovery exists.
 *
 * These legs get the generous budget deliberately. A false return from
 * them is shown to the viewer as "we couldn't keep this device signed in"
 * — and this function is ALSO the session write on the hot refresh path
 * (`tryRefresh` in lib/api/client), where the return value is ignored but
 * the side effect is not: only a successful write advances
 * `bccTokenExpiresAt`, and `sessionExpired` is computed from nothing
 * else. So a write that gives up too early leaves that timestamp in the
 * past, every subsequent read re-enters the pre-emptive refresh, the
 * 30/60s per-user throttle on POST /auth/refresh turns into 429s, and the
 * client drops the bearer and renders as if signed out while the session
 * is still live.
 *
 * 6s matches `SIGN_OUT_TIMEOUT_MS`, and is more than the 3s
 * `lib/auth/force-signout` already allows on this very csrf route — the
 * earlier 2s was tighter than the app's own precedent for the same
 * request.
 */
const WRITE_TIMEOUT_MS = 6_000;

/**
 * The confirm leg gets a tighter budget because it sits on the
 * already-succeeded side: the echo has proved the merge, so giving up
 * early costs nothing. A timeout here keeps the merge.
 */
const CONFIRM_TIMEOUT_MS = 2_000;

/** Attempts before the echo is allowed to stand on its own. */
const CONFIRM_ATTEMPTS = 2;

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
    const csrfResp = await fetch("/api/auth/csrf", {
      credentials: "include",
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    });
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

    // The POST and its echo live in their own try, and a TRANSPORT
    // failure here is indeterminate in exactly the way the confirm leg
    // already handles: the server may well have merged, and the browser
    // has applied any Set-Cookie, so the GET below can settle it
    // authoritatively. Returning false on a dropped connection discarded
    // that evidence and reported a restored session as lost.
    //
    // A RESPONSE, by contrast, is a verdict. next-auth answers 400 on a
    // CSRF failure, and a 200 whose body does not echo our token means it
    // dropped the write — both are definite.
    let refuted = false;
    // Whether the POST's own response PROVED the merge. Load-bearing:
    // the confirm's "cannot be performed" branches below mean "nothing
    // disproved it", which is only a success if something had already
    // proved it. Without this they turned no evidence at all into
    // "restored".
    let echoed = false;
    try {
      const resp = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
        body: JSON.stringify({
          csrfToken,
          data: {
            bccToken: update.token,
            bccTokenExpiresAt: Date.now() + update.expiresIn * 1000,
          },
        }),
      });
      if (!resp.ok) {
        refuted = true;
      } else {
        // A 200 is necessary but NOT sufficient, and `resp.ok` alone was
        // a real defect. In next-auth 4.24.14 core/routes/session.js,
        // `if (!sessionToken) return response` answers 200 with no body
        // when there is no cookie, and the JWT-strategy catch logs
        // JWT_SESSION_ERROR and pushes sessionStore.clean() — maxAge 0,
        // i.e. it DELETES the session — also without setting a status,
        // which next/utils.js defaults to 200.
        //
        // The success path sets `response.body = updatedSession`, and
        // this app's session callback copies bccToken onto it, so a real
        // merge echoes the token back. Compared, never logged.
        const merged = (await resp.json().catch(() => null)) as
          | { bccToken?: unknown }
          | null;
        if (merged?.bccToken === update.token) {
          echoed = true;
        } else {
          refuted = true;
        }
      }
    } catch {
      // No response at all. Not a verdict either way.
    }

    if (refuted) {
      return false;
    }

    // ...but ONLY a readable session with NO bearer may disprove it.
    //
    // A confirm that could not be PERFORMED proves nothing. Folding a
    // 502, an HTML interstitial, a rate-limited edge, or a transport
    // failure into "the session is gone" reported a HEALTHY session as
    // lost — and that is not a cosmetic mislabel, because the only
    // control then offered tears the session down, so the false report
    // made itself true. This is the doctrine `errorCode()` in
    // lib/api/client already applies: a body we cannot read is never a
    // session-ending signal.
    //
    // Asked TWICE before giving up, because `echoed` is weaker than it
    // looks: next-auth assigns the response body BEFORE `jwt.encode`, and
    // its catch cleans the cookie, so a 200 echoing our token can be the
    // very response that deleted the session. One retry narrows the window
    // where that coincides with an unperformable confirm; it does not
    // close it, and the fall-back to `echoed` is a deliberate choice of
    // the less damaging error.
    const askConfirm = async (): Promise<boolean | null> => {
      let check: Response;
      try {
        check = await fetch("/api/auth/session", {
          credentials: "include",
          cache: "no-store",
          signal: AbortSignal.timeout(CONFIRM_TIMEOUT_MS),
        });
      } catch {
        return null;
      }
      if (!check.ok) {
        return null;
      }
      const live: unknown = await check.json().catch(() => undefined);
      if (typeof live !== "object" || live === null) {
        return null;
      }
      const liveToken = (live as { bccToken?: unknown }).bccToken;

      // Our own token coming back is the unambiguous success.
      if (liveToken === update.token) {
        return true;
      }

      // A DIFFERENT non-empty bearer is ambiguous, and only the echo can
      // settle it:
      //
      //  - if our write LANDED, this is a concurrent one replacing it.
      //    `updateSessionBearer` is also the session write inside
      //    `tryRefresh`, so a pre-emptive refresh can do exactly that, and
      //    the device can carry on.
      //  - if our write never landed — a dropped POST response, so the
      //    browser never applied its Set-Cookie — this is the PRE-CHANGE
      //    session, whose bearer the password change has just revoked
      //    server-side. Reading that as success shows "Saved" and then
      //    signs the viewer out under the generic slug a moment later.
      //
      // Same doctrine as the fall-back below: defer to what was actually
      // proved.
      if (typeof liveToken === "string" && liveToken !== "") {
        return echoed;
      }

      // Absent or empty: next-auth's cookie-cleaned shape, and the thing
      // the confirm exists to detect.
      return false;
    };

    for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt += 1) {
      const answer = await askConfirm();
      if (answer !== null) {
        return answer;
      }
    }
    return echoed;
  } catch {
    // Network failure, abort, or a non-JSON csrf response.
    return false;
  }
}
