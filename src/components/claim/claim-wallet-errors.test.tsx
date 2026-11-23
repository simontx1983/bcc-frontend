/**
 * F-316 (UX scan claims Mediums) in the claim dialog:
 *   M-cl2 a wallet that isn't installed comes with a link to get it, and a
 *         declined connect prompt doesn't say "signing was canceled";
 *   M-cl6 the dialog's buttons are 44px targets (they were 30-36px).
 * (M-cl4, bcc_conflict, was already final with no Retry since #266.)
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as KeplrModule from "@/lib/wallet/keplr";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

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

const TARGET = { entity_type: "validator" as const, entity_id: 42, chain_slug: "cosmos" };
const onClose = vi.fn();
let client: QueryClient;

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
  for (const m of [connectKeplr, signKeplrChallenge, getWalletNonce, linkWallet, getMyWallets, claimPage, refresh, onClose]) {
    m.mockReset();
  }
  connectKeplr.mockResolvedValue({ address: "cosmos1abc", chainId: "cosmoshub-4", chainSlug: "cosmos" });
  getWalletNonce.mockResolvedValue({ message: "Sign this", nonce: "n", expires_at: "" });
  signKeplrChallenge.mockResolvedValue({ signature: "c2ln", pubKey: "cHVi" });
  linkWallet.mockResolvedValue({ wallet_link_id: 9, chain_slug: "cosmos", chain_name: "Cosmos Hub", address: "cosmos1abc" });
  claimPage.mockResolvedValue({ ok: true });
  getMyWallets.mockResolvedValue({ items: [] });
  client = new QueryClient();
});
afterEach(() => cleanup());

function renderFlow() {
  return render(
    <QueryClientProvider client={client}>
      <ClaimFlow pageId={7} pageName="Atlas Validator" target={TARGET} onClose={onClose} />
    </QueryClientProvider>,
  );
}


describe("M-cl2 — wallet errors at the connect step", () => {
  it("not installed: the reason, phone guidance, and a link to get the wallet", async () => {
    const { KeplrUnavailableError } = await vi.importActual<typeof KeplrModule>("@/lib/wallet/keplr");
    connectKeplr.mockRejectedValue(new KeplrUnavailableError());
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /I AM THE OPERATOR/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't installed in this browser/);
    expect(screen.getByRole("alert")).toHaveTextContent(/On a phone, open this page in your wallet app/);
    const link = screen.getByRole("link", { name: /Get Keplr/ });
    expect(link).toHaveAttribute("href", "https://www.keplr.app/get");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("a declined connect prompt says so, and offers no install link", async () => {
    const { KeplrUserRejectedError } = await vi.importActual<typeof KeplrModule>("@/lib/wallet/keplr");
    connectKeplr.mockRejectedValue(new KeplrUserRejectedError("connect"));
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /I AM THE OPERATOR/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You declined the wallet connection.");
    expect(screen.queryByRole("link", { name: /Get / })).toBeNull();
  });
});

describe("M-cl6 — dialog buttons are 44px targets", () => {
  it("primary and secondary buttons carry min-h-[44px]", () => {
    renderFlow();
    expect(screen.getByRole("button", { name: /I AM THE OPERATOR/ })).toHaveClass("min-h-[44px]");
    expect(screen.getByRole("button", { name: /CANCEL/ })).toHaveClass("min-h-[44px]");
  });
});
