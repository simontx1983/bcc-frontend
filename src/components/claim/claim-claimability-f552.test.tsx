/**
 * F-552: whether a validator page can be claimed is the SERVER's answer.
 *
 * Contract F-515: `claim_target.claimable` (+ `unclaimable_hint`, server
 * copy naming the chain) and `permissions.can_claim` (reason_code
 * `not_claimable`, checked first). The client chain allowlist
 * (lib/wallet/claim-support) is gone. An older backend sends neither
 * field, and then the claim route decides, as before.
 *
 * Hints are rendered verbatim: the Solana one is about to name a contact
 * address, so nothing here hard-codes chain copy.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as KeplrModule from "@/lib/wallet/keplr";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/v/atlas",
}));
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
vi.mock("@/lib/api/wallets-endpoints", () => ({ getMyWallets: (...a: unknown[]) => getMyWallets(...a) }));
const claimPage = vi.fn();
vi.mock("@/lib/api/pages-endpoints", () => ({ claimPage: (...a: unknown[]) => claimPage(...a) }));

import { ClaimCallout } from "@/components/claim/ClaimCallout";
import { ClaimFlow } from "@/components/claim/ClaimFlow";
import { claimabilityOf, UNCLAIMABLE_FALLBACK_COPY } from "@/components/claim/claimability";
import { BccApiError, type CardClaimTarget, type CardPermissionEntry } from "@/lib/api/types";

const HINT = "Solana validator pages can't be claimed yet. Email ops@example.test to have yours verified by hand.";
const COSMOS: CardClaimTarget = { entity_type: "validator", entity_id: 42, chain_slug: "cosmos" };
const UNCLAIMABLE: CardClaimTarget = {
  entity_type: "validator", entity_id: 43, chain_slug: "solana",
  claimable: false, unclaimable_reason_code: "solana_unsupported", unclaimable_hint: HINT,
};
const entry = (allowed: boolean, reason_code: string | null, unlock_hint: string | null): CardPermissionEntry =>
  ({ allowed, reason_code, unlock_hint }) as CardPermissionEntry;

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
  for (const m of [connectKeplr, signKeplrChallenge, getWalletNonce, linkWallet, getMyWallets, claimPage]) m.mockReset();
  connectKeplr.mockResolvedValue({ address: "cosmos1abc", chainId: "cosmoshub-4", chainSlug: "cosmos" });
  getWalletNonce.mockResolvedValue({ message: "Sign this", nonce: "n", expires_at: "" });
  signKeplrChallenge.mockResolvedValue({ signature: "c2ln", pubKey: "cHVi" });
  linkWallet.mockResolvedValue({ wallet_link_id: 9, chain_slug: "cosmos", chain_name: "Cosmos Hub", address: "cosmos1abc" });
  getMyWallets.mockResolvedValue({ items: [] });
});
afterEach(() => cleanup());

const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("claimabilityOf", () => {
  it("an older backend (no fields) leaves it to the claim route", () => {
    expect(claimabilityOf(COSMOS)).toEqual({ claimable: true, hint: null });
  });
  it("claimable: true is claimable", () => {
    expect(claimabilityOf({ ...COSMOS, claimable: true, unclaimable_hint: null })).toEqual({ claimable: true, hint: null });
  });
  it("claimable: false carries the server's hint, verbatim", () => {
    expect(claimabilityOf(UNCLAIMABLE)).toEqual({ claimable: false, hint: HINT });
  });
  it("can_claim not_claimable wins, even if claim_target is older", () => {
    expect(claimabilityOf(COSMOS, entry(false, "not_claimable", HINT))).toEqual({ claimable: false, hint: HINT });
  });
  it("no usable hint from the server falls back to one generic line", () => {
    expect(claimabilityOf({ ...COSMOS, claimable: false, unclaimable_hint: null }).hint).toBe(UNCLAIMABLE_FALLBACK_COPY);
    expect(claimabilityOf({ ...COSMOS, claimable: false, unclaimable_hint: "  " }).hint).toBe(UNCLAIMABLE_FALLBACK_COPY);
  });
  it("other can_claim refusals don't make the PAGE unclaimable", () => {
    expect(claimabilityOf(COSMOS, entry(false, "suspended", "Your account is suspended…")).claimable).toBe(true);
  });
});

describe("ClaimCallout renders the server's answer", () => {
  it("an unclaimable page shows the server's hint verbatim, and no claim button", () => {
    wrap(<ClaimCallout pageId={7} pageName="Atlas" target={UNCLAIMABLE} viewerAuthed canClaim={entry(false, "not_claimable", HINT)} />);
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /CLAIM THIS PAGE/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /SIGN IN TO CLAIM/ })).toBeNull();
  });

  it("an older backend (no fields) still offers the claim", () => {
    wrap(<ClaimCallout pageId={7} pageName="Atlas" target={COSMOS} viewerAuthed />);
    expect(screen.getByRole("button", { name: /CLAIM THIS PAGE/ })).toBeInTheDocument();
  });

  it("claimable for a signed-out visitor: sign in to claim", () => {
    wrap(<ClaimCallout pageId={7} pageName="Atlas" target={{ ...COSMOS, claimable: true }} viewerAuthed={false} canClaim={entry(false, "signin_required", "Sign in to claim this page.")} />);
    expect(screen.getByRole("link", { name: /SIGN IN TO CLAIM/ })).toBeInTheDocument();
  });

  it("a suspended member gets the server's line instead of the button", () => {
    wrap(<ClaimCallout pageId={7} pageName="Atlas" target={{ ...COSMOS, claimable: true }} viewerAuthed canClaim={entry(false, "suspended", "Your account is suspended, so you cannot claim pages.")} />);
    expect(screen.getByText("Your account is suspended, so you cannot claim pages.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /CLAIM THIS PAGE/ })).toBeNull();
  });

  it("can_claim not_applicable renders nothing", () => {
    const { container } = wrap(<ClaimCallout pageId={7} pageName="Atlas" target={COSMOS} viewerAuthed canClaim={entry(false, "not_applicable", null)} />);
    expect(container.textContent).toBe("");
  });
});

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

describe("ClaimFlow and not_claimable", () => {
  it("an unclaimable page stops at the wallet step with the hint, and asks no wallet", async () => {
    wrap(<ClaimFlow pageId={7} pageName="Atlas" target={{ ...UNCLAIMABLE, chain_slug: "cosmos" }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /I AM THE OPERATOR/ }));
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent(HINT);
    expect(connectKeplr).not.toHaveBeenCalled();
  });

  it("the claim route's not_claimable is FINAL: no other wallet, no retry", async () => {
    claimPage.mockRejectedValue(
      new BccApiError("bcc_forbidden", "RAW SERVER TEXT", 403, {
        error: { code: "bcc_forbidden", message: "RAW SERVER TEXT", data: { reason: "not_claimable", unclaimable_reason_code: "operator_unprovable" } },
      } as never),
    );
    wrap(<ClaimFlow pageId={7} pageName="Atlas" target={COSMOS} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /I AM THE OPERATOR/ }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "SIGN MESSAGE" }));
    await flush();
    await flush();
    // The card had no hint (an older card), so the generic line, never the error's text.
    expect(screen.getByRole("alert")).toHaveTextContent(UNCLAIMABLE_FALLBACK_COPY);
    expect(screen.getByRole("alert")).not.toHaveTextContent("RAW SERVER TEXT");
    expect(screen.queryByRole("button", { name: "USE A DIFFERENT WALLET" })).toBeNull();
    expect(screen.getByRole("button", { name: "CLOSE" })).toBeInTheDocument();
  });
});
