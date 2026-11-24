/**
 * F-264: one sign-in at a time.
 *
 * `submitting` disabled the button only after a re-render, so two submits
 * in the same frame both reached loginWithIdentifier; and the `finally`
 * re-enabled the form after a success or the 2FA hand-off, while the page
 * was still leaving. Now a synchronous latch admits one attempt; the form
 * stays locked on the two navigating paths and is released on every other
 * ending, so it can never get stuck disabled after a failure.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const h = vi.hoisted(() => ({ login: vi.fn(), replace: vi.fn(), signIn: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => h.signIn(...a) }));
vi.mock("@/components/auth/WalletAuthButton", () => ({ WalletAuthButton: () => null }));
vi.mock("@/components/auth/WalletSignupPrompt", () => ({ WalletSignupPrompt: () => null }));
vi.mock("@/lib/api/auth-endpoints", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loginWithIdentifier: (...a: unknown[]) => h.login(...a),
}));

const { LoginPageClient } = await import("@/app/(auth)/login/LoginPageClient");
const { BccApiError } = await import("@/lib/api/types");

const JWT = { user_id: 7, handle: "jo", token: "t", expires_in: 3600, in_good_standing: true };

function fill() {
  fireEvent.change(screen.getByLabelText("Email or handle"), { target: { value: "jo" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse" } });
}
const button = () => screen.getByRole("button", { name: /Sign in|Signing in/ });
const form = () => button().closest("form") as HTMLFormElement;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  vi.clearAllMocks();
  h.signIn.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("one sign-in at a time", () => {
  it("two submits in the same frame send ONE login", async () => {
    let resolve: (v: unknown) => void = () => {};
    h.login.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<LoginPageClient />);
    fill();
    // Both before any re-render: the button isn't disabled yet.
    act(() => {
      fireEvent.submit(form());
      fireEvent.submit(form());
    });
    expect(h.login).toHaveBeenCalledTimes(1);
    resolve(JWT);
    await flush();
    expect(h.signIn).toHaveBeenCalledTimes(1);
  });

  it("a successful sign-in keeps the form locked while it navigates", async () => {
    h.login.mockResolvedValue(JWT);
    render(<LoginPageClient />);
    fill();
    fireEvent.submit(form());
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/"));
    expect(button()).toBeDisabled();
    fireEvent.submit(form());
    await flush();
    expect(h.login).toHaveBeenCalledTimes(1);
  });

  it("the 2FA hand-off keeps it locked too", async () => {
    h.login.mockResolvedValue({ status: "2fa_required", challenge_token: "ct-1" });
    render(<LoginPageClient />);
    fill();
    fireEvent.submit(form());
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/login/two-factor"));
    expect(button()).toBeDisabled();
    fireEvent.submit(form());
    await flush();
    expect(h.login).toHaveBeenCalledTimes(1);
  });

  it("a refusal releases the form, and the next submit goes through", async () => {
    h.login.mockRejectedValueOnce(new BccApiError("bcc_invalid_credentials", "x", 401, null)).mockResolvedValueOnce(JWT);
    render(<LoginPageClient />);
    fill();
    fireEvent.submit(form());
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(button()).toBeEnabled();
    fireEvent.submit(form());
    await waitFor(() => expect(h.login).toHaveBeenCalledTimes(2));
  });

  it("a network error or an unexpected throw releases it too: never stuck disabled", async () => {
    for (const failure of [new TypeError("Failed to fetch"), new Error("boom")]) {
      h.login.mockReset();
      h.login.mockRejectedValueOnce(failure).mockResolvedValueOnce(JWT);
      render(<LoginPageClient />);
      fill();
      fireEvent.submit(form());
      await waitFor(() => expect(button()).toBeEnabled());
      fireEvent.submit(form());
      await waitFor(() => expect(h.login).toHaveBeenCalledTimes(2));
      cleanup();
    }
  });

  it("a sign-in the session layer refuses releases it as well", async () => {
    h.login.mockResolvedValue(JWT);
    h.signIn.mockResolvedValueOnce({ ok: false, error: "CredentialsSignin" });
    render(<LoginPageClient />);
    fill();
    fireEvent.submit(form());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Sign-in failed. Try again."));
    expect(button()).toBeEnabled();
    expect(h.replace).not.toHaveBeenCalled();
  });
});
