/**
 * F-426: "link another wallet" on the recovery banner honours reduced motion.
 *
 * The banner's secondary action scrolls the Link-wallet form's chain
 * <select> into view and focuses it. That scroll passed
 * `behavior: "smooth"` unconditionally; it now asks the shared
 * usePrefersReducedMotion hook and passes "auto" (a jump) under
 * `prefers-reduced-motion: reduce`, staying smooth otherwise.
 *
 * The hook and the section run for real against a controllable
 * matchMedia; only the data hooks and the unrelated wallet-link
 * machinery are stubbed (the same seams account-wallets.test.tsx uses).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/wallet/linkFlow", () => ({
  runLinkFlow: vi.fn(),
  humanizeLinkError: () => "Wallet unavailable.",
}));
vi.mock("@/components/onchain/CollectionStancePanel", () => ({
  CollectionStancePanel: () => null,
}));
vi.mock("@/hooks/useWallets", () => ({
  MY_WALLETS_QUERY_KEY: ["bcc", "me", "wallets"],
  useMyWallets: () => ({
    data: {
      items: [
        {
          id: 11,
          chain_slug: "base",
          chain_name: "Base",
          wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
          verified: true,
          is_primary: true,
          created_at: "2026-08-01 10:00:00",
          explorer_url: "",
        },
      ],
      // No recovery email → the banner (and its "link another wallet") shows.
      recovery: { has_recovery_email: false, verified_wallet_count: 1 },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUnlinkWallet: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));
vi.mock("@/hooks/useRecoveryEmail", () => ({
  useRequestRecoveryEmail: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }),
  useVerifyRecoveryEmail: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }),
}));

import { WalletsSection } from "@/components/settings/WalletsSection";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

let reduce = false;
const listeners = new Set<(e: MediaQueryListEvent) => void>();
const scrollCalls: Array<{ el: Element; opts: ScrollIntoViewOptions | boolean | undefined }> = [];

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === REDUCE_QUERY && reduce;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = function (this: Element, opts?: ScrollIntoViewOptions | boolean) {
    scrollCalls.push({ el: this, opts });
  };
});

beforeEach(() => {
  reduce = false;
  scrollCalls.length = 0;
});

afterEach(() => {
  cleanup();
  listeners.clear();
});

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WalletsSection />
    </QueryClientProvider>,
  );
  return screen.getByRole("combobox", { name: "Chain" });
}

function linkAnotherWallet() {
  fireEvent.click(screen.getByRole("button", { name: /link another wallet/i }));
}

describe("WalletsSection — link another wallet under reduced motion (F-426)", () => {
  it("no preference: the scroll to the chain picker still glides (smooth) and focuses it", () => {
    const chain = renderSection();
    linkAnotherWallet();
    expect(scrollCalls).toHaveLength(1);
    expect(scrollCalls[0]?.el).toBe(chain);
    expect(scrollCalls[0]?.opts).toMatchObject({ block: "center", behavior: "smooth" });
    expect(document.activeElement).toBe(chain);
  });

  it("reduced motion: the scroll snaps (auto) and still focuses the chain picker", () => {
    reduce = true;
    const chain = renderSection();
    linkAnotherWallet();
    expect(scrollCalls).toHaveLength(1);
    expect(scrollCalls[0]?.el).toBe(chain);
    expect(scrollCalls[0]?.opts).toMatchObject({ block: "center", behavior: "auto" });
    expect(document.activeElement).toBe(chain);
  });

  it("turning reduced motion on while the page is open applies to the next scroll", () => {
    renderSection();
    linkAnotherWallet();
    act(() => {
      reduce = true;
      for (const cb of listeners) cb({ matches: true, media: REDUCE_QUERY } as MediaQueryListEvent);
    });
    linkAnotherWallet();
    expect(scrollCalls.map((c) => (c.opts as ScrollIntoViewOptions).behavior)).toEqual(["smooth", "auto"]);
  });
});
