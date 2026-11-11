/**
 * Only a provider-verified email reaches the OAuth bridge (/auth/oauth).
 *
 * The backend links accounts by email and treats an email it receives
 * there as provider-verified. NextAuth's signIn/jwt used to forward
 * user.email from the Google profile without checking email_verified,
 * so an unverified address could be linked to its real owner's account.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
  serverEnv: { BCC_OAUTH_BRIDGE_SECRET: "test-secret" },
}));

const { authOptions, verifiedOAuthEmail } = await import("@/lib/auth");

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const handleRequired = (email: string) =>
  new Response(
    JSON.stringify({ data: { status: "handle_required", provider_token: "pt", email }, _meta: { version: "v1" } }),
    { status: 200 },
  );

type Cb = (a: Record<string, unknown>) => Promise<unknown>;
const signIn = () => authOptions.callbacks?.signIn as unknown as Cb;
const jwt = () => authOptions.callbacks?.jwt as unknown as Cb;
const sentEmail = () => {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return (JSON.parse(String(init.body)) as { email: string }).email;
};

describe("verifiedOAuthEmail — deny by default", () => {
  it.each([
    ["google, verified", "google", "a@x.io", { email_verified: true }, "a@x.io"],
    ["google, unverified", "google", "a@x.io", { email_verified: false }, ""],
    ["google, string 'true'", "google", "a@x.io", { email_verified: "true" }, ""],
    ["google, no flag", "google", "a@x.io", {}, ""],
    ["google, no profile", "google", "a@x.io", undefined, ""],
    ["google, no email", "google", null, { email_verified: true }, ""],
    ["twitter", "twitter", "a@x.io", { email_verified: true }, ""],
  ])("%s", (_l, provider, email, profile, expected) => {
    expect(verifiedOAuthEmail(provider, email, profile)).toBe(expected);
  });
});

describe("the callbacks send only a verified email to /auth/oauth", () => {
  it("signIn: an unverified Google address is sent as empty", async () => {
    fetchMock.mockResolvedValue(handleRequired(""));
    await signIn()({
      account: { type: "oauth", provider: "google", providerAccountId: "g-1" },
      user: { email: "victim@example.com", name: "X" },
      profile: { email_verified: false },
    });
    expect(sentEmail()).toBe("");
  });

  it("signIn: a verified Google address is forwarded", async () => {
    fetchMock.mockResolvedValue(handleRequired("me@example.com"));
    await signIn()({
      account: { type: "oauth", provider: "google", providerAccountId: "g-2" },
      user: { email: "me@example.com", name: "Me" },
      profile: { email_verified: true },
    });
    expect(sentEmail()).toBe("me@example.com");
  });

  it("jwt: an unverified Google address is sent as empty", async () => {
    fetchMock.mockResolvedValue(handleRequired(""));
    await jwt()({
      token: {},
      account: { type: "oauth", provider: "google", providerAccountId: "g-3" },
      user: { email: "victim@example.com", name: "X" },
      profile: { email_verified: false },
    });
    expect(sentEmail()).toBe("");
  });

  it("X (twitter) sends no email, as before", async () => {
    fetchMock.mockResolvedValue(handleRequired(""));
    await signIn()({
      account: { type: "oauth", provider: "twitter", providerAccountId: "t-1" },
      user: { email: null, name: "X user" },
      profile: {},
    });
    expect(sentEmail()).toBe("");
  });
});
