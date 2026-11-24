/**
 * `can_moderate` (bcc-trust #876) reaches the session as an OPTIONAL
 * `canModerate` boolean, display only, for the avatar menu's Admin group.
 *
 *   - every sign-in path carries it when the auth response has a boolean:
 *     the bcc-verified bridge (credential string), the wallet provider and
 *     the OAuth first sign-in;
 *   - absent stays ABSENT (not false) all the way to the session;
 *   - the client `update()` seam cannot set it;
 *   - the menu gate is `=== true`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
  serverEnv: { BCC_OAUTH_BRIDGE_SECRET: "test-secret", ANALYTICS_ID_SECRET: null },
}));

const { authOptions } = await import("@/lib/auth");
const { canModerateCredential, parseCanModerateCredential, sessionCanModerate } = await import(
  "@/lib/auth/can-moderate"
);

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

const fetchMock = vi.fn();
const authReply = (data: Record<string, unknown>) =>
  new Response(JSON.stringify({ data, _meta: { version: "v1" } }), { status: 200 });
const TOKEN_RESPONSE = { user_id: 7, handle: "welder", token: "tok", expires_in: 3600, token_type: "Bearer", in_good_standing: true };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("the bcc-verified bridge", () => {
  it.each([
    ["true", true],
    ["false", false],
  ])('can_moderate "%s" → canModerate %s', async (raw, flag) => {
    const user = await authorize("bcc-verified")({ ...BRIDGE, can_moderate: raw });
    expect(user["canModerate"]).toBe(flag);
  });

  it.each([["absent", undefined], ["undefined", "undefined"], ["garbage", "yes"], ["empty", ""]])(
    "%s → no canModerate key at all",
    async (_label, raw) => {
      const creds: Record<string, string> = { ...BRIDGE };
      if (raw !== undefined) creds["can_moderate"] = raw;
      const user = await authorize("bcc-verified")(creds);
      expect("canModerate" in user).toBe(false);
    },
  );

  it("the client pages send it only when the response has a boolean", () => {
    expect(canModerateCredential({ can_moderate: true })).toEqual({ can_moderate: "true" });
    expect(canModerateCredential({ can_moderate: false })).toEqual({ can_moderate: "false" });
    expect(canModerateCredential({})).toEqual({});
    expect(canModerateCredential({ can_moderate: "true" })).toEqual({});
    expect(parseCanModerateCredential("TRUE")).toBeUndefined();
  });
});

describe("the wallet provider", () => {
  it("carries a boolean through", async () => {
    fetchMock.mockResolvedValue(authReply({ ...TOKEN_RESPONSE, can_moderate: true }));
    const user = await authorize("wallet")({ wallet_address: "addr", signature: "sig", extra: "" });
    expect(user["canModerate"]).toBe(true);
  });

  it.each([["absent", undefined], ["a string", "true"], ["null", null]])("%s → no key", async (_label, value) => {
    const data: Record<string, unknown> = { ...TOKEN_RESPONSE };
    if (value !== undefined) data["can_moderate"] = value;
    fetchMock.mockResolvedValue(authReply(data));
    const user = await authorize("wallet")({ wallet_address: "addr", signature: "sig", extra: "" });
    expect("canModerate" in user).toBe(false);
  });
});

describe("jwt → session", () => {
  const signIn = async (user: Record<string, unknown>) =>
    jwt()({ token: { sub: "7" }, user: { id: "7", handle: "welder", bccToken: "tok", bccTokenExpiresAt: Date.now() + 3_600_000, inGoodStanding: true, ...user } });
  const project = async (token: Record<string, unknown>) =>
    (await session()({ session: { user: {}, expires: "" }, token }))["user"] as Record<string, unknown>;

  it("true and false reach the session", async () => {
    expect((await project(await signIn({ canModerate: true })))["canModerate"]).toBe(true);
    expect((await project(await signIn({ canModerate: false })))["canModerate"]).toBe(false);
  });

  it("absent stays absent", async () => {
    const token = await signIn({});
    expect("canModerate" in token).toBe(false);
    expect("canModerate" in (await project(token))).toBe(false);
  });

  it("the OAuth first sign-in carries it from /auth/oauth", async () => {
    fetchMock.mockResolvedValue(authReply({ ...TOKEN_RESPONSE, can_moderate: true }));
    const token = await jwt()({
      token: {},
      user: { id: "x", email: null, name: "W" },
      account: { type: "oauth", provider: "google", providerAccountId: "g-1" },
      profile: {},
    });
    expect(token["canModerate"]).toBe(true);
  });

  it("the client update() seam cannot set it", async () => {
    const token = await jwt()({
      token: { id: "7", handle: "welder", bccToken: "tok", bccTokenExpiresAt: Date.now() + 3_600_000 },
      trigger: "update",
      session: { canModerate: true, can_moderate: true },
    });
    expect("canModerate" in token).toBe(false);
  });
});

describe("the menu gate", () => {
  it("is exactly true", () => {
    expect(sessionCanModerate({ user: { canModerate: true } })).toBe(true);
    for (const value of [false, "true", 1, null, undefined]) {
      expect(sessionCanModerate({ user: { canModerate: value } })).toBe(false);
    }
    expect(sessionCanModerate({ user: {} })).toBe(false);
    expect(sessionCanModerate(null)).toBe(false);
  });
});
