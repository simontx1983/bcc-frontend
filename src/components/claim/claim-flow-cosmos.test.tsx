/**
 * ClaimFlow — Cosmos validator claims go through the shared wallet-link
 * flow.
 *
 * The bug: ClaimFlow kept its own copy of the link sequence and sent the
 * Keplr public key at the TOP LEVEL of `POST /auth/wallet-link`. The
 * backend verifier reads it only from `extra.pub_key`, so every Cosmos
 * claim failed signature verification and showed the wrong copy.
 *
 * Only the lowest wallet layer (`lib/wallet/keplr`) is mocked, so the
 * real shared dispatch + linkFlow code builds the request body here.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as KeplrModule from "@/lib/wallet/keplr";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const connectKeplr = vi.fn();
const signKeplrChallenge = vi.fn();
vi.mock("@/lib/wallet/keplr", async (importActual) => {
  const actual = await importActual<typeof KeplrModule>();
  return {
    ...actual,
    isCosmosChain: () => true,
    connectKeplr: (...a: unknown[]) => connectKeplr(...a),
    signKeplrChallenge: (...a: unknown[]) => signKeplrChallenge(...a),
  };
});

const getWalletNonce = vi.fn();
const linkWallet = vi.fn();
vi.mock("@/lib/api/auth-endpoints", () => ({
  getWalletNonce: (...a: unknown[]) => getWalletNonce(...a),
  linkWallet: (...a: unknown[]) => linkWallet(...a),
}));

const getMyWallets = vi.fn();
vi.mock("@/lib/api/wallets-endpoints", () => ({
  getMyWallets: (...a: unknown[]) => getMyWallets(...a),
}));

const claimPage = vi.fn();
vi.mock("@/lib/api/pages-endpoints", () => ({
  claimPage: (...a: unknown[]) => claimPage(...a),
}));

import { ClaimFlow } from "@/components/claim/ClaimFlow";
import { BccApiError } from "@/lib/api/types";

const ADDRESS = "cosmos1operatoraddressxyz";
const TARGET = { entity_type: "validator" as const, entity_id: 42, chain_slug: "cosmos" };

beforeAll(() => {
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false, media: query, onchange: null,
        addListener: () => undefined, removeListener: () => undefined,
        addEventListener: () => undefined, removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  }
});

beforeEach(() => {
  for (const m of [connectKeplr, signKeplrChallenge, getWalletNonce, linkWallet, getMyWallets, claimPage]) {
    m.mockReset();
  }
  connectKeplr.mockResolvedValue({ address: ADDRESS, chainId: "cosmoshub-4", chainSlug: "cosmos" });
  getWalletNonce.mockResolvedValue({ message: "Sign this: nonce-123", nonce: "nonce-123", expires_at: "" });
  signKeplrChallenge.mockResolvedValue({ signature: "c2lnbmF0dXJl", pubKey: "cHViS2V5" });
  linkWallet.mockResolvedValue({ wallet_link_id: 9, chain_slug: "cosmos", chain_name: "Cosmos Hub", address: ADDRESS });
  claimPage.mockResolvedValue({ ok: true });
  getMyWallets.mockResolvedValue({ items: [] });
});
afterEach(() => cleanup());

async function runToSign() {
  render(<ClaimFlow pageId={7} pageName="Atlas Validator" target={TARGET} onClose={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: /I AM THE OPERATOR/ }));
  fireEvent.click(await screen.findByRole("button", { name: "SIGN WITH KEPLR" }));
}

describe("ClaimFlow — the Cosmos link request", () => {
  it("sends the public key in extra.pub_key (with chain_id), never at the top level", async () => {
    await runToSign();
    await screen.findByText(/is yours\./);

    expect(linkWallet).toHaveBeenCalledTimes(1);
    const body = linkWallet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toMatchObject({
      wallet_address: ADDRESS,
      signature: "c2lnbmF0dXJl",
      wallet_type: "keplr",
      extra: { pub_key: "cHViS2V5", chain_id: "cosmoshub-4" },
    });
    expect(body).not.toHaveProperty("pub_key");
    expect(claimPage).toHaveBeenCalledWith({ id: 7, entity_type: "validator", entity_id: 42 });
  });
});

describe("ClaimFlow — a wallet already linked to this account", () => {
  it("treats a self-link conflict as success and goes on to the claim", async () => {
    linkWallet.mockRejectedValue(new BccApiError("bcc_conflict", "already linked to your account", 409, null));
    getMyWallets.mockResolvedValue({
      items: [{ wallet_address: ADDRESS.toUpperCase(), chain_slug: "cosmos" }],
    });

    await runToSign();

    await waitFor(() => expect(claimPage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/is yours\./)).toBeInTheDocument());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a conflict for a wallet on ANOTHER account stops with link copy, and never claims", async () => {
    linkWallet.mockRejectedValue(new BccApiError("bcc_conflict", "already linked to another account", 409, null));
    getMyWallets.mockResolvedValue({ items: [{ wallet_address: "cosmos1someoneelse", chain_slug: "cosmos" }] });

    await runToSign();

    expect(await screen.findByRole("alert")).toHaveTextContent("This wallet is linked to a different BCC account.");
    expect(claimPage).not.toHaveBeenCalled();
  });
});

describe("ClaimFlow — error copy names the step that failed", () => {
  it("a link signature failure says the signature didn't verify", async () => {
    linkWallet.mockRejectedValue(new BccApiError("bcc_signature_invalid", "raw", 403, null));
    await runToSign();
    expect(await screen.findByRole("alert")).toHaveTextContent("The wallet signature didn't verify.");
    expect(claimPage).not.toHaveBeenCalled();
  });

  it("a claim 403 says the wallet isn't the operator", async () => {
    claimPage.mockRejectedValue(new BccApiError("bcc_forbidden", "raw", 403, null));
    await runToSign();
    expect(await screen.findByRole("alert")).toHaveTextContent("This wallet doesn't match the validator's operator address.");
  });

  it("a claim 409 says the page is already claimed", async () => {
    claimPage.mockRejectedValue(new BccApiError("bcc_conflict", "raw", 409, null));
    await runToSign();
    expect(await screen.findByRole("alert")).toHaveTextContent("This page is already claimed by another wallet.");
    expect(getMyWallets).not.toHaveBeenCalled();
  });

  it("never renders the raw server message", async () => {
    claimPage.mockRejectedValue(new BccApiError("bcc_forbidden", "RAW SERVER TEXT", 403, null));
    await runToSign();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText(/RAW SERVER TEXT/)).toBeNull();
  });
});
