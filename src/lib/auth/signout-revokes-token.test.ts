/**
 * F-282 — signing out revokes this session's API token on the server.
 *
 * Before: sign-out cleared the NextAuth cookie and local state but never
 * called POST /auth/logout, so the bearer JWT inside the cookie stayed
 * valid for up to 7 days. Now the teardown revokes it — after push
 * cleanup (whose DELETE needs the same token) and before signOut (which
 * drops the session the token is read from) — bounded, never blocking.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionTeardownHandlers } from "@/lib/auth/session-boundary";

const session = vi.hoisted(() => ({ value: null as null | { bccToken?: string } }));
const logoutToken = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({
  getSession: async () => session.value,
}));
vi.mock("@/lib/api/auth-endpoints", () => ({
  logoutToken: (...a: unknown[]) => logoutToken(...a),
}));

const boundary = await import("@/lib/auth/session-boundary");
const { revokeTokenForSessionEnd } = await import("@/lib/auth/revoke-token");

let order: string[] = [];

function handlers(over: Partial<SessionTeardownHandlers> = {}): SessionTeardownHandlers {
  return {
    purgeQueryCache: () => {
      order.push("purgeQueryCache");
    },
    purgeViewerStorage: () => {
      order.push("purgeViewerStorage");
      return "cleared" as const;
    },
    purgeArrivalStorage: () => "cleared" as const,
    invalidateQueryCache: () => {},
    revokePush: async () => {
      order.push("revokePush");
      return "revoked" as const;
    },
    revokeToken: async () => {
      order.push("revokeToken");
      return true;
    },
    signOut: async () => {
      order.push("signOut");
    },
    ...over,
  };
}

beforeEach(() => {
  order = [];
  boundary.__resetSessionBoundaryForTests();
  logoutToken.mockReset();
  session.value = null;
  vi.useRealTimers();
});
afterEach(() => {
  boundary.__resetSessionBoundaryForTests();
  vi.useRealTimers();
});

describe("teardown revokes the token", () => {
  it("after push cleanup and before signOut", async () => {
    boundary.registerSessionTeardown(handlers());
    const result = await boundary.endSession("user");
    expect(order).toEqual(["purgeQueryCache", "revokePush", "revokeToken", "purgeViewerStorage", "signOut"]);
    expect(result.tokenRevoked).toBe(true);
    expect(result.signedOut).toBe(true);
  });

  it("a failing revocation never blocks signing out", async () => {
    boundary.registerSessionTeardown(
      handlers({
        revokeToken: async () => {
          throw new Error("network");
        },
      }),
    );
    const result = await boundary.endSession("user");
    expect(result.tokenRevoked).toBe(false);
    expect(result.signedOut).toBe(true);
  });

  it("a hanging revocation is cut off at its budget and signing out continues", async () => {
    vi.useFakeTimers();
    boundary.registerSessionTeardown(handlers({ revokeToken: () => new Promise<boolean>(() => {}) }));
    const pending = boundary.endSession("user");
    await vi.advanceTimersByTimeAsync(boundary.TOKEN_REVOKE_TIMEOUT_MS + 50);
    const result = await pending;
    expect(result.tokenRevoked).toBe(false);
    expect(result.signedOut).toBe(true);
    expect(order).toContain("signOut");
  });

  it("an older registration without revokeToken still signs out", async () => {
    const h = handlers();
    delete h.revokeToken;
    boundary.registerSessionTeardown(h);
    const result = await boundary.endSession("user");
    expect(result.tokenRevoked).toBe(false);
    expect(result.signedOut).toBe(true);
  });
});

describe("revokeTokenForSessionEnd", () => {
  it("POSTs /auth/logout with the session's own token", async () => {
    session.value = { bccToken: "tok-abc" };
    logoutToken.mockResolvedValue({ ok: true });
    await expect(revokeTokenForSessionEnd()).resolves.toBe(true);
    expect(logoutToken).toHaveBeenCalledWith("tok-abc");
  });

  it("does nothing without a token", async () => {
    session.value = null;
    await expect(revokeTokenForSessionEnd()).resolves.toBe(false);
    expect(logoutToken).not.toHaveBeenCalled();
  });

  it("never throws when the call fails", async () => {
    session.value = { bccToken: "tok-abc" };
    logoutToken.mockRejectedValue(new Error("500"));
    await expect(revokeTokenForSessionEnd()).resolves.toBe(false);
  });
});
