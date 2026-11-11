/**
 * The 2FA challenge token travels in sessionStorage, not the URL.
 *
 * It used to be `/login/two-factor?ct=<token>`, which put the token in
 * browser history, in the Referer header of any page the 2FA screen
 * linked to, and in access logs. /login now stashes it, and the 2FA page
 * reads it from there. A legacy `?ct=` link still works once: the page
 * moves the token into storage and scrubs it from the address bar.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const resend2faCode = vi.fn();
vi.mock("@/lib/api/auth-endpoints", () => ({
  resendVerification: vi.fn(),
  resend2faCode: (...a: unknown[]) => resend2faCode(...a),
  verifyEmail: vi.fn(),
  verify2fa: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const replace = vi.fn();
const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const TwoFactorPage = (await import("@/app/(auth)/login/two-factor/page")).default;
const { stashChallengeToken, readChallengeToken, clearChallengeToken } = await import(
  "@/lib/auth/two-factor-challenge"
);

const resendBtn = () => screen.getByRole("button", { name: /resend|sending/i });
const has = (re: RegExp) => screen.queryByText((c) => re.test(c.replace(/\s+/g, " "))) !== null;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  vi.clearAllMocks();
  searchParams.forEach((_, k) => searchParams.delete(k));
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe("two-factor-challenge storage helpers", () => {
  it("stash, read and clear round-trip", () => {
    expect(readChallengeToken()).toBe("");
    expect(stashChallengeToken("tok-1")).toBe(true);
    expect(readChallengeToken()).toBe("tok-1");
    clearChallengeToken();
    expect(readChallengeToken()).toBe("");
  });
});

describe("/login/two-factor reads the token from sessionStorage", () => {
  it("uses the stashed token with no ?ct= in the URL", async () => {
    stashChallengeToken("stored-token");
    resend2faCode.mockResolvedValueOnce(undefined);
    render(<TwoFactorPage />);

    await waitFor(() => expect(has(/session expired/i)).toBe(false));
    fireEvent.click(resendBtn());
    await waitFor(() => expect(resend2faCode).toHaveBeenCalledWith("stored-token"));
    expect(replace).not.toHaveBeenCalled();
  });

  it("with no token anywhere, shows the session-expired state", async () => {
    render(<TwoFactorPage />);
    await waitFor(() => expect(has(/session expired/i)).toBe(true));
  });

  it("a legacy ?ct= link is moved into storage and scrubbed from the URL, keeping callbackUrl", async () => {
    searchParams.set("ct", "legacy-token");
    searchParams.set("callbackUrl", "/directory");
    render(<TwoFactorPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const target = String(replace.mock.calls[0]?.[0]);
    expect(target).not.toContain("ct=");
    expect(target).not.toContain("legacy-token");
    expect(target).toContain("callbackUrl=%2Fdirectory");
    expect(readChallengeToken()).toBe("legacy-token");
  });
});
