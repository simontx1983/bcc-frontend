/**
 * The address being verified travels in sessionStorage, not the URL (F-410).
 *
 * /signup (after a password sign-up) and /login (when a sign-in is refused
 * as unverified) used to send people to `/verify-email?email=<address>`,
 * which put the address in browser history, Referers and access logs. They
 * now stash it (lib/auth/pending-verification-email) and /verify-email reads
 * it from there.
 *
 * The emailed link still carries `?email=&token=` until the backend drops
 * the address. The page already verifies with the token alone, and when it
 * has no address it asks for one, so a token-only link works. A legacy
 * `?email=` is taken once into storage and scrubbed from the address bar.
 */

import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const h = vi.hoisted(() => ({
  signup: vi.fn(),
  login: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  signIn: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/lib/api/auth-endpoints", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  signup: (...a: unknown[]) => h.signup(...a),
  loginWithIdentifier: (...a: unknown[]) => h.login(...a),
  verifyEmail: (...a: unknown[]) => h.verifyEmail(...a),
  resendVerification: (...a: unknown[]) => h.resendVerification(...a),
}));
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => h.signIn(...a) }));
vi.mock("@/lib/analytics/posthog", () => ({
  captureAnalyticsEvent: vi.fn(),
  noteSignupCompleted: vi.fn(),
}));
vi.mock("@/components/auth/WalletAuthButton", () => ({ WalletAuthButton: () => null }));
vi.mock("@/components/auth/WalletSignupPrompt", () => ({ WalletSignupPrompt: () => null }));

const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const { BccApiError } = await import("@/lib/api/types");
const { SignupPageClient } = await import("@/app/(auth)/signup/SignupPageClient");
const { LoginPageClient } = await import("@/app/(auth)/login/LoginPageClient");
const VerifyEmailPage = (await import("@/app/(auth)/verify-email/page")).default;
const { readPendingVerificationEmail, stashPendingVerificationEmail } = await import(
  "@/lib/auth/pending-verification-email"
);

const ADDRESS = "jo@example.com";
const JWT = {
  user_id: 1, handle: "jo", token: "jwt", expires_in: 3600, token_type: "Bearer",
  in_good_standing: true, linked_wallet_count: 0,
};

/** Put the page at `path`, and mirror its query in the hook. */
function arriveAt(path: string) {
  window.history.replaceState(null, "", path);
  // Snapshot the keys: deleting inside forEach skips every other entry.
  for (const k of [...searchParams.keys()]) searchParams.delete(k);
  new URL(path, "https://x.test").searchParams.forEach((v, k) => searchParams.set(k, v));
}

const codeInput = () => screen.getByLabelText("Verification code");
const verifyButton = () => screen.getByRole("button", { name: "Verify email" });
const resendButton = () => screen.getByRole("button", { name: /resend|sending/i });

