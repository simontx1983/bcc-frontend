/**
 * ClaimFlow — `claim_started` / `claim_completed` carry `{ chain }` only.
 *
 * Started when the operator commits to the attempt; completed only after
 * `claimPage(...)` resolves. No page id, entity id, page name or address
 * may ride along. Mocks copied from claim-flow-cosmos.test.tsx.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

const capture = vi.fn();
vi.mock("@/lib/analytics/posthog", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  captureAnalyticsEvent: (...a: unknown[]) => capture(...a),
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
  capture.mockReset();
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

const sent = (name: string) => capture.mock.calls.filter((c) => c[0] === name).map((c) => c[1] as unknown);

describe("ClaimFlow analytics", () => {
  it("sends claim_started then claim_completed, each with { chain } only", async () => {
    await runToSign();
    await screen.findByText(/is yours\./);

    expect(sent("claim_started")).toEqual([{ chain: "cosmos" }]);
    expect(sent("claim_completed")).toEqual([{ chain: "cosmos" }]);
    const order = capture.mock.calls.map((c) => c[0]);
    expect(order).toEqual(["claim_started", "claim_completed"]);
    const raw = JSON.stringify(capture.mock.calls);
    for (const leak of [ADDRESS, "Atlas", "42", "\"7\"", "validator"]) {
      expect(raw).not.toContain(leak);
    }
  });

  it("claim_started fires before the wallet is connected", () => {
    render(<ClaimFlow pageId={7} pageName="Atlas Validator" target={TARGET} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /I AM THE OPERATOR/ }));
    expect(sent("claim_started")).toEqual([{ chain: "cosmos" }]);
  });

  it("no claim_completed when the claim call fails", async () => {
    claimPage.mockRejectedValue(new BccApiError("bcc_forbidden", "raw", 403, null));
    await runToSign();
    await screen.findByRole("alert");
    expect(sent("claim_started")).toHaveLength(1);
    expect(sent("claim_completed")).toEqual([]);
  });

  it("no claim_completed when the wallet link fails", async () => {
    linkWallet.mockRejectedValue(new BccApiError("bcc_forbidden", "raw", 403, null));
    await runToSign();
    await screen.findByRole("alert");
    expect(claimPage).not.toHaveBeenCalled();
    expect(sent("claim_completed")).toEqual([]);
  });
});
