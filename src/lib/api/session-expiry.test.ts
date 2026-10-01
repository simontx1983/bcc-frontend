/**
 * Which 401s end a session, and which must not.
 *
 * The defect this pins: `tryRefresh` used to `return null` on ANY
 * non-ok response, so a 429, a 500, an offline blip and a definitive
 * "token cannot be refreshed" were indistinguishable — and every one of
 * them signed the viewer out. A flaky network looked like a logout.
 *
 * The real codes from POST /auth/refresh (SessionController.php:154-192):
 *   401 bcc_unauthorized  "Token cannot be refreshed."
 *   403 bcc_forbidden     "Account is not in good standing."
 *   429 bcc_rate_limited  "Too many refresh attempts."
 *
 * Also pinned: a protected request is never retried with a token the
 * server has already refused.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same convention as the sibling client tests — lib/env throws on a
// missing NEXT_PUBLIC_BCC_API_URL, which vitest has no reason to supply.
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const getSession = vi.fn();
vi.mock("next-auth/react", () => ({
  getSession: () => getSession(),
  signOut: vi.fn(),
}));

const endSession = vi.fn();
let epoch = 0;
vi.mock("@/lib/auth/session-boundary", () => ({
  endSession: (reason: string) => {
    endSession(reason);
    return Promise.resolve({});
  },
  currentViewerEpoch: () => epoch,
  isStaleEpoch: (e: number) => e !== epoch,
}));

import { bccFetchAsClient, StaleViewerError } from "@/lib/api/client";
import { BccApiError } from "@/lib/api/types";

const LIVE_TOKEN = "live-token";

/** A session whose bearer NextAuth already believes is past expiry. */
function expiredSession() {
  return {
    bccToken: LIVE_TOKEN,
    bccTokenExpiresAt: Date.now() - 1_000,
    user: { id: "1", handle: "a" },
  };
}
/** A session NextAuth still believes in. */
function liveSession() {
  return {
    bccToken: LIVE_TOKEN,
    bccTokenExpiresAt: Date.now() + 60_000,
    user: { id: "1", handle: "a" },
  };
}

/** Bodies keyed by URL fragment, so order of calls doesn't matter. */
function routeFetch(routes: {
  refresh: () => Response | Promise<Response>;
  protectedCall?: (authHeader: string | null) => Response | Promise<Response>;
}) {
  return vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/auth/refresh")) {
      return routes.refresh();
    }
    if (url.includes("/api/auth/csrf")) {
      return new Response(JSON.stringify({ csrfToken: "c" }), { status: 200 });
    }
    if (url.includes("/api/auth/session")) {
      return new Response("{}", { status: 200 });
    }
    const headers = new Headers(init?.headers ?? {});
    const auth = headers.get("Authorization");
    if (routes.protectedCall !== undefined) {
      return routes.protectedCall(auth);
    }
    return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
  });
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const unauthorized = () =>
  json(
    { error: { code: "bcc_unauthorized", message: "Unauthorized", status: 401 } },
    401,
  );

