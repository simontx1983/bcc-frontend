/**
 * The bearer-swap race: password change, email-change confirm,
 * verify-email and a refresh all revoke the old bearer and hand back a
 * new one. Between the server's revoke and the session write landing, a
 * request carrying the OLD bearer gets a 401. That 401 is about the old
 * token, not the session, so it must retry with the newer bearer. It
 * must never refresh the revoked token (rejected) and end the session.
 *
 * The control cases pin that a genuine 401, with no newer bearer
 * anywhere, still takes the refresh-then-classify path.
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

import { bccFetchAsClient } from "@/lib/api/client";
import { bccTrustFetch } from "@/lib/api/bcc-trust-client";
import {
  __resetPendingBearerForTests,
  notePendingBearer,
  pendingBearer,
} from "@/lib/auth/current-bearer";
import { BccApiError } from "@/lib/api/types";

const OLD = "old-revoked-token";
const NEW = "new-token";

const session = (token: string) => ({
  bccToken: token,
  bccTokenExpiresAt: Date.now() + 60_000,
  user: { id: "1", handle: "a" },
});

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * The server: OLD is revoked (401 everywhere, refresh included); NEW
 * works. Records every bearer it saw on the protected route and every
 * refresh attempt.
 */
function server(onOldBearer?: () => void) {
  const seen: string[] = [];
  const refreshedWith: string[] = [];
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    const auth = new Headers(init?.headers ?? {}).get("Authorization") ?? "";
    const bearer = auth.replace(/^Bearer /, "");
    if (url.includes("/auth/refresh")) {
      refreshedWith.push(bearer);
      return json({ error: { code: "bcc_unauthorized", message: "x", status: 401 } }, 401);
    }
    seen.push(bearer);
    if (bearer === OLD) onOldBearer?.();
    const trust = url.includes("/bcc-trust/v1");
    if (bearer === NEW) {
      return trust ? json({ success: true, data: { ok: true } }, 200) : json({ data: { ok: true }, _meta: { version: "v1" } }, 200);
    }
    return trust
      ? json({ code: "bcc_unauthorized", message: "x" }, 401)
      : json({ error: { code: "bcc_unauthorized", message: "x", status: 401 } }, 401);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { seen, refreshedWith };
}

beforeEach(() => {
  epoch = 0;
  endSession.mockClear();
  getSession.mockReset();
  __resetPendingBearerForTests();
});
afterEach(() => vi.unstubAllGlobals());

describe("bccFetchAsClient — bearer swapped mid-flight", () => {
  it("a 401 on the old bearer retries with the session's newer one; no refresh, no sign-out", async () => {
    const s = server();
    // Dispatch reads OLD; by the time the 401 lands the session holds NEW
    // (another tab, or the session write completed).
    getSession.mockResolvedValueOnce(session(OLD)).mockResolvedValue(session(NEW));

    await expect(bccFetchAsClient("me/badges")).resolves.toEqual({ ok: true });
    expect(s.seen).toEqual([OLD, NEW]);
    expect(s.refreshedWith).toEqual([]);
    expect(endSession).not.toHaveBeenCalled();
  });

  it("a pending replacement in this tab is sent straight away, before the session write lands", async () => {
    const s = server();
    getSession.mockResolvedValue(session(OLD));
    notePendingBearer(NEW, 3600);

    await expect(bccFetchAsClient("me/badges")).resolves.toEqual({ ok: true });
    expect(s.seen).toEqual([NEW]);
    expect(endSession).not.toHaveBeenCalled();
  });

  it("a 401 on the old bearer retries with the PENDING one when the session still holds the old", async () => {
    // The replacement is noted WHILE the old-bearer request is in flight:
    // the server revokes OLD and the client notes NEW before the 401 lands.
    const s = server(() => notePendingBearer(NEW, 3600));
    getSession.mockResolvedValue(session(OLD));

    await expect(bccFetchAsClient("me/badges")).resolves.toEqual({ ok: true });
    expect(s.seen).toEqual([OLD, NEW]);
    expect(s.refreshedWith).toEqual([]);
    expect(endSession).not.toHaveBeenCalled();
  });

  it("control: a genuine 401 with no newer bearer still refreshes, and a rejection ends the session", async () => {
    const s = server();
    getSession.mockResolvedValue(session(OLD));

    await expect(bccFetchAsClient("me/badges")).rejects.toBeInstanceOf(BccApiError);
    expect(s.refreshedWith).toEqual([OLD]);
    expect(endSession).toHaveBeenCalledWith("expired", { notice: "signed-out" });
  });

  it("a pending bearer from a previous viewer is never sent", () => {
    notePendingBearer(NEW, 3600);
    epoch = 1; // the viewer boundary moved (sign-out / switch)
    expect(pendingBearer()).toBeNull();
  });

  it("an expired pending bearer is dropped", () => {
    notePendingBearer(NEW, -1);
    expect(pendingBearer()).toBeNull();
  });
});

describe("bccTrustFetch — bearer swapped mid-flight", () => {
  it("a 401 on the old bearer retries once with the newer one; no refresh, no sign-out", async () => {
    const s = server();
    getSession.mockResolvedValueOnce(session(OLD)).mockResolvedValue(session(NEW));

    await expect(bccTrustFetch("/disputes")).resolves.toEqual({ ok: true });
    expect(s.seen).toEqual([OLD, NEW]);
    expect(s.refreshedWith).toEqual([]);
    expect(endSession).not.toHaveBeenCalled();
  });

  it("control: a genuine 401 with no newer bearer still goes to the shared classifier", async () => {
    const s = server();
    getSession.mockResolvedValue(session(OLD));

    await expect(bccTrustFetch("/disputes")).rejects.toBeInstanceOf(BccApiError);
    expect(s.seen).toEqual([OLD]);
    expect(s.refreshedWith).toEqual([OLD]);
    expect(endSession).toHaveBeenCalledWith("expired", { notice: "signed-out" });
  });
});
