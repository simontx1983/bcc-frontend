/**
 * updateSessionBearer — the actual NextAuth session write.
 *
 * The callers mock this module, so without these its internals are
 * untested: a mutation run showed all four of its behaviours (non-ok
 * response, missing csrf, network failure, missing `data:` wrapper)
 * surviving unnoticed.
 *
 * Two of the assertions here encode gotchas that are easy to "simplify"
 * away because the endpoint answers 200 either way:
 *
 *   1. The body MUST carry a csrfToken from GET /api/auth/csrf.
 *   2. The payload MUST be nested under `data:`.
 *
 * Drop either and NextAuth returns 200 while changing nothing — which for
 * a password change means telling the viewer they are still signed in
 * when they are not.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updateSessionBearer } from "@/lib/auth/session-update";

const UPDATE = { token: "replacement-jwt", expiresIn: 604800 };

interface Call {
  url: string;
  init?: RequestInit;
}

function stubFetch(opts: {
  csrf?: unknown;
  csrfStatus?: number;
  sessionStatus?: number;
  csrfThrows?: boolean;
  /**
   * Raw body for the session POST. Omitted means the REAL success shape:
   * next-auth sets `response.body = updatedSession`, and this app's
   * session callback copies bccToken onto it, so a genuine merge echoes
   * the token back. Pass "{}" to model either of next-auth's silent
   * no-op paths (absent cookie, or the JWT catch that also DELETES the
   * session) — both of which answer 200 with no body.
   */
  sessionBody?: string;
  /**
   * Model next-auth having DELETED the session despite a 200 that echoed
   * our token — the `jwt.encode`-throws path, where the body was already
   * assigned before the catch pushed maxAge-0 cookies. The POST still
   * echoes; the follow-up GET sees nothing.
   */
  sessionClearedAfterWrite?: boolean;
  /** Make the CONFIRMING GET fail in a way that proves nothing. */
  confirmStatus?: number;
  confirmBody?: string;
  confirmThrows?: boolean;
}): Call[] {
  const calls: Call[] = [];
  let stored: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, ...(init !== undefined ? { init } : {}) });
      if (url.includes("/api/auth/csrf")) {
        if (opts.csrfThrows === true) {
          throw new TypeError("Failed to fetch");
        }
        return new Response(JSON.stringify(opts.csrf ?? { csrfToken: "tok" }), {
          status: opts.csrfStatus ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (opts.sessionBody !== undefined && method === "POST") {
        return new Response(opts.sessionBody, {
          status: opts.sessionStatus ?? 200,
        });
      }
      if (method === "POST") {
        // Echo the merged bearer back, as a real successful write does,
        // and remember it so the confirming GET can read it back — which
        // is how the browser behaves once the Set-Cookie has applied.
        const sent = JSON.parse(String(init?.body ?? "{}")) as {
          data?: { bccToken?: unknown };
        };
        if (opts.sessionClearedAfterWrite !== true) {
          stored = sent.data?.bccToken;
        }
        return new Response(
          JSON.stringify({
            user: { name: "fixture" },
            expires: new Date(Date.now() + 86_400_000).toISOString(),
            bccToken: sent.data?.bccToken,
          }),
          { status: opts.sessionStatus ?? 200 },
        );
      }
      // GET: whatever cookie actually survived.
      if (opts.confirmThrows === true) {
        throw new TypeError("Failed to fetch");
      }
      if (opts.confirmStatus !== undefined || opts.confirmBody !== undefined) {
        return new Response(opts.confirmBody ?? "", {
          status: opts.confirmStatus ?? 200,
        });
      }
      return new Response(
        JSON.stringify(stored === undefined ? {} : { bccToken: stored }),
        { status: 200 },
      );
    }),
  );
  return calls;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a successful write", () => {
  it("returns true", async () => {
    stubFetch({});
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(true);
  });

  it("sends the csrfToken it read from /api/auth/csrf", async () => {
    const calls = stubFetch({ csrf: { csrfToken: "the-real-token" } });
    await updateSessionBearer(UPDATE);

    const post = calls.find((c) => c.url.includes("/api/auth/session"));
    const body = JSON.parse(String(post?.init?.body ?? "{}")) as {
      csrfToken?: string;
    };
    expect(body.csrfToken).toBe("the-real-token");
  });

  it("nests the payload under `data:` — NextAuth silently no-ops without it", async () => {
    const calls = stubFetch({});
    await updateSessionBearer(UPDATE);

    const post = calls.find((c) => c.url.includes("/api/auth/session"));
    const body = JSON.parse(String(post?.init?.body ?? "{}")) as {
      data?: { bccToken?: string; bccTokenExpiresAt?: number };
      bccToken?: string;
    };
    expect(body.data?.bccToken).toBe(UPDATE.token);
    expect(typeof body.data?.bccTokenExpiresAt).toBe("number");
    // Not at the top level, which is the shape that returns 200 and does
    // nothing.
    expect(body.bccToken).toBeUndefined();
  });

  it("derives the absolute expiry from expiresIn", async () => {
    const calls = stubFetch({});
    const before = Date.now();
    await updateSessionBearer(UPDATE);
    const post = calls.find((c) => c.url.includes("/api/auth/session"));
    const body = JSON.parse(String(post?.init?.body ?? "{}")) as {
      data?: { bccTokenExpiresAt?: number };
    };
    const at = body.data?.bccTokenExpiresAt ?? 0;
    expect(at).toBeGreaterThanOrEqual(before + UPDATE.expiresIn * 1000 - 50);
    expect(at).toBeLessThanOrEqual(Date.now() + UPDATE.expiresIn * 1000 + 50);
  });

  it("sends credentials so the session cookie travels with it", async () => {
    const calls = stubFetch({});
    await updateSessionBearer(UPDATE);
    const post = calls.find((c) => c.url.includes("/api/auth/session"));
    expect(post?.init?.credentials).toBe("include");
  });
});

