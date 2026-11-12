/**
 * UX scan 2026-11-12, claims H1–H3 (F-243):
 *   H1 — closing mid-signature did not cancel: the link and claim still
 *        landed out of sight and the page kept saying UNCLAIMED. Closing is
 *        now held while a request is in flight, and closing after anything
 *        landed refreshes the page.
 *   H2 — after the server refused the address as the operator, the only
 *        action was RETRY SIGNATURE with the same address (fails again, and
 *        spends the claim rate limit). It now offers a different wallet; an
 *        already-claimed page is final.
 *   H3 — focus fell to <body> on every step change and success was silent.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { BccApiError } from "@/lib/api/types";

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

describe("H1 — closing while a request is in flight", () => {
  it("ESC and the close button are held while signing; nothing closes", async () => {
    claimPage.mockReturnValue(new Promise(() => undefined));
    fireEvent.click(await toSignStep());
    await screen.findByRole("button", { name: "SIGNING…" });

    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "CANCEL" })).toBeDisabled();
  });

  it("closing after a link landed refreshes the page, even though the claim failed", async () => {
    claimPage.mockRejectedValue(new BccApiError("bcc_forbidden", "x", 403, null));
    fireEvent.click(await toSignStep());
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "CANCEL" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closing before anything landed does not refresh", () => {
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: "CANCEL" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a successful link refreshes the wallet list and profile badges", async () => {
    const spy = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(await toSignStep());
    await screen.findByText(/is yours\./);
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining(['["me","wallets"]', '["user"]', '["users"]']));
  });
});

describe("H2 — what a claim refusal lets you do next", () => {
  it("not the operator: offers a different wallet, never a same-address retry", async () => {
    claimPage.mockRejectedValue(new BccApiError("bcc_forbidden", "x", 403, null));
    fireEvent.click(await toSignStep());
    expect(await screen.findByRole("alert")).toHaveTextContent(/Switch to the operator account/);
    expect(screen.queryByRole("button", { name: "RETRY SIGNATURE" })).toBeNull();

    connectKeplr.mockResolvedValue({ address: "cosmos1other", chainId: "cosmoshub-4", chainSlug: "cosmos" });
    fireEvent.click(screen.getByRole("button", { name: "USE A DIFFERENT WALLET" }));
    expect(await screen.findByRole("button", { name: "SIGN MESSAGE" })).toBeInTheDocument();
    expect(connectKeplr).toHaveBeenCalledTimes(2);
    expect(screen.getByText("cosmos1other")).toBeInTheDocument();
  });

  it("already claimed: final — CLOSE only, and closing refreshes the page", async () => {
    claimPage.mockRejectedValue(new BccApiError("bcc_conflict", "x", 409, null));
    fireEvent.click(await toSignStep());
    expect(await screen.findByRole("alert")).toHaveTextContent("already been claimed by another account");
    expect(screen.queryByRole("button", { name: "RETRY SIGNATURE" })).toBeNull();
    expect(screen.queryByRole("button", { name: "USE A DIFFERENT WALLET" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "CLOSE" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a transient claim failure still offers a retry", async () => {
    claimPage.mockRejectedValue(new BccApiError("bcc_rate_limited", "x", 429, null));
    fireEvent.click(await toSignStep());
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "RETRY SIGNATURE" })).toBeInTheDocument();
  });
});

describe("H3 — focus and announcements", () => {
  it("each step change moves focus to the new step's heading", async () => {
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /I AM THE OPERATOR/ }));
    await screen.findByRole("button", { name: "SIGN MESSAGE" });
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Sign the challenge" }));
  });

  it("success is announced as a status and focus lands on it", async () => {
    fireEvent.click(await toSignStep());
    const heading = await screen.findByRole("heading", { name: /is yours\./ });
    await act(async () => undefined);
    expect(document.activeElement).toBe(heading);
    expect(heading.closest('[role="status"]')).not.toBeNull();
  });

  it("the connect step says signing links the wallet to the account", async () => {
    connectKeplr.mockReturnValue(new Promise(() => undefined));
    renderFlow();
    fireEvent.click(screen.getByRole("button", { name: /I AM THE OPERATOR/ }));
    await waitFor(() => expect(screen.getByText(/adds this wallet to your BCC account/)).toBeInTheDocument());
  });
});
