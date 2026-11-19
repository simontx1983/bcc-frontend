/**
 * F-252 — a wallet sign-up takes two signatures, and a failure after the
 * account exists must not read as a failed sign-up.
 *
 * Step 1 signs a one-shot nonce for POST /auth/wallet-signup (the account
 * is created and the wallet linked). Step 2 signs a fresh nonce for
 * signIn("wallet"). Before F-252 the second prompt came with no
 * explanation, and if step 2 failed the user saw "Wallet sign-in failed.
 * Try again." — and trying again signed up again, which answers "This
 * wallet is already linked to another account" (their own new account).
 *
 * Now the two prompts are said up front and numbered, and a failure after
 * step 1 shows "Account created — sign in" with a button that re-runs
 * step 2 only.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as DispatchModule from "@/lib/wallet/dispatch";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const h = vi.hoisted(() => ({
  nonce: vi.fn(),
  walletSignup: vi.fn(),
  signIn: vi.fn(),
  connect: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("@/lib/api/auth-endpoints", () => ({
  getPublicWalletNonce: (...a: unknown[]) => h.nonce(...a),
  walletSignup: (...a: unknown[]) => h.walletSignup(...a),
}));
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => h.signIn(...a) }));
vi.mock("@/lib/wallet/dispatch", async (importActual) => ({
  ...(await importActual<typeof DispatchModule>()),
  connectWallet: (...a: unknown[]) => h.connect(...a),
  signWalletChallenge: (...a: unknown[]) => h.sign(...a),
}));

const { WalletAuthButton, WALLET_SIGNUP_STEP_COPY } = await import("@/components/auth/WalletAuthButton");
const { BccApiError } = await import("@/lib/api/types");
const { MetaMaskUserRejectedError } = await import("@/lib/wallet/metamask");

const onSuccess = vi.fn();

function renderSignup(extra: { disabled?: boolean } = {}) {
  return render(<WalletAuthButton mode="signup" handle="jo-welds" onSuccess={onSuccess} {...extra} />);
}
const signUpButton = () => screen.getByRole("button", { name: "Sign up with wallet" });
const finishButton = () => screen.getByRole("button", { name: "Sign in with wallet" });
const accountCreated = () => screen.queryByText("Account created — sign in");
/** The screen-reader-only region that reads out the account-created notice. */
const announcer = () => document.querySelector<HTMLElement>('[aria-live="assertive"]');

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.connect.mockResolvedValue({ address: "0xabc", chainSlug: "ethereum" });
  let n = 0;
  h.nonce.mockImplementation(() => Promise.resolve({ message: `nonce-${String(++n)}`, nonce: "n", expires_at: "" }));
  let s = 0;
  h.sign.mockImplementation(() => Promise.resolve({ signature: `sig-${String(++s)}`, extra: {} }));
  h.walletSignup.mockResolvedValue({ ok: true });
  h.signIn.mockResolvedValue({ ok: true, error: null });
});
afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────

describe("the two signatures are explained", () => {
  it("says up front that sign-up takes two signatures", () => {
    renderSignup();
    expect(screen.getByRole("status")).toHaveTextContent(WALLET_SIGNUP_STEP_COPY.before);
  });

  it("numbers them while they run: Step 1 of 2, then Step 2 of 2", async () => {
    const first = deferred<{ signature: string; extra: Record<string, string> }>();
    const second = deferred<{ signature: string; extra: Record<string, string> }>();
    h.sign.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderSignup();
    fireEvent.click(signUpButton());

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(WALLET_SIGNUP_STEP_COPY.step1));
    first.resolve({ signature: "sig-1", extra: {} });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(WALLET_SIGNUP_STEP_COPY.step2));
    second.resolve({ signature: "sig-2", extra: {} });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("sign-in mode says nothing about steps", () => {
    render(<WalletAuthButton mode="login" onSuccess={onSuccess} />);
    expect(screen.queryByText(WALLET_SIGNUP_STEP_COPY.before)).toBeNull();
  });
});

describe("a sign-up that finishes", () => {
  it("creates the account with signature 1 and signs in with signature 2", async () => {
    renderSignup();
    fireEvent.click(signUpButton());

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(h.walletSignup).toHaveBeenCalledTimes(1);
    expect(h.walletSignup.mock.calls[0]?.[0]).toMatchObject({ signature: "sig-1", handle: "jo-welds" });
    expect(h.signIn).toHaveBeenCalledWith("wallet", expect.objectContaining({ signature: "sig-2" }));
    expect(accountCreated()).toBeNull();
  });
});

