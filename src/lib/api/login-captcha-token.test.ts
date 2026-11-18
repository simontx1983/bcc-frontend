/**
 * POST /auth/login carries `captcha_token` only once the server has asked
 * for one (the captcha step-up, contract v1.161). An ordinary sign-in body
 * is unchanged.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const bccFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  bccFetch: (...a: unknown[]) => bccFetch(...a),
}));

const { loginWithIdentifier } = await import("@/lib/api/auth-endpoints");

beforeEach(() => {
  bccFetch.mockReset();
  bccFetch.mockResolvedValue({ status: "2fa_required", challenge_token: "ct" });
});

describe("loginWithIdentifier", () => {
  it("an ordinary sign-in sends no captcha_token", async () => {
    await loginWithIdentifier("jo", "pw");
    expect(bccFetch).toHaveBeenCalledWith("auth/login", {
      method: "POST",
      body: { identifier: "jo", password: "pw" },
    });
  });

  it("a re-submit after the step-up sends the widget's token", async () => {
    await loginWithIdentifier("jo", "pw", "tok-1");
    expect(bccFetch).toHaveBeenCalledWith("auth/login", {
      method: "POST",
      body: { identifier: "jo", password: "pw", captcha_token: "tok-1" },
    });
  });
});
