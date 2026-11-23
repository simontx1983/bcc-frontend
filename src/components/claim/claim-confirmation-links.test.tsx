/**
 * F-320 (UX scan Lows): the claim confirmation's "what's next" lines.
 * The profile line used a handle that was always null (so it never
 * showed) and printed a path instead of a link; the announcement line
 * read like a dead link. Now: a real link to your profile, and the
 * announcement line says where.
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

async function toSignStep() {
  renderFlow();
  fireEvent.click(screen.getByRole("button", { name: /I AM THE OPERATOR/ }));
  return screen.findByRole("button", { name: "SIGN MESSAGE" });
}


describe("claim confirmation — what's next", () => {
  it("links to your profile and says where to post the first announcement", async () => {
    fireEvent.click(await toSignStep());
    // The confirmation's own marker (other steps also say "yours").
    expect(await screen.findByText("✓ VERIFIED")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visit your profile" })).toHaveAttribute("href", "/u/me");
    expect(screen.getByText(/Post your first announcement from this page.s Announcements tab\./)).toBeInTheDocument();
    expect(screen.queryByText(/\/u\/null/)).toBeNull();
  });
});
