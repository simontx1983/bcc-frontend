/**
 * A refresh that is REJECTED doesn't always mean the session is over.
 *
 * Since bcc-trust F-282, a refresh retires the token it replaced after a
 * 120 s overlap. So a request still carrying the old token, or a tab
 * whose in-memory bearer was lost, can have its refresh rejected while
 * the session cookie already holds a newer token another tab minted.
 * Ending the session there would sign out every tab for nothing.
 *
 * Pinned: on a rejected refresh the client re-reads the session once; if
 * the cookie's bearer differs (same viewer), it carries on with it. Only
 * an unchanged cookie, or a retry that is refused too, ends the session.
 * Also: a failed session write after a successful refresh is retried.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  endSession: (reason: string, opts?: unknown) => {
    endSession(reason, opts);
    return Promise.resolve({});
  },
  currentViewerEpoch: () => epoch,
  isStaleEpoch: (e: number) => e !== epoch,
}));

const updateSessionBearer = vi.fn();
vi.mock("@/lib/auth/session-update", () => ({
  updateSessionBearer: (u: unknown) => updateSessionBearer(u),
}));

import { bccFetchAsClient, resolveAuthFailure } from "@/lib/api/client";
import { __resetPendingBearerForTests } from "@/lib/auth/current-bearer";

const jwt = (claims: { sub: string; user_id: number; tv: number }, sig = "s") =>
  `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${sig}`;

/** Superseded by another tab's refresh: refused everywhere, refresh included. */
const OLD = jwt({ sub: "1", user_id: 1, tv: 1 }, "old");
/** What the other tab's refresh minted; the cookie now holds it. */
const NEW = jwt({ sub: "1", user_id: 1, tv: 1 }, "new");
const OTHER_ACCOUNT = jwt({ sub: "2", user_id: 2, tv: 0 }, "other");

const session = (token: string, expired = false) => ({
  bccToken: token,
  bccTokenExpiresAt: expired ? Date.now() - 1_000 : Date.now() + 60_000,
  user: { id: "1", handle: "a" },
});

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** The server: only `live` bearers work; every refresh is rejected. */
function server(live: string[]) {
  const seen: string[] = [];
  const refreshedWith: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const bearer = (new Headers(init?.headers ?? {}).get("Authorization") ?? "").replace(/^Bearer /, "");
      if (url.includes("/auth/refresh")) {
        refreshedWith.push(bearer);
        return json({ error: { code: "bcc_unauthorized", message: "x", status: 401 } }, 401);
      }
      seen.push(bearer);
      return live.includes(bearer)
        ? json({ data: { ok: true }, _meta: { version: "v1" } }, 200)
        : json({ error: { code: "bcc_token_invalid", message: "x", status: 401 } }, 401);
    }),
  );
  return { seen, refreshedWith };
}

beforeEach(() => {
  epoch = 0;
  endSession.mockClear();
  getSession.mockReset();
  updateSessionBearer.mockReset();
  __resetPendingBearerForTests();
});
afterEach(() => vi.unstubAllGlobals());

describe("a rejected refresh re-reads the session before signing out", () => {
  it("(b) an old-token 401, a rejected refresh, a newer bearer in the cookie: retried, no sign-out", async () => {
    const s = server([NEW]);
    // Dispatch and the in-flight swap check still see OLD; by the time the
    // refresh is refused the cookie holds the other tab's NEW.
    getSession
      .mockResolvedValueOnce(session(OLD))
      .mockResolvedValueOnce(session(OLD))
      .mockResolvedValue(session(NEW));

    await expect(bccFetchAsClient("me/badges")).resolves.toEqual({ ok: true });
    expect(s.seen).toEqual([OLD, NEW]);
    expect(s.refreshedWith).toEqual([OLD]);
    expect(endSession).not.toHaveBeenCalled();
  });

  it("control: the cookie still holds the refused bearer → the session ends, once", async () => {
    const s = server([]);
    getSession.mockResolvedValue(session(OLD));

    await expect(bccFetchAsClient("me/badges")).rejects.toMatchObject({ status: 401 });
    expect(s.refreshedWith).toEqual([OLD]);
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(endSession).toHaveBeenCalledWith("expired", { notice: "signed-out" });
  });

  it("the cookie's bearer is refused too → the session ends", async () => {
    const s = server([]);
    getSession
      .mockResolvedValueOnce(session(OLD))
      .mockResolvedValueOnce(session(OLD))
      .mockResolvedValue(session(NEW));

    await expect(bccFetchAsClient("me/badges")).rejects.toMatchObject({ status: 401 });
    expect(s.seen).toEqual([OLD, NEW]);
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it("another account's bearer in the cookie is never used", async () => {
    const s = server([OTHER_ACCOUNT]);
    getSession
      .mockResolvedValueOnce(session(OLD))
      .mockResolvedValueOnce(session(OLD))
      .mockResolvedValue(session(OTHER_ACCOUNT));

    await expect(bccFetchAsClient("me/badges")).rejects.toMatchObject({ status: 401 });
    expect(s.seen).toEqual([OLD]);
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it("the pre-emptive refresh path also carries on with the cookie's newer bearer", async () => {
    const s = server([NEW]);
    // The session says the bearer expired; the refresh of it is refused;
    // the cookie now holds a newer one.
    getSession.mockResolvedValueOnce(session(OLD, true)).mockResolvedValue(session(NEW));

    await expect(bccFetchAsClient("me/badges")).resolves.toEqual({ ok: true });
    expect(s.refreshedWith).toEqual([OLD]);
    expect(s.seen).toEqual([NEW]);
    expect(endSession).not.toHaveBeenCalled();
  });

  it("the bcc-trust client's classifier returns the cookie's newer bearer instead of signing out", async () => {
    server([NEW]);
    getSession.mockResolvedValue(session(NEW));

    await expect(resolveAuthFailure(OLD)).resolves.toBe(NEW);
    expect(endSession).not.toHaveBeenCalled();
  });
});

describe("a successful refresh's session write", () => {
  it("is retried once when it fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ data: { token: NEW, expires_in: 604800 }, _meta: { version: "v1" } }, 200)),
    );
    updateSessionBearer.mockResolvedValueOnce(false).mockResolvedValue(true);

    await expect(resolveAuthFailure(OLD)).resolves.toBe(NEW);
    expect(updateSessionBearer).toHaveBeenCalledTimes(2);
  });

  it("is not repeated when it succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ data: { token: NEW, expires_in: 604800 }, _meta: { version: "v1" } }, 200)),
    );
    updateSessionBearer.mockResolvedValue(true);

    await resolveAuthFailure(OLD);
    expect(updateSessionBearer).toHaveBeenCalledTimes(1);
  });
});
