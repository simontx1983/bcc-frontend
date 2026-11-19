/**
 * F-263 (M23) — a wallet sign-up whose email the server refused says so.
 *
 * The server checks a sign-up's email with WordPress's is_email, which is
 * stricter than the browser's type="email". A refusal answers
 * `bcc_invalid_request`, which the button used to show as "Wallet request
 * was malformed. Try again." It now points at the email when one was sent,
 * on /signup and in /login's prompt alike.
 *
 * The real component; only the wallet and the network are mocked.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

const { WalletAuthButton } = await import("@/components/auth/WalletAuthButton");
const { BccApiError } = await import("@/lib/api/types");

const REFUSED = "Check the email above. It doesn't look like a complete address.";

beforeEach(() => {
  vi.clearAllMocks();
  h.connect.mockResolvedValue({ address: "0xabc", chainId: "" });
  h.nonce.mockResolvedValue({ message: "nonce-1", nonce: "n", expires_at: "" });
  h.sign.mockResolvedValue({ signature: "sig-1", extra: {} });
  h.walletSignup.mockRejectedValue(new BccApiError("bcc_invalid_request", "RAW SERVER TEXT", 400, null));
  h.signIn.mockResolvedValue({ ok: true, error: null });
});
afterEach(cleanup);

describe("WalletAuthButton — the server refuses the sign-up's email", () => {
  it("with an email sent: the line points at the email, never the server's words", async () => {
    render(<WalletAuthButton mode="signup" handle="jo-welds" email="jo@example.c" onSuccess={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign up with wallet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(REFUSED);
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");
    expect(screen.queryByText("Account created — sign in")).toBeNull();
  });

  it("control: with no email sent, the same code keeps its general line", async () => {
    render(<WalletAuthButton mode="signup" handle="jo-welds" onSuccess={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign up with wallet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wallet request was malformed. Try again.");
  });

  it("control: another refusal with an email sent keeps its own line", async () => {
    h.walletSignup.mockRejectedValue(new BccApiError("bcc_conflict", "x", 409, null));
    render(<WalletAuthButton mode="signup" handle="jo-welds" email="jo@example.com" onSuccess={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign up with wallet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That handle is already taken.");
  });
});
