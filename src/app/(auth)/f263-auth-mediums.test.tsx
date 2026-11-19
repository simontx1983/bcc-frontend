/**
 * F-263 — UX Mediums on the sign-in and sign-up pages (2026-11-12 audit).
 *
 * M22  /login: a wallet with no account opens the sign-up prompt, which
 *      used to start its chain picker over at the default. It now starts
 *      on the chain the visitor just tried.
 * M23  /signup: an email typed on the page was silently dropped by "Sign up
 *      with wallet". It now goes with the sign-up, and is handed to
 *      onboarding's "Secure your account" step under the NEW account's
 *      scope, as /login's prompt does. A malformed one holds the button.
 * M30  /verify-email: a link opened a second time showed "Link expired"
 *      with Resend, and "already verified" as an error, with no way to
 *      sign in. It now has its own card with Sign in.
 * Also the prompt's "we'll mint one" / "We mint a placeholder" jargon
 * (an F-264 Low), reworded.
 *
 * WalletAuthButton is stubbed here (its own suites cover the wallet cycle):
 * the stub records the props it was given and drives its callbacks.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

type StubProps = {
  mode: "login" | "signup";
  email?: string;
  initialChainSlug?: string;
  disabled?: boolean;
  onSuccess: () => void;
  onWalletNotLinked?: (chainSlug: string) => void;
};

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  searchParams: new URLSearchParams(),
  session: { user: { id: "7" } } as { user: { id: string } } | null,
  lastSignupProps: null as StubProps | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => h.searchParams,
}));
vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
  getSession: () => Promise.resolve(h.session),
}));
vi.mock("@/lib/analytics/posthog", () => ({
  captureAnalyticsEvent: vi.fn(),
  noteSignupCompleted: vi.fn(),
  signupMethodForProvider: () => "google",
}));
vi.mock("@/lib/api/auth-endpoints", () => ({
  signup: vi.fn(),
  verifyEmail: (...a: unknown[]) => h.verifyEmail(...a),
  resendVerification: (...a: unknown[]) => h.resendVerification(...a),
}));
vi.mock("@/components/auth/WalletAuthButton", () => ({
  WalletAuthButton: (props: StubProps) => {
    if (props.mode === "login") {
      return (
        <button type="button" onClick={() => props.onWalletNotLinked?.("solana")}>
          Stub wallet sign-in on Solana (not linked)
        </button>
      );
    }
    h.lastSignupProps = props;
    return (
      <button type="button" disabled={props.disabled} onClick={() => props.onSuccess()}>
        Stub wallet signup succeeds
      </button>
    );
  },
}));

const { BccApiError } = await import("@/lib/api/types");
const { LoginPageClient } = await import("@/app/(auth)/login/LoginPageClient");
const { SignupPageClient } = await import("@/app/(auth)/signup/SignupPageClient");
const { WalletSignupPrompt } = await import("@/components/auth/WalletSignupPrompt");
const VerifyEmailPage = (await import("@/app/(auth)/verify-email/page")).default;
const { PENDING_RECOVERY_EMAIL_KEY } = await import("@/lib/onboarding/pending-recovery-email");
const { readPendingVerificationEmail, stashPendingVerificationEmail } = await import(
  "@/lib/auth/pending-verification-email"
);

/** The new account's (id 7) scoped key. */
const RECOVERY_KEY_FOR_7 = `${PENDING_RECOVERY_EMAIL_KEY}::7`;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  for (const k of [...h.searchParams.keys()]) h.searchParams.delete(k);
  h.session = { user: { id: "7" } };
  h.lastSignupProps = null;
});
afterEach(cleanup);

describe("M22 — /login's wallet sign-up starts on the chain just tried", () => {
  it("hands the chain from the failed sign-in to the prompt's wallet button", () => {
    render(<LoginPageClient />);
    expect(h.lastSignupProps).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /stub wallet sign-in on solana/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(h.lastSignupProps?.initialChainSlug).toBe("solana");
  });

  it("the prompt on its own passes no chain (the button keeps its default)", () => {
    render(<WalletSignupPrompt onSuccess={() => {}} onDismiss={() => {}} />);
    expect(h.lastSignupProps).not.toBeNull();
    expect(h.lastSignupProps && "initialChainSlug" in h.lastSignupProps).toBe(false);
  });
});

