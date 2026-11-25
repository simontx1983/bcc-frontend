/**
 * POST /auth/resend-verification: an address goes as `email` (unchanged for
 * every existing caller); a handle goes as `identifier` (contract v1.175).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const bccFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({ bccFetch: (...a: unknown[]) => bccFetch(...a) }));

const { resendVerification } = await import("@/lib/api/auth-endpoints");

beforeEach(() => {
  bccFetch.mockReset();
  bccFetch.mockResolvedValue({ ok: true });
});

describe("resendVerification", () => {
  it("an address is sent as email, and only that", async () => {
    await resendVerification("jo@example.com");
    expect(bccFetch).toHaveBeenCalledWith("auth/resend-verification", {
      method: "POST",
      body: { email: "jo@example.com" },
    });
  });

  it("{ identifier } is sent as identifier, and only that", async () => {
    await resendVerification({ identifier: "anvil" });
    expect(bccFetch).toHaveBeenCalledWith("auth/resend-verification", {
      method: "POST",
      body: { identifier: "anvil" },
    });
    const [, init] = bccFetch.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(Object.keys(init.body)).toEqual(["identifier"]);
  });
});
