/**
 * F-378: a sign-in blocked as unverified, typed with a HANDLE, can ask for
 * a new verification email.
 *
 * Before, only an email sign-in got a way forward ("Verify your email →",
 * which needs the address); a handle sign-in got the bare error. Now it
 * gets "Resend verification email" (POST /auth/resend-verification with
 * `identifier`, contract v1.175), and the success line points at the
 * emailed link, which works without the address.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const h = vi.hoisted(() => ({ login: vi.fn(), resend: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("@/components/auth/WalletAuthButton", () => ({ WalletAuthButton: () => null }));
vi.mock("@/components/auth/WalletSignupPrompt", () => ({ WalletSignupPrompt: () => null }));
vi.mock("@/lib/api/auth-endpoints", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loginWithIdentifier: (...a: unknown[]) => h.login(...a),
  resendVerification: (...a: unknown[]) => h.resend(...a),
}));

const { LoginPageClient } = await import("@/app/(auth)/login/LoginPageClient");
const { BccApiError } = await import("@/lib/api/types");

const notVerified = () => new BccApiError("bcc_email_not_verified", "RAW", 403, null);
const SUCCESS =
  "If this account is waiting on verification, a new email is on its way. Open the link in it to verify, then sign in.";

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function signInAs(identifier: string) {
  fireEvent.change(screen.getByLabelText("Email or handle"), { target: { value: identifier } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse" } });
  fireEvent.submit(screen.getByRole("button", { name: /^Sign in$|Signing in/ }).closest("form") as HTMLFormElement);
  await flush();
}

const resendButton = () => screen.queryByRole("button", { name: /Resend verification email|Sending…|Email sent/ });
const statusLine = () => resendButton()?.parentElement?.querySelector('[role="status"]') as HTMLElement | null;

beforeEach(() => {
  // jsdom has no matchMedia; the page's theme read needs one.
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  vi.clearAllMocks();
  h.login.mockRejectedValue(notVerified());
  h.resend.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("an unverified HANDLE sign-in", () => {
  it("offers Resend, not the verify-email link, with an empty status line ready", async () => {
    render(<LoginPageClient />);
    await signInAs("anvil");
    expect(screen.getByRole("alert")).toHaveTextContent("Please verify your email address before signing in.");
    expect(resendButton()).toHaveTextContent("Resend verification email");
    expect(resendButton()?.className).toContain("min-h-[44px]");
    expect(screen.queryByRole("link", { name: /Verify your email/ })).toBeNull();
    expect(statusLine()?.textContent).toBe("");
    expect(h.resend).not.toHaveBeenCalled();
  });

  it("sends by identifier, then says to open the emailed link, and rests the button", async () => {
    render(<LoginPageClient />);
    await signInAs("  anvil  ");
    fireEvent.click(resendButton() as HTMLElement);
    await flush();
    expect(h.resend).toHaveBeenCalledTimes(1);
    expect(h.resend).toHaveBeenCalledWith({ identifier: "anvil" });
    expect(statusLine()?.textContent).toBe(SUCCESS);
    expect(statusLine()?.textContent).toMatch(/link/);
    expect(resendButton()).toHaveTextContent("Email sent");
    expect(resendButton()).toBeDisabled();
  });

  it("the button comes back after the cooldown", async () => {
    vi.useFakeTimers();
    render(<LoginPageClient />);
    await signInAs("anvil");
    fireEvent.click(resendButton() as HTMLElement);
    await flush();
    expect(resendButton()).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(resendButton()).toBeEnabled();
    expect(resendButton()).toHaveTextContent("Resend verification email");
  });

  it("two clicks in the same frame send ONE request", async () => {
    let resolve: () => void = () => {};
    h.resend.mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    render(<LoginPageClient />);
    await signInAs("anvil");
    const btn = resendButton() as HTMLElement;
    act(() => {
      fireEvent.click(btn);
      fireEvent.click(btn);
    });
    expect(h.resend).toHaveBeenCalledTimes(1);
    expect(resendButton()).toHaveTextContent("Sending…");
    resolve();
    await flush();
  });

  it("a rate limit says to wait, and the button stays usable", async () => {
    h.resend.mockRejectedValue(new BccApiError("bcc_rate_limited", "RAW", 429, null));
    render(<LoginPageClient />);
    await signInAs("anvil");
    fireEvent.click(resendButton() as HTMLElement);
    await flush();
    expect(statusLine()?.textContent).toBe("Too many requests. Wait a few minutes, then try again.");
    expect(resendButton()).toBeEnabled();
    expect(document.body.textContent).not.toMatch(/RAW/);
  });

  it("a network failure says so, and the button stays usable", async () => {
    h.resend.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<LoginPageClient />);
    await signInAs("anvil");
    fireEvent.click(resendButton() as HTMLElement);
    await flush();
    expect(statusLine()?.textContent).toBe("Couldn't send a new email just now. Check your connection and try again.");
    expect(resendButton()).toBeEnabled();
  });

  it("'@anvil' is a handle too: Resend by identifier, no verify-email link", async () => {
    render(<LoginPageClient />);
    await signInAs("@anvil");
    expect(screen.queryByRole("link", { name: /Verify your email/ })).toBeNull();
    fireEvent.click(resendButton() as HTMLElement);
    await flush();
    expect(h.resend).toHaveBeenCalledWith({ identifier: "@anvil" });
  });

  it("the next sign-in attempt clears it", async () => {
    render(<LoginPageClient />);
    await signInAs("anvil");
    expect(resendButton()).not.toBeNull();
    h.login.mockRejectedValueOnce(new BccApiError("bcc_invalid_credentials", "RAW", 401, null));
    await signInAs("anvil");
    expect(resendButton()).toBeNull();
  });
});

describe("an unverified EMAIL sign-in is unchanged", () => {
  it("keeps 'Verify your email →' and offers no handle resend", async () => {
    render(<LoginPageClient />);
    await signInAs("jo@example.com");
    expect(screen.getByRole("link", { name: /Verify your email/ })).toHaveAttribute("href", "/verify-email");
    expect(resendButton()).toBeNull();
  });
});
