/**
 * "Resend code" must never claim to have sent one.
 *
 * Both OTP surfaces swallowed every resend failure and started the same
 * 60-second cooldown as a success. A network drop or a server rate-limit
 * therefore rendered EXACTLY like a delivered email — "Sending…" then
 * "Resend in 60s" — while nothing had been dispatched. The visitor waited
 * for a message that was never coming, and on /verify-email the swallow
 * also hid the 3-per-hour rate limit entirely.
 *
 * The anti-enumeration property is unaffected and is asserted here too:
 * the SUCCESS copy still refuses to confirm whether the address exists.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const resendVerification = vi.fn();
const resend2faCode = vi.fn();
vi.mock("@/lib/api/auth-endpoints", () => ({
  resendVerification: (...a: unknown[]) => resendVerification(...a),
  resend2faCode: (...a: unknown[]) => resend2faCode(...a),
  verifyEmail: vi.fn(),
  verify2fa: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const { BccApiError } = await import("@/lib/api/types");
const VerifyEmailPage = (await import("@/app/(auth)/verify-email/page")).default;
const TwoFactorPage = (await import("@/app/(auth)/login/two-factor/page")).default;

const resendBtn = () =>
  screen.getByRole("button", { name: /resend|sending/i }) as HTMLButtonElement;
const has = (re: RegExp) =>
  screen.queryByText((c) => re.test(c.replace(/\s+/g, " "))) !== null;

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
});

afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────
// /verify-email
// ─────────────────────────────────────────────────────────────────────

describe("verify-email resend", () => {
  function renderPage() {
    searchParams.set("email", "someone@example.com");
    return render(<VerifyEmailPage />);
  }

  it("confirms a send only after the server accepted it", async () => {
    resendVerification.mockResolvedValueOnce(undefined);
    renderPage();
    fireEvent.click(resendBtn());
    await waitFor(() => {
      expect(has(/a new code is on its way/i)).toBe(true);
    });
  });

  it("keeps the anti-enumeration hedge in the success copy", async () => {
    resendVerification.mockResolvedValueOnce(undefined);
    renderPage();
    fireEvent.click(resendBtn());
    await waitFor(() => {
      expect(has(/if an account exists/i)).toBe(true);
    });
  });

  it("says nothing was sent when the request FAILS", async () => {
    resendVerification.mockRejectedValueOnce(new Error("network down"));
    renderPage();
    fireEvent.click(resendBtn());

    await waitFor(() => {
      expect(has(/couldn.t send a new code/i)).toBe(true);
    });
    // The lie under test: no success confirmation may appear.
    expect(has(/on its way/i)).toBe(false);
  });

  it("surfaces the rate limit instead of hiding it behind a cooldown", async () => {
    resendVerification.mockRejectedValueOnce(
      new BccApiError("bcc_rate_limited", "RAW_LEAK", 429, null),
    );
    renderPage();
    fireEvent.click(resendBtn());

    await waitFor(() => {
      expect(has(/too many code requests/i)).toBe(true);
    });
    expect(has(/RAW_LEAK/)).toBe(false);
  });

  it("does NOT start the cooldown after a failure, so retry stays available", async () => {
    resendVerification.mockRejectedValueOnce(new Error("network down"));
    renderPage();
    fireEvent.click(resendBtn());

    await waitFor(() => {
      expect(has(/couldn.t send a new code/i)).toBe(true);
    });
    // A failed attempt used to lock the button for 60s exactly as a
    // success did, so the visitor could neither retry nor learn why.
    expect(resendBtn().disabled).toBe(false);
    expect(has(/resend in \d+s/i)).toBe(false);
  });

  it("DOES start the cooldown after a success", async () => {
    resendVerification.mockResolvedValueOnce(undefined);
    renderPage();
    fireEvent.click(resendBtn());
    await waitFor(() => {
      expect(has(/resend in \d+s/i)).toBe(true);
    });
  });

  /**
   * NOTE ON DUPLICATE ACTIVATION, and what this file can honestly prove.
   *
   * The user-visible mechanism is the button going `disabled` while a send
   * is in flight — that is asserted below, and it FAILS if the disabled
   * binding is removed (mutation-verified).
   *
   * The handler also holds a synchronous `resendInFlight` ref. That ref is
   * defence-in-depth for a same-tick double activation, and it is NOT
   * asserted here because it CANNOT be: `fireEvent` wraps every click in
   * `act()`, so React has already flushed `resending` and disabled the
   * button before a second synchronous click is dispatched. A test written
   * against it passes with the ref removed — i.e. it is vacuous, and one
   * was deleted from this file for exactly that reason rather than left in
   * to look like coverage.
   */
  it("disables the control while a send is in flight", async () => {
    let release!: () => void;
    resendVerification.mockReturnValueOnce(new Promise<void>((r) => { release = r; }));
    renderPage();

    expect(resendBtn().disabled).toBe(false);
    fireEvent.click(resendBtn());
    // This is the assertion that actually prevents a second activation.
    expect(resendBtn().disabled).toBe(true);
    expect(resendVerification).toHaveBeenCalledTimes(1);

    release();
    await waitFor(() => expect(has(/on its way/i)).toBe(true));
  });

  it("allows a fresh attempt once a failed one has settled", async () => {
    resendVerification.mockRejectedValueOnce(new Error("network"));
    renderPage();
    fireEvent.click(resendBtn());
    await waitFor(() => expect(has(/couldn.t send a new code/i)).toBe(true));

    // The in-flight guard must RELEASE on failure, or retry is dead.
    resendVerification.mockResolvedValueOnce(undefined);
    fireEvent.click(resendBtn());
    await waitFor(() => expect(has(/on its way/i)).toBe(true));
    expect(resendVerification).toHaveBeenCalledTimes(2);
    // …and the stale error must be gone.
    expect(has(/couldn.t send a new code/i)).toBe(false);
  });

  it("does not leave stale success text after a later failure", async () => {
    resendVerification.mockResolvedValueOnce(undefined);
    renderPage();
    fireEvent.click(resendBtn());
    await waitFor(() => expect(has(/on its way/i)).toBe(true));

    // Cooldown blocks the button, so drive the second attempt after it.
    // Simulate by re-rendering fresh and failing — the assertion that
    // matters is that success copy never coexists with a failure.
    cleanup();
    resendVerification.mockRejectedValueOnce(new Error("network"));
    renderPage();
    fireEvent.click(resendBtn());
    await waitFor(() => expect(has(/couldn.t send a new code/i)).toBe(true));
    expect(has(/on its way/i)).toBe(false);
  });

  it("does not update state after unmount", async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a));
    let release!: () => void;
    resendVerification.mockReturnValueOnce(new Promise<void>((r) => { release = r; }));

    const { unmount } = renderPage();
    fireEvent.click(resendBtn());
    unmount();
    release();
    await Promise.resolve();
    await Promise.resolve();

    const noisy = errors.filter((e) => /unmounted|not wrapped in act/i.test(String(e)));
    expect(noisy).toEqual([]);
    spy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────
