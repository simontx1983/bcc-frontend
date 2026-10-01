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
      return new Response("{}", { status: opts.sessionStatus ?? 200 });
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
