/**
 * F-263 (M22) — WalletAuthButton's chain carries across "no account yet".
 *
 * A wallet sign-in that answers `bcc_wallet_not_linked` hands off to
 * /login's sign-up prompt. The chain the visitor picked used to be lost
 * there: the prompt's own button started over at the default. Now the
 * hand-off carries the chain (`onWalletNotLinked(chainSlug)`), and the
 * button can start on one (`initialChainSlug`, ignored unless supported).
 *
 * The real component; only the wallet and the network are mocked, as in
 * wallet-signup-two-step.test.tsx.
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

const { WalletAuthButton } = await import("@/components/auth/WalletAuthButton");

const chainSelect = () => screen.getByLabelText("Wallet chain") as HTMLSelectElement;

beforeEach(() => {
  vi.clearAllMocks();
  h.connect.mockResolvedValue({ address: "0xabc", chainId: "" });
  h.nonce.mockResolvedValue({ message: "nonce-1", nonce: "n", expires_at: "" });
  h.sign.mockResolvedValue({ signature: "sig-1", extra: {} });
  h.walletSignup.mockResolvedValue({ ok: true });
  h.signIn.mockResolvedValue({ ok: false, error: "bcc_wallet_not_linked" });
});
afterEach(cleanup);

describe("WalletAuthButton — the chain across 'no account yet'", () => {
  it("hands the chain the visitor picked to onWalletNotLinked", async () => {
    const onWalletNotLinked = vi.fn();
    render(<WalletAuthButton mode="login" onSuccess={() => {}} onWalletNotLinked={onWalletNotLinked} />);
    fireEvent.change(chainSelect(), { target: { value: "base" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in with wallet" }));

    await waitFor(() => expect(onWalletNotLinked).toHaveBeenCalledTimes(1));
    expect(onWalletNotLinked).toHaveBeenCalledWith("base");
    expect(h.connect).toHaveBeenCalledWith("base", expect.anything());
  });

  it("starts on initialChainSlug when it is a supported chain", () => {
    render(<WalletAuthButton mode="signup" handle="jo-welds" onSuccess={() => {}} initialChainSlug="arbitrum" />);
    expect(chainSelect().value).toBe("arbitrum");
  });

  it("ignores an unsupported initialChainSlug and keeps the default", async () => {
    render(<WalletAuthButton mode="login" onSuccess={() => {}} />);
    const fallback = chainSelect().value;
    cleanup();
    // A <select> shows its first option for an unknown value either way, so
    // the proof is what the button DOES: it connects on the default chain,
    // rather than refusing with "Pick a supported chain."
    render(<WalletAuthButton mode="login" onSuccess={() => {}} initialChainSlug="not-a-chain" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with wallet" }));
    await waitFor(() => expect(h.connect).toHaveBeenCalledTimes(1));
    expect(h.connect).toHaveBeenCalledWith(fallback, expect.anything());
    expect(screen.queryByText("Pick a supported chain.")).toBeNull();
  });

  it("a sign-up's own sign-in never hands off as 'not linked' (signup mode has no hand-off)", async () => {
    const onWalletNotLinked = vi.fn();
    render(
      <WalletAuthButton
        mode="signup"
        handle="jo-welds"
        onSuccess={() => {}}
        onWalletNotLinked={onWalletNotLinked}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign up with wallet" }));
    // Step 2's sign-in answers not-linked: the account-created panel, no hand-off.
    expect(await screen.findByText("Account created — sign in")).toBeInTheDocument();
    expect(onWalletNotLinked).not.toHaveBeenCalled();
  });
});