describe("the prompt's copy says what happens, without 'mint'", () => {
  it("says an account is created and the wallet signs in; the email line says why it helps", () => {
    render(<WalletSignupPrompt onSuccess={() => {}} onDismiss={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).not.toMatch(/mint/i);
    expect(dialog.textContent).toContain("Pick a handle and we'll create one.");
    expect(dialog.textContent).toContain("You'll sign in with this wallet, no password needed.");
    expect(dialog.textContent).toContain("It lets you get back in if you lose this wallet. You can add it later.");
  });
});

function signupPage() {
  render(<SignupPageClient />);
  const email = screen.getByLabelText("Email") as HTMLInputElement;
  return { email };
}

describe("M23 — /signup's wallet path keeps the email typed on the page", () => {
  it("passes the typed email (trimmed) to the wallet sign-up", () => {
    const { email } = signupPage();
    fireEvent.change(email, { target: { value: "  jo@example.com " } });
    expect(h.lastSignupProps?.email).toBe("jo@example.com");
    expect(screen.getByText(/An email typed above becomes your recovery email\./)).toBeInTheDocument();
  });

  it("passes no email when none was typed", () => {
    signupPage();
    expect(h.lastSignupProps).not.toBeNull();
    expect(h.lastSignupProps && "email" in h.lastSignupProps).toBe(false);
  });

  it("on success hands the email to onboarding under the new account, then goes to /onboarding", async () => {
    const { email } = signupPage();
    fireEvent.change(email, { target: { value: "jo@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Stub wallet signup succeeds" }));

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/onboarding"));
    expect(window.sessionStorage.getItem(RECOVERY_KEY_FOR_7)).toBe("jo@example.com");
    // Never the URL.
    expect(h.replace.mock.calls[0]?.[0]).toBe("/onboarding");
  });

  it("stores nothing when no email was typed, and still goes to /onboarding", async () => {
    signupPage();
    fireEvent.click(screen.getByRole("button", { name: "Stub wallet signup succeeds" }));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/onboarding"));
    expect(window.sessionStorage.getItem(RECOVERY_KEY_FOR_7)).toBeNull();
  });

  it("an unknown session (scope null) stores nothing, and still goes to /onboarding", async () => {
    h.session = null;
    const { email } = signupPage();
    fireEvent.change(email, { target: { value: "jo@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Stub wallet signup succeeds" }));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/onboarding"));
    for (let i = 0; i < window.sessionStorage.length; i++) {
      expect(window.sessionStorage.key(i)).not.toContain(PENDING_RECOVERY_EMAIL_KEY);
    }
  });

  it("a malformed email holds the wallet button and says why, rather than failing on the server", () => {
    const { email } = signupPage();
    fireEvent.change(email, { target: { value: "jo-at-example" } });
    expect(h.lastSignupProps?.disabled).toBe(true);
    expect(screen.getByText("Fix the email above, or clear it, to sign up with a wallet.")).toBeInTheDocument();

    fireEvent.change(email, { target: { value: "" } });
    expect(h.lastSignupProps?.disabled).not.toBe(true);
  });
});

describe("M30 — /verify-email when the address is already verified", () => {
  it("by link: its own card with Sign in, not 'Link expired' and Resend", async () => {
    h.searchParams.set("token", "t");
    stashPendingVerificationEmail("jo@example.com");
    h.verifyEmail.mockRejectedValue(new BccApiError("bcc_already_verified", "RAW SERVER TEXT", 409, null));
    render(<VerifyEmailPage />);

    expect(await screen.findByText("Already verified")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText("Link expired")).toBeNull();
    expect(screen.queryByRole("button", { name: /resend/i })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");
    // Nothing left to verify in this tab.
    expect(readPendingVerificationEmail()).toBe("");
  });

  it("by code: the same card in place of the form", async () => {
    stashPendingVerificationEmail("jo@example.com");
    h.verifyEmail.mockRejectedValue(new BccApiError("bcc_already_verified", "x", 409, null));
    render(<VerifyEmailPage />);
    fireEvent.change(await screen.findByLabelText("Verification code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify email" }));

    expect(await screen.findByText("Already verified")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("Verification code")).toBeNull();
  });

  it("control: a really expired link still reads 'Link expired', with Resend", async () => {
    h.searchParams.set("token", "t");
    stashPendingVerificationEmail("jo@example.com");
    h.verifyEmail.mockRejectedValue(new BccApiError("bcc_invalid_verify_token", "x", 400, null));
    render(<VerifyEmailPage />);

    expect(await screen.findByText("Link expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend/i })).toBeInTheDocument();
    expect(screen.queryByText("Already verified")).toBeNull();
  });
});
