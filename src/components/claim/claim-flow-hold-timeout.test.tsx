/**
 * Follow-up to #259 (review Medium): the close-hold had no escape. Some
 * extensions leave a request queued when their popup is dismissed instead
 * of rejecting (a dismissed polkadot-js signRaw), so the sign promise never
 * settles, `pending` stays true and every exit stayed disabled until a
 * reload. Now:
 *   - wallet calls race a 90s timeout that lands on the error state with
 *     a retry, and an abandoned request that resolves later changes nothing;
 *   - after 30s in flight the step offers CLOSE ANYWAY (which refreshes);
 *   - an in-step error moves focus to the new primary button;
 *   - a link-step bcc_conflict (wallet on another account) offers a
 *     different wallet, not a re-sign;
 *   - a claim refused because the account is suspended is final.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function renderFlow() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ClaimFlow pageId={7} pageName="Atlas Validator" target={TARGET} onClose={onClose} />
    </QueryClientProvider>,
  );
}

/** Drain pending microtasks (resolved mocks) under fake timers. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function toSignStep() {
  renderFlow();
  fireEvent.click(screen.getByRole("button", { name: /I AM THE OPERATOR/ }));
  await flush();
  return screen.getByRole("button", { name: "SIGN MESSAGE" });
}

describe("a wallet that never answers", () => {
  it("offers CLOSE ANYWAY after 30s, and closing then refreshes", async () => {
    vi.useFakeTimers();
    signKeplrChallenge.mockReturnValue(new Promise(() => undefined));
    fireEvent.click(await toSignStep());
    await flush();
    expect(screen.getByRole("button", { name: "CANCEL" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    const closeAnyway = screen.getByRole("button", { name: "CLOSE ANYWAY" });
    expect(closeAnyway).toBeEnabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
    expect(screen.getByText(/Still waiting on Keplr/)).toBeInTheDocument();

    fireEvent.click(closeAnyway);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("times out at 90s onto the error state with a retry; a late answer changes nothing", async () => {
    vi.useFakeTimers();
    let resolveLate: (v: unknown) => void = () => undefined;
    signKeplrChallenge.mockReturnValue(new Promise((r) => { resolveLate = r; }));
    fireEvent.click(await toSignStep());
    await flush();

    await act(async () => {
      vi.advanceTimersByTime(90_000);
    });
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("Your wallet didn't respond");
    const retry = screen.getByRole("button", { name: "RETRY SIGNATURE" });
    expect(retry).toBeEnabled();
    expect(document.activeElement).toBe(retry);

    // The abandoned request answering later must not link or claim.
    resolveLate({ signature: "late", pubKey: "late" });
    await flush();
    expect(linkWallet).not.toHaveBeenCalled();
    expect(claimPage).not.toHaveBeenCalled();
  });
});

describe("a closed or superseded attempt never finishes out of sight", () => {
  it("CLOSE ANYWAY, then approving in the wallet: no link, no claim", async () => {
    vi.useFakeTimers();
    let approveLate: (v: unknown) => void = () => undefined;
    signKeplrChallenge.mockReturnValue(new Promise((r) => { approveLate = r; }));
    fireEvent.click(await toSignStep());
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "CLOSE ANYWAY" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // The user approves in the still-open wallet, inside the 90s window.
    approveLate({ signature: "late", pubKey: "late" });
    await flush();
    await flush();
    expect(linkWallet).not.toHaveBeenCalled();
    expect(claimPage).not.toHaveBeenCalled();
  });

  it("RETRY after a timeout, then the old request answers: ignored", async () => {
    vi.useFakeTimers();
    let approveOld: (v: unknown) => void = () => undefined;
    signKeplrChallenge.mockReturnValueOnce(new Promise((r) => { approveOld = r; }));
    fireEvent.click(await toSignStep());
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(90_000);
    });
    await flush();

    // The retry's own wallet request stays open.
    signKeplrChallenge.mockReturnValueOnce(new Promise(() => undefined));
    fireEvent.click(screen.getByRole("button", { name: "RETRY SIGNATURE" }));
    await flush();
    approveOld({ signature: "old", pubKey: "old" });
    await flush();
    await flush();
    expect(linkWallet).not.toHaveBeenCalled();
    expect(claimPage).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "SIGNING…" })).toBeInTheDocument();
  });

  it("closed while the link POST is in flight: the claim is never sent", async () => {
    vi.useFakeTimers();
    let finishLink: (v: unknown) => void = () => undefined;
    linkWallet.mockReturnValue(new Promise((r) => { finishLink = r; }));
    fireEvent.click(await toSignStep());
    await flush();
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "CLOSE ANYWAY" }));
    finishLink({ wallet_link_id: 9, chain_slug: "cosmos", chain_name: "Cosmos Hub", address: "cosmos1abc" });
    await flush();
    await flush();
    expect(claimPage).not.toHaveBeenCalled();
  });
});

describe("refusals a re-sign cannot fix", () => {
  it("a wallet linked to another account offers a different wallet", async () => {
    linkWallet.mockRejectedValue(new BccApiError("bcc_conflict", "x", 409, null));
    fireEvent.click(await toSignStep());
    await flush();
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent(/linked to a different BCC account/);
    expect(screen.queryByRole("button", { name: "RETRY SIGNATURE" })).toBeNull();
    const other = screen.getByRole("button", { name: "USE A DIFFERENT WALLET" });
    expect(document.activeElement).toBe(other);
  });

  it("a suspended account is final, with its own copy", async () => {
    claimPage.mockRejectedValue(
      new BccApiError("bcc_forbidden", "x", 403, {
        error: { code: "bcc_forbidden", message: "x", data: { reason: "suspended" } },
      } as never),
    );
    fireEvent.click(await toSignStep());
    await flush();
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent("Your account is suspended");
    expect(screen.queryByRole("button", { name: "USE A DIFFERENT WALLET" })).toBeNull();
    expect(screen.getByRole("button", { name: "CLOSE" })).toBeInTheDocument();
  });

  it.each([
    ["holder_not_owner", /doesn't make you its creator/],
    ["entity_not_bound", /isn't set up to be claimed this way/],
  ])("reason %s is final with its own copy", async (reason, copy) => {
    claimPage.mockRejectedValue(
      new BccApiError("bcc_forbidden", "x", 403, {
        error: { code: "bcc_forbidden", message: "x", data: { reason } },
      } as never),
    );
    fireEvent.click(await toSignStep());
    await flush();
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent(copy);
    expect(screen.queryByRole("button", { name: "USE A DIFFERENT WALLET" })).toBeNull();
    expect(screen.getByRole("button", { name: "CLOSE" })).toBeInTheDocument();
  });

  it("reason not_operator offers a different wallet", async () => {
    claimPage.mockRejectedValue(
      new BccApiError("bcc_forbidden", "x", 403, {
        error: { code: "bcc_forbidden", message: "x", data: { reason: "not_operator" } },
      } as never),
    );
    fireEvent.click(await toSignStep());
    await flush();
    await flush();
    expect(screen.getByRole("button", { name: "USE A DIFFERENT WALLET" })).toBeInTheDocument();
  });

  it("a bare bcc_forbidden (not the operator) still offers a different wallet", async () => {
    claimPage.mockRejectedValue(new BccApiError("bcc_forbidden", "x", 403, null));
    fireEvent.click(await toSignStep());
    await flush();
    await flush();
    expect(screen.getByRole("button", { name: "USE A DIFFERENT WALLET" })).toBeInTheDocument();
  });
});