beforeEach(() => {
  epoch = 0;
  endSession.mockClear();
  getSession.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────
// The taxonomy
// ─────────────────────────────────────────────────────────────────────

describe("a definitive rejection ends the session", () => {
  it("401 from /auth/refresh after a 401 on the call → endSession('expired')", async () => {
    getSession.mockResolvedValue(liveSession());
    vi.stubGlobal(
      "fetch",
      routeFetch({ refresh: () => unauthorized(), protectedCall: () => unauthorized() }),
    );

    await expect(bccFetchAsClient("me/thing")).rejects.toBeInstanceOf(BccApiError);
    expect(endSession).toHaveBeenCalledWith("expired");
  });
});

describe("a transient refresh failure RETAINS the session", () => {
  it("429 rate limit does not sign the viewer out", async () => {
    getSession.mockResolvedValue(liveSession());
    vi.stubGlobal(
      "fetch",
      routeFetch({
        refresh: () =>
          json({ error: { code: "bcc_rate_limited", status: 429 } }, 429),
        protectedCall: () => unauthorized(),
      }),
    );

    await expect(bccFetchAsClient("me/thing")).rejects.toBeInstanceOf(BccApiError);
    expect(endSession).not.toHaveBeenCalled();
  });

  it("500 from the refresh endpoint does not sign the viewer out", async () => {
    getSession.mockResolvedValue(liveSession());
    vi.stubGlobal(
      "fetch",
      routeFetch({
        refresh: () => new Response("boom", { status: 500 }),
        protectedCall: () => unauthorized(),
      }),
    );
    await expect(bccFetchAsClient("me/thing")).rejects.toBeInstanceOf(BccApiError);
    expect(endSession).not.toHaveBeenCalled();
  });

  it("a network failure reaching /auth/refresh does not sign the viewer out", async () => {
    getSession.mockResolvedValue(liveSession());
    vi.stubGlobal(
      "fetch",
      routeFetch({
        refresh: () => {
          throw new TypeError("Failed to fetch");
        },
        protectedCall: () => unauthorized(),
      }),
    );
    await expect(bccFetchAsClient("me/thing")).rejects.toBeInstanceOf(BccApiError);
    expect(endSession).not.toHaveBeenCalled();
  });

  it("a 200 refresh with an unusable body does not sign the viewer out", async () => {
    getSession.mockResolvedValue(liveSession());
    vi.stubGlobal(
      "fetch",
      routeFetch({
        refresh: () => json({ data: { nothing: true }, _meta: { version: "v1" } }, 200),
        protectedCall: () => unauthorized(),
      }),
    );
    await expect(bccFetchAsClient("me/thing")).rejects.toBeInstanceOf(BccApiError);
    expect(endSession).not.toHaveBeenCalled();
  });
});

describe("a standing refusal is not an expiry", () => {
  it("403 not-in-good-standing retains the session so the reason stays visible", async () => {
    getSession.mockResolvedValue(liveSession());
    vi.stubGlobal(
      "fetch",
      routeFetch({
        refresh: () =>
          json(
            { error: { code: "bcc_forbidden", message: "Account is not in good standing.", status: 403 } },
            403,
          ),
        protectedCall: () => unauthorized(),
      }),
    );
    await expect(bccFetchAsClient("me/thing")).rejects.toBeInstanceOf(BccApiError);
    expect(endSession).not.toHaveBeenCalled();
  });
});

describe("an ANONYMOUS 401 is an endpoint denial, never a session event", () => {
  it("does not refresh and does not sign out", async () => {
    getSession.mockResolvedValue(null);
    const f = routeFetch({
      refresh: () => unauthorized(),
      protectedCall: () => unauthorized(),
    });
    vi.stubGlobal("fetch", f);

    await expect(bccFetchAsClient("me/tours-seen")).rejects.toBeInstanceOf(BccApiError);
    expect(endSession).not.toHaveBeenCalled();
    const refreshCalls = f.mock.calls.filter((c) =>
      String(c[0]).includes("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Never retry with a refused token
// ─────────────────────────────────────────────────────────────────────

describe("a refused token is never reused on a protected request", () => {
  it("pre-emptive refresh rejected → the request goes out with NO bearer", async () => {
    getSession.mockResolvedValue(expiredSession());
    const seen: (string | null)[] = [];
    vi.stubGlobal(
      "fetch",
      routeFetch({
        refresh: () => unauthorized(),
        protectedCall: (auth) => {
          seen.push(auth);
          return json({ data: { ok: true }, _meta: { version: "v1" } }, 200);
        },
      }),
    );

    await bccFetchAsClient("me/thing").catch(() => undefined);
    expect(seen).toEqual([null]);
    expect(seen).not.toContain(`Bearer ${LIVE_TOKEN}`);
    expect(endSession).toHaveBeenCalledWith("expired");
  });

  it("pre-emptive refresh rate-limited → still no bearer, and session retained", async () => {
    getSession.mockResolvedValue(expiredSession());
    const seen: (string | null)[] = [];
    vi.stubGlobal(
      "fetch",
      routeFetch({
        refresh: () => json({ error: { code: "bcc_rate_limited" } }, 429),
        protectedCall: (auth) => {
          seen.push(auth);
          return json({ data: { ok: true }, _meta: { version: "v1" } }, 200);
        },
      }),
    );

    await bccFetchAsClient("me/thing").catch(() => undefined);
    expect(seen).toEqual([null]);
    expect(endSession).not.toHaveBeenCalled();
  });

  it("a successful refresh DOES retry, with the new token", async () => {
    getSession.mockResolvedValue(liveSession());
    const seen: (string | null)[] = [];
    let call = 0;
    vi.stubGlobal(
      "fetch",
      routeFetch({
        refresh: () => json({ data: { token: "fresh", expires_in: 604800 }, _meta: { version: "v1" } }, 200),
        protectedCall: (auth) => {
          seen.push(auth);
          call += 1;
          return call === 1 ? unauthorized() : json({ data: { ok: true }, _meta: { version: "v1" } }, 200);
        },
      }),
    );

    await expect(bccFetchAsClient("me/thing")).resolves.toBeDefined();
    expect(seen).toEqual([`Bearer ${LIVE_TOKEN}`, "Bearer fresh"]);
    expect(endSession).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Late responses
// ─────────────────────────────────────────────────────────────────────

describe("late responses cannot reach the caller", () => {
  it("an authed read that resolves after the boundary throws StaleViewerError", async () => {
    getSession.mockResolvedValue(liveSession());
    vi.stubGlobal(
      "fetch",
      routeFetch({
        refresh: () => unauthorized(),
        protectedCall: () => {
          // The boundary moves while this request is in flight — exactly
          // the viewer-A-payload-arrives-after-sign-out case.
          epoch += 1;
          return json({ data: { secret: "viewer A private" }, _meta: { version: "v1" } }, 200);
        },
      }),
    );

    await expect(bccFetchAsClient("me/private")).rejects.toBeInstanceOf(
      StaleViewerError,
    );
  });

  it("an ANONYMOUS read is not discarded by a boundary move", async () => {
    // Anonymous data belongs to nobody; discarding it would break
    // legitimate public reads that happen to straddle a sign-out.
    getSession.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      routeFetch({
        refresh: () => unauthorized(),
        protectedCall: () => {
          epoch += 1;
          return json({ data: { public: true }, _meta: { version: "v1" } }, 200);
        },
      }),
    );
    await expect(bccFetchAsClient("cards/public")).resolves.toBeDefined();
  });

  it("an authed read that resolves BEFORE any boundary move is returned", async () => {
    getSession.mockResolvedValue(liveSession());
    vi.stubGlobal(
      "fetch",
      routeFetch({
        refresh: () => unauthorized(),
        protectedCall: () => json({ data: { ok: true }, _meta: { version: "v1" } }, 200),
      }),
    );
    await expect(bccFetchAsClient("me/thing")).resolves.toBeDefined();
  });
});
