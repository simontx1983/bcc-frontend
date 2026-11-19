/**
 * F-294's new auth error codes, on the pages that receive them.
 *
 *   - `bcc_password_breached` 422 (bcc-trust #712) at sign-up and password
 *     reset: a refusal of the password alone, so it is shown ON the
 *     password field (aria-invalid + aria-describedby), not as a form error.
 *   - `bcc_unavailable` 503 at /auth/oauth-complete (#711): another submit
 *     with the same token is in flight; resubmitting is safe, so the form
 *     stays and says so.
 *   - `bcc_conflict` 409 at /auth/verify-email (#717): another account took
 *     a wallet sign-up's pending address, and the server dropped it. The
 *     page must not offer a resend or a code (both dead ends), and must not
 *     confuse it with the other 409s (`bcc_already_verified`).
 *
 * All §γ: keyed on err.code, never the server's message.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPendingVerificationEmail,
  stashPendingVerificationEmail,
} from "@/lib/auth/pending-verification-email";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/lib/analytics/posthog", () => ({
  captureAnalyticsEvent: vi.fn(),
  noteSignupCompleted: vi.fn(),
  signupMethodForProvider: () => "google",
}));

const h = vi.hoisted(() => ({
  signup: vi.fn(),
  confirmPasswordReset: vi.fn(),
  oauthComplete: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/api/auth-endpoints", () => ({
  signup: (...a: unknown[]) => h.signup(...a),
  confirmPasswordReset: (...a: unknown[]) => h.confirmPasswordReset(...a),
  oauthComplete: (...a: unknown[]) => h.oauthComplete(...a),
  verifyEmail: (...a: unknown[]) => h.verifyEmail(...a),
  resendVerification: (...a: unknown[]) => h.resendVerification(...a),
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const { BccApiError } = await import("@/lib/api/types");
const { PASSWORD_BREACHED_COPY } = await import("@/lib/auth/password-policy");
const { SignupPageClient } = await import("@/app/(auth)/signup/SignupPageClient");
const ResetPasswordPage = (await import("@/app/(auth)/reset-password/page")).default;
const CompleteProfilePage = (await import("@/app/(auth)/signup/complete-profile/page")).default;
const VerifyEmailPage = (await import("@/app/(auth)/verify-email/page")).default;

const breached = () =>
  new BccApiError("bcc_password_breached", "RAW SERVER TEXT", 422, null);

const EMAIL_TAKEN = "That email is already in use. Add a different one in Settings.";

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  vi.clearAllMocks();
  // Snapshot the keys: deleting inside forEach skips every other entry.
  for (const k of [...searchParams.keys()]) searchParams.delete(k);
});

afterEach(() => {
  cleanup();
  clearPendingVerificationEmail();
});

/** The message an input's aria-describedby points at, or null. */
function describedText(input: HTMLElement): string | null {
  const ids = input.getAttribute("aria-describedby");
  if (ids === null) return null;
  return ids
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

// ─────────────────────────────────────────────────────────────────────
// bcc_password_breached
// ─────────────────────────────────────────────────────────────────────

describe("sign-up: a leaked password", () => {
  function fillAndSubmit() {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jo@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password1" } });
    fireEvent.change(screen.getByLabelText("Handle"), { target: { value: "jo-welds" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  }

  it("is shown on the password field, not as a form error, and never as the server's text", async () => {
    h.signup.mockRejectedValue(breached());
    render(<SignupPageClient />);
    fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(PASSWORD_BREACHED_COPY);
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(describedText(password)).toBe(PASSWORD_BREACHED_COPY);
    // One alert only: the form-level line stays empty.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByText("RAW SERVER TEXT")).toBeNull();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("clears once the password is edited, keeping everything else typed", async () => {
    h.signup.mockRejectedValue(breached());
    render(<SignupPageClient />);
    fillAndSubmit();
    await screen.findByRole("alert");

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-fresh-one-9" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText("Email")).toHaveValue("jo@example.com");
    expect(screen.getByLabelText("Handle")).toHaveValue("jo-welds");
  });

  it("other refusals keep the form-level line and leave the password field valid", async () => {
    h.signup.mockRejectedValue(new BccApiError("bcc_conflict", "raw", 409, null));
    render(<SignupPageClient />);
    fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("That handle or email is already taken.");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "false");
  });
});

describe("password reset: a leaked password", () => {
  it("is shown on the new-password field, and the same link can try again", async () => {
    searchParams.set("key", "k");
    searchParams.set("login", "jo");
    h.confirmPasswordReset.mockRejectedValueOnce(breached()).mockResolvedValueOnce(undefined);
    render(<ResetPasswordPage />);

    const password = screen.getByLabelText("New password");
    fireEvent.change(password, { target: { value: "password1" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(PASSWORD_BREACHED_COPY);
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(describedText(password)).toBe(PASSWORD_BREACHED_COPY);
    expect(screen.queryByText("RAW SERVER TEXT")).toBeNull();

    fireEvent.change(password, { target: { value: "a-fresh-one-9" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "a-fresh-one-9" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/login?reset=1"));
    expect(h.confirmPasswordReset).toHaveBeenLastCalledWith("k", "jo", "a-fresh-one-9");
  });
});

// ─────────────────────────────────────────────────────────────────────
// oauth-complete 503
// ─────────────────────────────────────────────────────────────────────

describe("oauth-complete: another submit for this token is in flight", () => {
  it("says to try again and keeps the form, not the session-expired card", async () => {
    searchParams.set("pt", "provider-token");
    searchParams.set("email", "jo@example.com");
    h.oauthComplete.mockRejectedValue(new BccApiError("bcc_unavailable", "RAW SERVER TEXT", 503, null));
    render(<CompleteProfilePage />);

    fireEvent.change(screen.getByLabelText("Handle"), { target: { value: "jo-welds" } });
    fireEvent.click(screen.getByRole("button", { name: "Join the floor" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We're still finishing your sign-up. Try again in a moment.",
    );
    expect(screen.queryByText("Session expired")).toBeNull();
    expect(screen.queryByText("RAW SERVER TEXT")).toBeNull();
    // The same form resubmits: a retry is always safe.
    await waitFor(() => expect(screen.getByRole("button", { name: "Join the floor" })).toBeEnabled());
    expect(screen.getByLabelText("Handle")).toHaveValue("jo-welds");
  });
});

// ─────────────────────────────────────────────────────────────────────
// verify-email 409 bcc_conflict
// ─────────────────────────────────────────────────────────────────────

describe("verify-email: the pending address went to another account", () => {
  function expectEmailTakenCard() {
    expect(screen.getByText("Email already in use")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(EMAIL_TAKEN);
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute(
      "href",
      "/u/me?tab=account",
    );
    // Dead ends withheld: the server dropped the address.
    expect(screen.queryByRole("button", { name: /resend/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /enter code manually/i })).toBeNull();
    expect(screen.queryByLabelText("Verification code")).toBeNull();
    expect(screen.queryByText("Link expired")).toBeNull();
    expect(screen.queryByText("RAW SERVER TEXT")).toBeNull();
  }

  it("by link: shows the in-use card, not 'Link expired'", async () => {
    searchParams.set("token", "t");
    h.verifyEmail.mockRejectedValue(new BccApiError("bcc_conflict", "RAW SERVER TEXT", 409, null));
    render(<VerifyEmailPage />);

    await screen.findByText("Email already in use");
    expect(h.verifyEmail).toHaveBeenCalledWith({ token: "t" });
    expectEmailTakenCard();
  });

  it("by code: shows the same card in place of the form", async () => {
    stashPendingVerificationEmail("jo@example.com");
    h.verifyEmail.mockRejectedValue(new BccApiError("bcc_conflict", "RAW SERVER TEXT", 409, null));
    render(<VerifyEmailPage />);

    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify email" }));

    await screen.findByText("Email already in use");
    expectEmailTakenCard();
  });

  it("the other 409, bcc_already_verified, gets its own card (F-263 M30), never this one", async () => {
    stashPendingVerificationEmail("jo@example.com");
    h.verifyEmail.mockRejectedValue(new BccApiError("bcc_already_verified", "raw", 409, null));
    render(<VerifyEmailPage />);

    fireEvent.change(screen.getByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify email" }));

    expect(await screen.findByText("Already verified")).toBeInTheDocument();
    expect(screen.queryByText("Email already in use")).toBeNull();
  });
});
