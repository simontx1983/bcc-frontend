/**
 * UX scan 2026-11-12, claims H2 (rest): a Polkadot validator claim must be
 * signed by the validator's STASH account, but connectPolkadot always took
 * accounts[0]. An operator whose stash wasn't the first account in their
 * wallet could never claim. The signature step now lists every account
 * when there is more than one, and signs with the one picked.
 *
 * The adapter itself is exercised for real against a fake
 * window.injectedWeb3; only the extension is faked.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

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
import { connectPolkadot } from "@/lib/wallet/polkadot";

const HOT = "1HotWalletAccountAddressAAAAAAAAAAAAAAAAAAAAAAA";
const STASH = "1StashAccountAddressBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const TARGET = { entity_type: "validator" as const, entity_id: 42, chain_slug: "polkadot" };
const signRaw = vi.fn();

function installWallet(accounts: Array<{ address: string; name?: string }>) {
  (window as unknown as { injectedWeb3: unknown }).injectedWeb3 = {
    "polkadot-js": {
      enable: async () => ({
        accounts: { get: async () => accounts },
        signer: { signRaw: (p: unknown) => signRaw(p) },
      }),
    },
  };
}

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
  for (const m of [getWalletNonce, linkWallet, getMyWallets, claimPage, signRaw]) m.mockReset();
  getWalletNonce.mockResolvedValue({ message: "Sign this", nonce: "n", expires_at: "" });
  signRaw.mockResolvedValue({ signature: "0xsig" });
  linkWallet.mockResolvedValue({ wallet_link_id: 9, chain_slug: "polkadot", chain_name: "Polkadot", address: STASH });
  claimPage.mockResolvedValue({ ok: true });
  getMyWallets.mockResolvedValue({ items: [] });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { injectedWeb3?: unknown }).injectedWeb3;
});

function renderFlow() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ClaimFlow pageId={7} pageName="Atlas Validator" target={TARGET} onClose={() => undefined} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /I AM THE OPERATOR/ }));
}

describe("connectPolkadot", () => {
  it("returns every account, not just the first", async () => {
    installWallet([{ address: HOT, name: "Hot" }, { address: STASH }]);
    const c = await connectPolkadot();
    expect(c.address).toBe(HOT);
    expect(c.accounts).toEqual([
      { address: HOT, name: "Hot" },
      { address: STASH, name: null },
    ]);
  });
});

describe("ClaimFlow — choosing the Polkadot stash account", () => {
  it("lists every account and signs with the one picked", async () => {
    installWallet([{ address: HOT, name: "Hot" }, { address: STASH, name: "Stash" }]);
    renderFlow();
    const stash = await screen.findByRole("radio", { name: /Stash/ });
    expect(screen.getByRole("radio", { name: /Hot/ })).toBeChecked();

    fireEvent.click(stash);
    expect(stash).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "SIGN MESSAGE" }));
    await screen.findByText(/is yours\./);

    expect(signRaw).toHaveBeenCalledWith(expect.objectContaining({ address: STASH }));
    expect(linkWallet.mock.calls[0]?.[0]).toMatchObject({ wallet_address: STASH });
  });

  it("a single account shows no picker", async () => {
    installWallet([{ address: STASH }]);
    renderFlow();
    await screen.findByRole("button", { name: "SIGN MESSAGE" });
    expect(screen.queryByRole("radio")).toBeNull();
  });
});