describe("a failed write returns false", () => {
  it("when the session POST is not ok", async () => {
    stubFetch({ sessionStatus: 500 });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(false);
  });

  it("when the csrf response carries no token", async () => {
    stubFetch({ csrf: {} });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(false);
  });

  it("when the csrf token is an empty string", async () => {
    stubFetch({ csrf: { csrfToken: "" } });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(false);
  });

  it("when the network fails", async () => {
    stubFetch({ csrfThrows: true });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(false);
  });

  it("without even trying, when the token is empty", async () => {
    const calls = stubFetch({});
    await expect(
      updateSessionBearer({ token: "", expiresIn: 604800 }),
    ).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("without even trying, when expiresIn is not a usable number", async () => {
    const calls = stubFetch({});
    await expect(
      updateSessionBearer({ token: "t", expiresIn: 0 }),
    ).resolves.toBe(false);
    await expect(
      updateSessionBearer({ token: "t", expiresIn: Number.NaN }),
    ).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("the bearer is not leaked", () => {
  it("appears only in the session POST body, never in a URL", async () => {
    const calls = stubFetch({});
    await updateSessionBearer(UPDATE);
    for (const c of calls) {
      expect(c.url).not.toContain(UPDATE.token);
    }
  });

  it("is not written to browser storage", async () => {
    stubFetch({});
    await updateSessionBearer(UPDATE);
    const dump = JSON.stringify({
      ...window.localStorage,
      ...window.sessionStorage,
    });
    expect(dump).not.toContain(UPDATE.token);
  });
});

describe("the token is validated by TYPE, not just by value", () => {
  it("refuses a missing token even though the type says string", async () => {
    // The value comes from JSON at runtime. A backend that stopped
    // returning `token` would make this `undefined`, which `=== ""` does
    // not catch — and JSON.stringify would then omit bccToken while
    // bccTokenExpiresAt still merged (lib/auth.ts applies the two fields in
    // independent `if`s), leaving the session holding the REVOKED old
    // bearer stamped with a FRESH 7-day expiry. That also suppresses the
    // pre-emptive refresh, and resp.ok would be true, so the UI would say
    // "Saved": exactly the defect this module exists to prevent.
    const calls = stubFetch({});
    await expect(
      updateSessionBearer({
        token: undefined as unknown as string,
        expiresIn: 604800,
      }),
    ).resolves.toBe(false);
    expect(calls, "must not even attempt the write").toHaveLength(0);
  });

  it("refuses a non-string token", async () => {
    const calls = stubFetch({});
    for (const bad of [null, 42, {}, []] as unknown[]) {
      await expect(
        updateSessionBearer({ token: bad as string, expiresIn: 604800 }),
      ).resolves.toBe(false);
    }
    expect(calls).toHaveLength(0);
  });

  it("never sends a payload that would stamp an expiry without a token", async () => {
    // The shape that caused the damage: no bccToken, but a fresh
    // bccTokenExpiresAt. It must never reach the wire.
    const calls = stubFetch({});
    await updateSessionBearer({
      token: undefined as unknown as string,
      expiresIn: 604800,
    });
    const post = calls.find((c) => c.url.includes("/api/auth/session"));
    expect(post).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// A 200 is NOT sufficient — next-auth answers 200 for writes it dropped
// ─────────────────────────────────────────────────────────────────────

describe("a 200 that did not actually merge", () => {
  it("is reported as FAILURE when the body carries no merged bearer", async () => {
    // next-auth core/routes/session.js:43 — no session cookie, so it
    // returns the response untouched: 200, no body. Trusting `resp.ok`
    // here told the UI "Saved" while nothing had changed.
    stubFetch({ sessionBody: "{}" });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(false);
  });

  it("is reported as FAILURE on the JWT-error path, which DELETES the session", async () => {
    // core/routes/session.js:88 — the catch logs JWT_SESSION_ERROR and
    // pushes sessionStore.clean(), whose cookies carry maxAge 0. Still
    // 200. This is the dangerous one: reporting success would leave the
    // device rendering private data with no session at all.
    stubFetch({ sessionBody: "" });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(false);
  });

  it("is reported as FAILURE when the echoed bearer is a DIFFERENT token", async () => {
    stubFetch({ sessionBody: JSON.stringify({ bccToken: "some-other-jwt" }) });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(false);
  });

  it("is reported as FAILURE when the body is not JSON at all", async () => {
    stubFetch({ sessionBody: "<html>gateway timeout</html>" });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(false);
  });

  it("does not log the replacement bearer while checking it", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch({});
    await updateSessionBearer(UPDATE);
    for (const s of [spy, warn, error]) {
      for (const call of s.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(UPDATE.token);
      }
    }
    spy.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });
});

describe("a 200 that echoed our token but DELETED the session", () => {
  it("is reported as FAILURE", async () => {
    // core/routes/session.js assigns response.body at :72, BEFORE
    // jwt.encode at :73, and the catch at :86 pushes sessionStore.clean()
    // (maxAge 0) without resetting the body. So the wire response is 200,
    // our token echoed back, and Set-Cookie headers that expire the
    // session. Trusting the echo alone reported success for a session
    // that no longer existed — verbatim the case this file exists for.
    stubFetch({ sessionClearedAfterWrite: true });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(false);
  });

  it("confirms against the live session, not just the echo", async () => {
    const calls = stubFetch({});
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(true);
    const sessionCalls = calls.filter((c) => c.url.includes("/api/auth/session"));
    // POST then a confirming GET.
    expect(sessionCalls).toHaveLength(2);
    expect((sessionCalls[1]?.init?.method ?? "GET").toUpperCase()).toBe("GET");
  });
});

// ─────────────────────────────────────────────────────────────────────
// A confirm that could not be PERFORMED proves nothing
// ─────────────────────────────────────────────────────────────────────

describe("when the confirming GET itself fails", () => {
  // The POST already returned 200 WITH our token echoed back, which means
  // next-auth reached `response.body = updatedSession` AND `jwt.encode`
  // succeeded — the browser holds a valid cookie carrying the new bearer.
  // The session is healthy. Reporting it lost is not a cosmetic mislabel:
  // the UI then offers only "Sign in again", which tears down the healthy
  // session, so the false report makes itself true.
  //
  // This is the doctrine `client.ts`'s own `errorCode()` already applies:
  // a body we cannot read is never treated as a session-ending signal.

  it("a 502 with an HTML body does not disprove the merge", async () => {
    stubFetch({ confirmStatus: 502, confirmBody: "<html>bad gateway</html>" });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(true);
  });

  it("a 200 with a non-JSON body does not disprove the merge", async () => {
    stubFetch({ confirmStatus: 200, confirmBody: "<html>interstitial</html>" });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(true);
  });

  it("a transport failure on the confirm does not disprove the merge", async () => {
    stubFetch({ confirmThrows: true });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(true);
  });

  it("a 429 on the confirm does not disprove the merge", async () => {
    stubFetch({ confirmStatus: 429, confirmBody: '{"error":"slow down"}' });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(true);
  });

  it("but a READABLE session lacking our token still disproves it", async () => {
    // The target case: next-auth threw after assigning the body, so the
    // POST echoed while the cookie was cleaned. The GET then answers
    // 200 {} — readable, and without our token.
    stubFetch({ sessionClearedAfterWrite: true });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(false);
  });

  it("and a readable session carrying a DIFFERENT token still disproves it", async () => {
    stubFetch({ confirmStatus: 200, confirmBody: '{"bccToken":"someone-elses"}' });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(false);
  });
});

describe("every leg is bounded", () => {
  // NOTE on method: `AbortSignal.timeout` is NOT driven by vitest's fake
  // timers in this environment — probed directly, a signal created under
  // fake timers never fires when they advance. So these assert the BUDGET
  // each leg is given, which is deterministic, and the behaviour when a
  // leg rejects is covered separately above. An earlier version of this
  // test simulated a hang and passed for a reason unrelated to the
  // property; a mutation control caught the sibling case.
  it("gives the write legs 6s and the confirm 2s", async () => {
    const budgets: number[] = [];
    const real = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      budgets.push(ms);
      return real(ms);
    });
    stubFetch({});
    await updateSessionBearer(UPDATE);
    // csrf, POST, confirm — in that order.
    expect(budgets).toEqual([6_000, 6_000, 2_000]);
  });

  it("never gives a write leg less than this app allows for the same route", async () => {
    // force-signout bounds /api/auth/csrf at 3s. A leg whose failure is
    // reported as "session lost" must not be tighter than that — and it
    // is also the session write on the hot refresh path, where a
    // premature false leaves bccTokenExpiresAt in the past so every
    // later read re-enters the pre-emptive refresh until the 30/60s
    // throttle turns into 429s and the client renders as signed out.
    const budgets: number[] = [];
    const real = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      budgets.push(ms);
      return real(ms);
    });
    stubFetch({});
    await updateSessionBearer(UPDATE);
    expect(Math.min(budgets[0] ?? 0, budgets[1] ?? 0)).toBeGreaterThan(3_000);
  });
});

describe("a POST that could not be PERFORMED is also indeterminate", () => {
  it("falls through to the confirm instead of reporting a loss", async () => {
    // The doctrine was applied to the confirm leg but not the POST leg. A
    // transport failure or abort on the POST is equally indeterminate —
    // the server may well have merged — and the GET can settle it
    // authoritatively, because the browser has already applied any
    // Set-Cookie. Returning false here reported a restored session as
    // lost, and the only control then offered destroys it.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/auth/csrf")) {
          return new Response(JSON.stringify({ csrfToken: "c" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if ((init?.method ?? "GET").toUpperCase() === "POST") {
          throw new DOMException("timeout", "TimeoutError");
        }
        // The cookie says the merge happened.
        return new Response(JSON.stringify({ bccToken: UPDATE.token }), {
          status: 200,
        });
      }),
    );
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(true);
  });

  it("still treats a non-2xx POST as a real verdict", async () => {
    // next-auth answers 400 on a CSRF failure. That IS a verdict and must
    // not be softened.
    stubFetch({ sessionStatus: 400, sessionBody: "{}" });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(false);
  });
});

describe("the echo check and the confirm are both load-bearing", () => {
  it("a 200 that echoed NOTHING is false even when the confirm cannot run", async () => {
    // This is the combination that makes the echo check matter. A 200
    // with no echoed token is a received RESPONSE saying next-auth
    // dropped the write — a definite verdict. If the confirm then cannot
    // be performed, "a confirm proves nothing" must not promote that
    // refusal to a success.
    //
    // A mutation control found this gap: removing the echo check left the
    // suite green, because every other test had a workable confirm.
    stubFetch({ sessionBody: "{}", confirmThrows: true });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(false);
  });

  it("a 200 echoing a DIFFERENT token is false even when the confirm cannot run", async () => {
    stubFetch({
      sessionBody: JSON.stringify({ bccToken: "someone-elses" }),
      confirmThrows: true,
    });
    await expect(updateSessionBearer(UPDATE)).resolves.toBe(false);
  });
});
