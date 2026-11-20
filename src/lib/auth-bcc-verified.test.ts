/**
 * The "bcc-verified" NextAuth provider builds the session from the
 * BACKEND, never from the POST body.
 *
 * Before: authorize() returned the POSTed user_id / handle / expires_in /
 * in_good_standing as the session. Anyone could GET /api/auth/csrf, POST
 * /api/auth/callback/bcc-verified with any user_id and handle, and get a
 * signed session cookie for that account. expires_in went through
 * parseInt unchecked, so NaN disabled the expiry blanking.
 *
 * After: only the token is read. GET /auth/session validates it
 * server-side and returns {user_id, handle, in_good_standing, expires_at};
 * a forged token gets 401 and no session.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
  serverEnv: { BCC_OAUTH_BRIDGE_SECRET: "test-secret" },
}));

const { authOptions, resolveBccSession } = await import("@/lib/auth");

const fetchMock = vi.fn();
const NOW = Date.UTC(2026, 10, 11, 0, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ok = (data: unknown) =>
  new Response(JSON.stringify({ data, _meta: { version: "v1" } }), { status: 200 });
const err = (status: number, code: string) =>
  new Response(JSON.stringify({ error: { code, message: "x" } }), { status });

const SESSION = { user_id: 42, handle: "real-handle", in_good_standing: true, expires_at: NOW / 1000 + 3600 };

/** The provider's own authorize(), as NextAuth would call it. */
function authorizeBccVerified(body: Record<string, string>) {
  // next-auth v4's Credentials() keeps a custom id under `options.id`.
  type CredProvider = { id: string; options?: { id?: string; authorize: (c: Record<string, string>) => Promise<unknown> } };
  const providers = authOptions.providers as unknown as CredProvider[];
  const provider = providers.find((p) => (p.options?.id ?? p.id) === "bcc-verified");
  if (provider?.options === undefined) throw new Error("bcc-verified provider not found");
  return provider.options.authorize(body);
}

describe("resolveBccSession", () => {
  it("asks GET /auth/session with the token as Bearer and maps the response", async () => {
    fetchMock.mockResolvedValue(ok(SESSION));
    const user = await resolveBccSession("tok-1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://wp.example/wp-json/bcc/v1/auth/session");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok-1");
    expect(user).toEqual({
      id: "42",
      handle: "real-handle",
      bccToken: "tok-1",
      bccTokenExpiresAt: SESSION.expires_at * 1000,
      inGoodStanding: true,
    });
  });

  it.each([
    [401, "bcc_unauthorized"],
    [409, "bcc_invalid_state"],
    [429, "bcc_rate_limited"],
  ])("a %i is no session: throws %s", async (status, code) => {
    fetchMock.mockResolvedValue(err(status, code));
    await expect(resolveBccSession("tok")).rejects.toThrow(code);
  });

  it.each([
    ["a non-integer user_id", { ...SESSION, user_id: "42" }],
    ["an empty handle", { ...SESSION, handle: "" }],
    ["a non-boolean standing", { ...SESSION, in_good_standing: "true" }],
    ["a NaN expiry", { ...SESSION, expires_at: Number.NaN }],
    ["an expiry well in the past", { ...SESSION, expires_at: NOW / 1000 - 3600 }],
    ["an expiry more than 30 days ahead", { ...SESSION, expires_at: NOW / 1000 + 31 * 86400 }],
  ])("rejects %s", async (_label, data) => {
    fetchMock.mockResolvedValue(ok(data));
    await expect(resolveBccSession("tok")).rejects.toThrow("bcc_invalid_envelope");
  });

  it("accepts an exp just inside the backend's 60s skew", async () => {
    fetchMock.mockResolvedValue(ok({ ...SESSION, expires_at: NOW / 1000 - 30 }));
    await expect(resolveBccSession("tok")).resolves.toMatchObject({ id: "42" });
  });

  it("a network failure is bcc_network_error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(resolveBccSession("tok")).rejects.toThrow("bcc_network_error");
  });
});

describe("the bcc-verified provider", () => {
  it("a FORGED post (random token, someone else's user_id/handle) gets no session", async () => {
    fetchMock.mockResolvedValue(err(401, "bcc_unauthorized"));
    await expect(
      authorizeBccVerified({
        token: "forged",
        user_id: "1",
        handle: "admin",
        expires_in: "999999999",
        in_good_standing: "true",
      }),
    ).rejects.toThrow("bcc_unauthorized");
  });

  it("ignores the posted identity: the session is what the backend says", async () => {
    fetchMock.mockResolvedValue(ok(SESSION));
    const user = await authorizeBccVerified({
      token: "real-token",
      user_id: "1",
      handle: "admin",
      expires_in: "NaN",
      in_good_standing: "false",
    });
    expect(user).toMatchObject({ id: "42", handle: "real-handle", inGoodStanding: true });
  });

  it("no token is bcc_invalid_request, with no backend call", async () => {
    await expect(authorizeBccVerified({ user_id: "1", handle: "admin" })).rejects.toThrow("bcc_invalid_request");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