describe("a failure after the account exists", () => {
  it("the second prompt cancelled: 'Account created — sign in', with the reason, and no sign-up button", async () => {
    h.sign
      .mockResolvedValueOnce({ signature: "sig-1", extra: {} })
      .mockRejectedValueOnce(new MetaMaskUserRejectedError());
    renderSignup();
    fireEvent.click(signUpButton());

    expect(await screen.findByText("Account created — sign in")).toBeInTheDocument();
    expect(announcer()).toHaveTextContent("Wallet signing was canceled.");
    // The panel shows the reason too; the region above reads it out.
    expect(
      screen.getByText(/Signing in didn't finish: Wallet signing was canceled\./, { selector: ".bcc-auth-success-body" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign up with wallet" })).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("the sign-in refused: the same notice, not a bare 'Wallet sign-in failed'", async () => {
    h.signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    renderSignup();
    fireEvent.click(signUpButton());

    expect(await screen.findByText("Account created — sign in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign up with wallet" })).toBeNull();
  });

  it("the second nonce could not be fetched: the same notice", async () => {
    h.nonce
      .mockResolvedValueOnce({ message: "nonce-1", nonce: "n", expires_at: "" })
      .mockRejectedValueOnce(new BccApiError("bcc_network_error", "raw", 0, null));
    renderSignup();
    fireEvent.click(signUpButton());

    expect(await screen.findByText("Account created — sign in")).toBeInTheDocument();
    expect(announcer()).toHaveTextContent("Couldn't reach the server.");
  });

  it("'Sign in with wallet' re-runs step 2 only — no second sign-up", async () => {
    h.signIn.mockResolvedValueOnce({ ok: false, error: "CredentialsSignin" });
    renderSignup();
    fireEvent.click(signUpButton());
    await screen.findByText("Account created — sign in");

    fireEvent.click(finishButton());
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(h.walletSignup).toHaveBeenCalledTimes(1);
    expect(h.nonce).toHaveBeenCalledTimes(3);
    expect(h.signIn).toHaveBeenLastCalledWith("wallet", expect.objectContaining({ signature: "sig-3" }));
  });

  it("a retry that fails again keeps the notice, with the new reason", async () => {
    h.signIn.mockResolvedValueOnce({ ok: false, error: "CredentialsSignin" });
    renderSignup();
    fireEvent.click(signUpButton());
    await screen.findByText("Account created — sign in");

    h.sign.mockRejectedValueOnce(new MetaMaskUserRejectedError());
    fireEvent.click(finishButton());
    await waitFor(() => expect(announcer()).toHaveTextContent("Wallet signing was canceled."));
    expect(accountCreated()).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("the retry is not blocked by the parent's disabled form", async () => {
    h.signIn.mockResolvedValueOnce({ ok: false, error: "CredentialsSignin" });
    const { rerender } = renderSignup();
    fireEvent.click(signUpButton());
    await screen.findByText("Account created — sign in");

    rerender(<WalletAuthButton mode="signup" handle="" disabled onSuccess={onSuccess} />);
    expect(finishButton()).toBeEnabled();
  });

  it("points at the sign-in page as the other way in", async () => {
    h.signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    renderSignup();
    fireEvent.click(signUpButton());
    await screen.findByText("Account created — sign in");
    expect(screen.getByRole("link", { name: "sign-in page" })).toHaveAttribute("href", "/login");
  });
});

describe("a failure before the account exists is still a plain error", () => {
  it("the handle is taken: the error, and the sign-up button stays", async () => {
    h.walletSignup.mockRejectedValue(new BccApiError("bcc_conflict", "raw", 409, null));
    renderSignup();
    fireEvent.click(signUpButton());

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("That handle is already taken."));
    expect(accountCreated()).toBeNull();
    expect(signUpButton()).toBeInTheDocument();
    expect(h.signIn).not.toHaveBeenCalled();
  });

  it("the first prompt cancelled: the error, no notice", async () => {
    h.sign.mockRejectedValueOnce(new MetaMaskUserRejectedError());
    renderSignup();
    fireEvent.click(signUpButton());

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Wallet signing was canceled."));
    expect(accountCreated()).toBeNull();
    expect(h.walletSignup).not.toHaveBeenCalled();
  });

  it("sign-in mode: a refused sign-in is an error, never the account-created notice", async () => {
    h.signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    render(<WalletAuthButton mode="login" onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with wallet" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Wallet sign-in failed. Try again."));
    expect(accountCreated()).toBeNull();
  });
});

describe("live regions are mounted before their text arrives (#328)", () => {
  it("the account-created notice fills the assertive region that was already there", async () => {
    h.signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    renderSignup();
    const region = announcer();
    expect(region).not.toBeNull();
    expect(region).toHaveTextContent("");
    expect(region).toHaveAttribute("aria-atomic", "true");
    fireEvent.click(signUpButton());

    await screen.findByText("Account created — sign in");
    expect(announcer()).toBe(region);
    expect(region).toHaveTextContent("Account created — sign in. Signing in didn't finish:");
  });

  it("adds no alert to its page while idle, or with the panel up (host pages count their own)", async () => {
    h.signIn.mockResolvedValue({ ok: false, error: "CredentialsSignin" });
    renderSignup();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(signUpButton());
    await screen.findByText("Account created — sign in");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the retry's Step 2 of 2 fills a status region mounted empty with the panel", async () => {
    h.signIn.mockResolvedValueOnce({ ok: false, error: "CredentialsSignin" });
    renderSignup();
    fireEvent.click(signUpButton());
    await screen.findByText("Account created — sign in");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("");

    const second = deferred<{ signature: string; extra: Record<string, string> }>();
    h.sign.mockReturnValueOnce(second.promise);
    fireEvent.click(finishButton());
    await waitFor(() => expect(status).toHaveTextContent(WALLET_SIGNUP_STEP_COPY.step2));
    expect(screen.getByRole("status")).toBe(status);
    second.resolve({ signature: "sig-3", extra: {} });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });
});
