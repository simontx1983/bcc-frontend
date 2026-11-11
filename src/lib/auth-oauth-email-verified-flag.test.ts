/**
 * The /auth/oauth bridge body carries `email_verified: true` (a JSON
 * boolean, never a string) exactly when a provider-verified Google email
 * is forwarded, and omits the key otherwise. The HMAC signature must
 * still cover the exact raw bytes sent, flag included.
 */

import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
  serverEnv: { BCC_OAUTH_BRIDGE_SECRET: "test-secret" },
}));

const { authOptions, oauthBridgeEmail } = await import("@/lib/auth");

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ data: { status: "handle_required", provider_token: "pt", email: "" }, _meta: { version: "v1" } }),
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

type Cb = (a: Record<string, unknown>) => Promise<unknown>;
const signIn = () => authOptions.callbacks?.signIn as unknown as Cb;
const jwt = () => authOptions.callbacks?.jwt as unknown as Cb;
const sent = () => {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { raw: String(init.body), headers: init.headers as Record<string, string> };
};

describe("oauthBridgeEmail", () => {
  it.each([
    ["google, verified", "google", "a@x.io", { email_verified: true }, { email: "a@x.io", email_verified: true }],
    ["google, unverified", "google", "a@x.io", { email_verified: false }, { email: "" }],
    ["google, string 'true'", "google", "a@x.io", { email_verified: "true" }, { email: "" }],
    ["google, no profile", "google", "a@x.io", undefined, { email: "" }],
    ["google, no email", "google", null, { email_verified: true }, { email: "" }],
    ["twitter", "twitter", "a@x.io", { email_verified: true }, { email: "" }],
  ])("%s", (_l, provider, email, profile, expected) => {
    expect(oauthBridgeEmail(provider, email, profile)).toEqual(expected);
  });
});

describe("the bridge body sent by the callbacks", () => {
  const verifiedGoogle = {
    account: { type: "oauth", provider: "google", providerAccountId: "g-1" },
    user: { email: "me@example.com", name: "Me" },
    profile: { email_verified: true },
  };

  it("signIn: a verified Google email is sent with email_verified: true", async () => {
    await signIn()(verifiedGoogle);
    const body = JSON.parse(sent().raw) as { email?: unknown; email_verified?: unknown };
    expect(body.email).toBe("me@example.com");
    expect(body.email_verified).toBe(true);
  });

  it("jwt: a verified Google email is sent with email_verified: true", async () => {
    await jwt()({ token: {}, ...verifiedGoogle });
    const body = JSON.parse(sent().raw) as { email?: unknown; email_verified?: unknown };
    expect(body.email).toBe("me@example.com");
    expect(body.email_verified).toBe(true);
  });

  it("jwt: an unverified Google email is sent empty, with no email_verified key", async () => {
    await jwt()({ ...verifiedGoogle, token: {}, profile: { email_verified: false } });
    const body = JSON.parse(sent().raw) as { email?: unknown; email_verified?: unknown };
    expect(body.email).toBe("");
    expect("email_verified" in body).toBe(false);
  });

  it("X (twitter) sends no email_verified key", async () => {
    await signIn()({
      account: { type: "oauth", provider: "twitter", providerAccountId: "t-1" },
      user: { email: null, name: "X user" },
      profile: {},
    });
    const body = JSON.parse(sent().raw) as { email?: unknown; email_verified?: unknown };
    expect(body.email).toBe("");
    expect("email_verified" in body).toBe(false);
  });

  it("the signature covers the exact raw body sent, flag included", async () => {
    await signIn()(verifiedGoogle);
    const { raw, headers } = sent();
    expect(raw).toContain('"email_verified":true');
    const expected = createHmac("sha256", "test-secret")
      .update(`${headers["X-Bcc-Oauth-Timestamp"]}\n${headers["X-Bcc-Oauth-Nonce"]}\n${raw}`)
      .digest("hex");
    expect(headers["X-Bcc-Oauth-Signature"]).toBe(expected);
  });
});
