/**
 * F-582: `suspended` (contract v1.136, F-305) reaches the session as an
 * OPTIONAL boolean, display only, for the suspension notice.
 *
 *   - every sign-in path carries it when the auth response has a boolean;
 *   - absent stays ABSENT (unknown, so no notice) all the way to the session;
 *   - the client update() seam cannot SET it, but may ASK for a server
 *     re-read (`refreshStanding`): GET /auth/session with the session's own
 *     token, adopted only for this session's user; a failed read changes
 *     nothing;
 *   - the notice gate is `=== true`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
  serverEnv: { BCC_OAUTH_BRIDGE_SECRET: "test-secret", ANALYTICS_ID_SECRET: null },
}));

const { authOptions } = await import("@/lib/auth");
const { suspendedCredential, parseSuspendedCredential, sessionSuspended } = await import("@/lib/auth/auth-flags");
const { canModerateCredential } = await import("@/lib/auth/can-moderate");

type Authorize = (credentials: Record<string, string>) => Promise<Record<string, unknown>>;
function authorize(id: string): Authorize {
  const provider = authOptions.providers.find(
    (p) => (p as unknown as { options?: { id?: string } }).options?.id === id,
  ) as unknown as { options: { authorize: Authorize } } | undefined;
  if (provider === undefined) throw new Error(`no provider ${id}`);
  return provider.options.authorize;
}
type Cb = (a: Record<string, unknown>) => Promise<Record<string, unknown>>;
const jwt = () => authOptions.callbacks?.jwt as unknown as Cb;
const session = () => authOptions.callbacks?.session as unknown as Cb;

const BRIDGE = { user_id: "7", handle: "welder", token: "tok", expires_in: "3600", in_good_standing: "true" };
const TOKEN_RESPONSE = { user_id: 7, handle: "welder", token: "tok", expires_in: 3600, token_type: "Bearer", in_good_standing: true };

const fetchMock = vi.fn();
const reply = (data: Record<string, unknown>) =>
  new Response(JSON.stringify({ data, _meta: { version: "v1" } }), { status: 200 });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("sign-in carries `suspended`", () => {
  it.each([
    ["true", true],
    ["false", false],
  ])('bcc-verified: suspended "%s" → %s', async (raw, flag) => {
    const user = await authorize("bcc-verified")({ ...BRIDGE, suspended: raw });
    expect(user["suspended"]).toBe(flag);
  });

  it.each([["absent", undefined], ["garbage", "yes"], ["empty", ""]])("bcc-verified: %s → no key", async (_l, raw) => {
    const creds: Record<string, string> = { ...BRIDGE };
    if (raw !== undefined) creds["suspended"] = raw;
    expect("suspended" in (await authorize("bcc-verified")(creds))).toBe(false);
  });

  it("the client pages send it only for a boolean (and can_moderate is unchanged)", () => {
    expect(suspendedCredential({ suspended: true })).toEqual({ suspended: "true" });
    expect(suspendedCredential({ suspended: false })).toEqual({ suspended: "false" });
    expect(suspendedCredential({})).toEqual({});
    expect(suspendedCredential({ suspended: "true" })).toEqual({});
    expect(parseSuspendedCredential("TRUE")).toBeUndefined();
    // can_moderate now shares the helper; its behaviour must not move.
    expect(canModerateCredential({ can_moderate: true })).toEqual({ can_moderate: "true" });
    expect(canModerateCredential({ can_moderate: "true" })).toEqual({});
  });

  it("the wallet provider carries a boolean, and nothing else", async () => {
    fetchMock.mockResolvedValue(reply({ ...TOKEN_RESPONSE, suspended: true }));
    expect((await authorize("wallet")({ wallet_address: "a", signature: "s", extra: "" }))["suspended"]).toBe(true);
    fetchMock.mockResolvedValue(reply({ ...TOKEN_RESPONSE, suspended: "true" }));
    expect("suspended" in (await authorize("wallet")({ wallet_address: "a", signature: "s", extra: "" }))).toBe(false);
  });

  it("the OAuth first sign-in carries it from /auth/oauth", async () => {
    fetchMock.mockResolvedValue(reply({ ...TOKEN_RESPONSE, suspended: true }));
    const token = await jwt()({
      token: {},
      user: { id: "x", email: null, name: "W" },
      account: { type: "oauth", provider: "google", providerAccountId: "g-1" },
      profile: {},
    });
    expect(token["suspended"]).toBe(true);
  });
});

describe("jwt → session", () => {
  const signIn = async (user: Record<string, unknown>) =>
    jwt()({ token: { sub: "7" }, user: { id: "7", handle: "welder", bccToken: "tok", bccTokenExpiresAt: Date.now() + 3_600_000, inGoodStanding: true, ...user } });
  const project = async (token: Record<string, unknown>) =>
    (await session()({ session: { user: {}, expires: "" }, token }))["user"] as Record<string, unknown>;

  it("true and false reach the session; absent stays absent", async () => {
    expect((await project(await signIn({ suspended: true })))["suspended"]).toBe(true);
    expect((await project(await signIn({ suspended: false })))["suspended"]).toBe(false);
    const token = await signIn({});
    expect("suspended" in token).toBe(false);
    expect("suspended" in (await project(token))).toBe(false);
  });
});

describe("the update() seam: the client may ask, never tell", () => {
  const SESSION_TOKEN = { id: "7", handle: "welder", bccToken: "tok", bccTokenExpiresAt: Date.now() + 3_600_000 };
  const update = (token: Record<string, unknown>, body: Record<string, unknown>) =>
    jwt()({ token: { ...token }, trigger: "update", session: body });

  it("a client-supplied value is ignored", async () => {
    const token = await update(SESSION_TOKEN, { suspended: true });
    expect("suspended" in token).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshStanding re-reads GET /auth/session with the session's own token", async () => {
    fetchMock.mockResolvedValue(reply({ user_id: 7, handle: "welder", in_good_standing: true, suspended: true }));
    const token = await update(SESSION_TOKEN, { refreshStanding: true });
    expect(token["suspended"]).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://wp.example/wp-json/bcc/v1/auth/session");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("a lifted suspension clears on the re-read", async () => {
    fetchMock.mockResolvedValue(reply({ user_id: 7, handle: "welder", suspended: false }));
    expect((await update({ ...SESSION_TOKEN, suspended: true }, { refreshStanding: true }))["suspended"]).toBe(false);
  });

  it("another user's answer is never adopted", async () => {
    fetchMock.mockResolvedValue(reply({ user_id: 8, handle: "someone", suspended: true }));
    expect("suspended" in (await update(SESSION_TOKEN, { refreshStanding: true }))).toBe(false);
  });

  it.each([
    ["a 503", () => fetchMock.mockResolvedValue(new Response("{}", { status: 503 }))],
    ["a network error", () => fetchMock.mockRejectedValue(new TypeError("fetch failed"))],
    ["no boolean in the answer", () => fetchMock.mockResolvedValue(reply({ user_id: 7, handle: "welder" }))],
  ])("%s changes nothing (unknown stays unknown, known stays known)", async (_l, arrange) => {
    arrange();
    expect("suspended" in (await update(SESSION_TOKEN, { refreshStanding: true }))).toBe(false);
    arrange();
    expect((await update({ ...SESSION_TOKEN, suspended: true }, { refreshStanding: true }))["suspended"]).toBe(true);
  });
});

describe("the notice gate", () => {
  it("is exactly true", () => {
    expect(sessionSuspended({ user: { suspended: true } })).toBe(true);
    for (const value of [false, "true", 1, null, undefined]) {
      expect(sessionSuspended({ user: { suspended: value } })).toBe(false);
    }
    expect(sessionSuspended(null)).toBe(false);
  });
});