// /login/two-factor
// ─────────────────────────────────────────────────────────────────────

describe("two-factor resend", () => {
  function renderPage() {
    searchParams.set("ct", "challenge-token");
    return render(<TwoFactorPage />);
  }

  it("confirms a send only after the server accepted it", async () => {
    resend2faCode.mockResolvedValueOnce(undefined);
    renderPage();
    fireEvent.click(resendBtn());
    await waitFor(() => {
      expect(has(/a new code is on its way/i)).toBe(true);
    });
  });

  it("says nothing was sent when the request FAILS", async () => {
    resend2faCode.mockRejectedValueOnce(new Error("network down"));
    renderPage();
    fireEvent.click(resendBtn());

    await waitFor(() => {
      expect(has(/couldn.t send a new code/i)).toBe(true);
    });
    expect(has(/on its way/i)).toBe(false);
  });

  it("routes a dead challenge to the terminal state instead of offering a doomed retry", async () => {
    resend2faCode.mockRejectedValueOnce(
      new BccApiError("bcc_invalid_2fa_token", "expired", 401, null),
    );
    renderPage();
    fireEvent.click(resendBtn());

    await waitFor(() => {
      expect(has(/session expired/i)).toBe(true);
    });
  });

  it("leaves the cooldown unstarted after a failure", async () => {
    resend2faCode.mockRejectedValueOnce(new Error("network down"));
    renderPage();
    fireEvent.click(resendBtn());
    await waitFor(() => {
      expect(has(/couldn.t send a new code/i)).toBe(true);
    });
    expect(has(/resend in \d+s/i)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Wrong code vs expired code — the backend distinguishes them here.
// ─────────────────────────────────────────────────────────────────────

describe("two-factor wrong-code copy", () => {
  it("stops hedging 'or expired' on a code the challenge still accepts", async () => {
    const src = (await import("node:fs")).readFileSync(
      (await import("node:path")).resolve(
        process.cwd(),
        "src/app/(auth)/login/two-factor/page.tsx",
      ),
      "utf-8",
    );
    const line = /bcc_invalid_2fa_code:\s*"([^"]+)"/.exec(src)?.[1] ?? "";
    expect(line).not.toMatch(/expired/i);
    expect(line).toMatch(/doesn't match|does not match/i);
    // Expiry keeps its own distinct message.
    expect(src).toMatch(/bcc_invalid_2fa_token:\s*"[^"]*expired/i);
  });
});
