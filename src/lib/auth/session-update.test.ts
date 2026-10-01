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
}): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
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
      if (opts.sessionBody !== undefined) {
        return new Response(opts.sessionBody, {
          status: opts.sessionStatus ?? 200,
        });
      }
      // Echo the merged bearer back, as a real successful write does.
      const sent = JSON.parse(String(init?.body ?? "{}")) as {
        data?: { bccToken?: unknown };
      };
      return new Response(
        JSON.stringify({
          user: { name: "fixture" },
          expires: new Date(Date.now() + 86_400_000).toISOString(),
          bccToken: sent.data?.bccToken,
        }),
        { status: opts.sessionStatus ?? 200 },
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