function enterCode() {
  fireEvent.change(codeInput(), { target: { value: "123456" } });
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
  arriveAt("/verify-email");
  window.sessionStorage.clear();
  h.verifyEmail.mockResolvedValue(JWT);
  h.resendVerification.mockResolvedValue(undefined);
  h.signIn.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

// ─────────────────────────────────────────────────────────────────────

describe("the pages that send people to /verify-email", () => {
  it("/signup: no address in the URL; it is stashed instead", async () => {
    h.signup.mockResolvedValue({ ok: true, email: ADDRESS });
    render(<SignupPageClient />);
    fireEvent.change(document.getElementById("email") as HTMLElement, { target: { value: ` ${ADDRESS} ` } });
    fireEvent.change(document.getElementById("password") as HTMLElement, { target: { value: "longpassword" } });
    fireEvent.change(document.getElementById("handle") as HTMLElement, { target: { value: "jo-welds" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(h.replace).toHaveBeenCalledTimes(1));
    expect(h.replace).toHaveBeenCalledWith("/verify-email");
    expect(readPendingVerificationEmail()).toBe(ADDRESS);
  });

  it("/login: the 'Verify your email' link has no address, and following it stashes the address", async () => {
    h.login.mockRejectedValue(new BccApiError("bcc_email_not_verified", "raw", 403, null));
    render(<LoginPageClient />);
    fireEvent.change(screen.getByLabelText("Email or handle"), { target: { value: ADDRESS } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longpassword" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }));

    const link = await screen.findByRole("link", { name: /Verify your email/ });
    expect(link).toHaveAttribute("href", "/verify-email");
    expect(readPendingVerificationEmail()).toBe("");
    fireEvent.click(link);
    expect(readPendingVerificationEmail()).toBe(ADDRESS);
  });
});

describe("/verify-email takes the address from sessionStorage", () => {
  it("says where the code went, verifies with it, and leaves the URL alone", async () => {
    stashPendingVerificationEmail(ADDRESS);
    const spy = vi.spyOn(window.history, "replaceState");
    render(<VerifyEmailPage />);

    expect(await screen.findByText(new RegExp(`sent a 6-digit code to ${ADDRESS}`))).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).toBeNull();
    enterCode();
    fireEvent.click(verifyButton());
    await waitFor(() => expect(h.verifyEmail).toHaveBeenCalledWith({ email: ADDRESS, code: "123456" }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("resends to it", async () => {
    stashPendingVerificationEmail(ADDRESS);
    render(<VerifyEmailPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Resend code" }));
    await waitFor(() => expect(h.resendVerification).toHaveBeenCalledWith(ADDRESS));
  });

  it("survives a reload until verification succeeds, then is cleared", async () => {
    stashPendingVerificationEmail(ADDRESS);
    render(<VerifyEmailPage />);
    await screen.findByText(new RegExp(ADDRESS));
    cleanup();

    render(<VerifyEmailPage />);
    await screen.findByText(new RegExp(ADDRESS));
    enterCode();
    fireEvent.click(verifyButton());
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/onboarding"));
    expect(readPendingVerificationEmail()).toBe("");
  });

  it("is cleared when the server drops the address (in use by another account)", async () => {
    stashPendingVerificationEmail(ADDRESS);
    h.verifyEmail.mockRejectedValue(new BccApiError("bcc_conflict", "raw", 409, null));
    render(<VerifyEmailPage />);
    await screen.findByText(new RegExp(ADDRESS));
    enterCode();
    fireEvent.click(verifyButton());

    await screen.findByText("Email already in use");
    expect(readPendingVerificationEmail()).toBe("");
  });

  it("is kept after a wrong code, so the next try still has it", async () => {
    stashPendingVerificationEmail(ADDRESS);
    h.verifyEmail.mockRejectedValue(new BccApiError("bcc_invalid_otp", "raw", 400, null));
    render(<VerifyEmailPage />);
    await screen.findByText(new RegExp(ADDRESS));
    enterCode();
    fireEvent.click(verifyButton());

    await screen.findByRole("alert");
    expect(readPendingVerificationEmail()).toBe(ADDRESS);
  });

  it("the first paint (server render) is a reading card, not a form without the address", () => {
    stashPendingVerificationEmail(ADDRESS);
    const html = renderToString(<VerifyEmailPage />);
    expect(html).toContain("Just a moment");
    expect(html).not.toContain("Verify email");
    expect(html).not.toContain(ADDRESS);
  });
});

describe("no address in this tab: the form asks for it", () => {
  it("shows an Email field; Verify waits for an address and sends the typed one", async () => {
    render(<VerifyEmailPage />);
    const field = await screen.findByLabelText("Email");
    enterCode();
    expect(verifyButton()).toBeDisabled();

    fireEvent.change(field, { target: { value: ` ${ADDRESS} ` } });
    fireEvent.click(verifyButton());
    await waitFor(() => expect(h.verifyEmail).toHaveBeenCalledWith({ email: ADDRESS, code: "123456" }));
  });

  it("Resend waits for an address, and sends the typed one", async () => {
    render(<VerifyEmailPage />);
    const field = await screen.findByLabelText("Email");
    expect(resendButton()).toBeDisabled();

    fireEvent.change(field, { target: { value: ADDRESS } });
    fireEvent.click(resendButton());
    await waitFor(() => expect(h.resendVerification).toHaveBeenCalledWith(ADDRESS));
  });

  it("a typed address the browser rejects is not sent", async () => {
    render(<VerifyEmailPage />);
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "not-an-address" } });
    fireEvent.click(resendButton());
    expect(h.resendVerification).not.toHaveBeenCalled();
  });

  it("an address the server rejects says so, not 'check your connection'", async () => {
    h.resendVerification.mockRejectedValue(new BccApiError("bcc_invalid_request", "raw", 422, null));
    render(<VerifyEmailPage />);
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "jo@localhost" } });
    fireEvent.click(resendButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
  });
});

describe("a link that carries only the token (the backend's next link)", () => {
  it("verifies with the token alone", async () => {
    arriveAt("/verify-email?token=link-token");
    render(<VerifyEmailPage />);
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/onboarding"));
    expect(h.verifyEmail).toHaveBeenCalledWith({ token: "link-token" });
  });

  it("expired, with no address in this tab: 'Get a new code' opens the form, which asks for it", async () => {
    arriveAt("/verify-email?token=used");
    h.verifyEmail.mockRejectedValue(new BccApiError("bcc_invalid_verify_token", "raw", 400, null));
    render(<VerifyEmailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Get a new code" }));
    fireEvent.change(await screen.findByLabelText("Email"), { target: { value: ADDRESS } });
    fireEvent.click(resendButton());
    await waitFor(() => expect(h.resendVerification).toHaveBeenCalledWith(ADDRESS));
  });

  it("expired, with the address in this tab: resend and enter-a-code, as before", async () => {
    stashPendingVerificationEmail(ADDRESS);
    arriveAt("/verify-email?token=used");
    h.verifyEmail.mockRejectedValue(new BccApiError("bcc_invalid_verify_token", "raw", 400, null));
    render(<VerifyEmailPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Resend code" }));
    await waitFor(() => expect(h.resendVerification).toHaveBeenCalledWith(ADDRESS));
    expect(screen.getByRole("button", { name: "Enter code manually" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get a new code" })).toBeNull();
  });

  it("a link the server answers 'in use by another account' clears the stashed address", async () => {
    stashPendingVerificationEmail(ADDRESS);
    arriveAt("/verify-email?token=link-token");
    h.verifyEmail.mockRejectedValue(new BccApiError("bcc_conflict", "raw", 409, null));
    render(<VerifyEmailPage />);
    await screen.findByText("Email already in use");
    expect(readPendingVerificationEmail()).toBe("");
  });

  it("a successful link clears the stashed address", async () => {
    stashPendingVerificationEmail(ADDRESS);
    arriveAt("/verify-email?token=link-token");
    render(<VerifyEmailPage />);
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/onboarding"));
    expect(readPendingVerificationEmail()).toBe("");
  });
});

describe("legacy ?email= (earlier redirects, and the emailed link until the backend drops it)", () => {
  it("is taken into storage and scrubbed from the address bar in place", async () => {
    arriveAt("/verify-email?email=jo%40example.com");
    const lengthBefore = window.history.length;
    render(<VerifyEmailPage />);

    expect(await screen.findByText(new RegExp(ADDRESS))).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(window.history.length).toBe(lengthBefore);
    expect(readPendingVerificationEmail()).toBe(ADDRESS);
  });

  it("with a token: verifies by token, scrubs the address and keeps the token", async () => {
    arriveAt("/verify-email?email=jo%40example.com&token=link-token");
    render(<VerifyEmailPage />);

    await waitFor(() => expect(h.verifyEmail).toHaveBeenCalledWith({ token: "link-token" }));
    expect(window.location.href).not.toContain("example.com");
    expect(new URLSearchParams(window.location.search).get("token")).toBe("link-token");
  });

  it("wins over an address already stashed (the link names the account it is for)", async () => {
    stashPendingVerificationEmail("someone-else@example.com");
    arriveAt("/verify-email?email=jo%40example.com");
    render(<VerifyEmailPage />);

    expect(await screen.findByText(new RegExp(`code to ${ADDRESS}`))).toBeInTheDocument();
    expect(readPendingVerificationEmail()).toBe(ADDRESS);
  });

  it("is taken once under StrictMode (effects run twice in development)", async () => {
    arriveAt("/verify-email?email=jo%40example.com");
    render(
      <StrictMode>
        <VerifyEmailPage />
      </StrictMode>,
    );
    expect(await screen.findByText(new RegExp(ADDRESS))).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });
});
